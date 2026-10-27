// Indicadores do contrato leem a copia local ja usada nas telas financeiras.
// Nao gravam medições, nao sincronizam o Senior e nao concedem acesso financeiro por vinculo a projeto.
import { prisma } from "@/lib/prisma";
import { podeAcessarModulo } from "@/lib/acesso/servidor";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { consolidarFaturamento } from "@/lib/medicao/consolidado";
import type { DocConc } from "@/lib/medicao/conciliacao";
import { hojeBR } from "@/lib/financeiro/alertas";
import { somaMes } from "@/lib/medicao/competencia";
import { COMPETENCIA_PISO } from "@/lib/custos/motorCustoContrato";

export type MetaComFonte = {
  id: string; source: string; sourceAccount?: string | null; periodStart?: string | null; periodEnd?: string | null;
  sourceCcu?: string | null; contrato?: { codccu: string } | null;
};
export type IndicadorFinanceiro = { valor: number | null; atualizadoEm: string | null; erro?: string };
export type UsuarioIndicador = { id: string; role: string };
export type DependenciasIndicador = {
  db?: typeof prisma;
  podeAcessar?: typeof podeAcessarModulo;
  escopo?: Awaited<ReturnType<typeof escopoDeCustos>>;
  hoje?: string;
};
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const centavos = (valor: number) => Math.round(valor * 100) / 100;
const normalizarConta = (nome: string) => nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
const erroCobertura = "A última sincronização ainda não cobre o fechamento deste período. Aguarde uma nova leitura do Senior.";
function leituraCobrePeriodo(fim: string, mesAtual: string, finalizadoEm: Date): boolean {
  const mesDaLeitura = finalizadoEm.toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  return fim <= mesDaLeitura && (fim === mesAtual || fim < mesDaLeitura);
}

/** Um lote de consultas por fonte, mesmo quando varias metas compartilham o CCU. */
export async function lerIndicadoresFinanceiros(goals: readonly MetaComFonte[], usuario: UsuarioIndicador, dependencias: DependenciasIndicador = {}): Promise<Map<string, IndicadorFinanceiro>> {
  const resultado = new Map<string, IndicadorFinanceiro>();
  const automaticas = goals.filter((g) => g.source !== "MANUAL");
  if (!automaticas.length) return resultado;
  const db = dependencias.db ?? prisma;
  const podeAcessar = dependencias.podeAcessar ?? podeAcessarModulo;
  const [acessoCusto, acessoMedicao, escopo] = await Promise.all([
    podeAcessar(usuario, "custos"), podeAcessar(usuario, "medicao"), dependencias.escopo ?? escopoDeCustos(db, usuario, "FINANCEIRO"),
  ]);
  const hoje = dependencias.hoje ?? hojeBR(), mesAtual = hoje.slice(0, 7);
  const validas: (MetaComFonte & { de: string; ate: string; ccu: string })[] = [];
  for (const goal of automaticas) {
    const negar = (erro: string) => resultado.set(goal.id, { valor: null, atualizadoEm: null, erro });
    const fonteValida = ["CUSTO", "FATURAMENTO", "MEDICAO"].includes(goal.source);
    if (!fonteValida) { negar("Fonte do indicador não reconhecida."); continue; }
    const ccu = goal.sourceCcu || goal.contrato?.codccu;
    if (!ccu || !podeVerCcu(escopo, ccu) || !(goal.source === "CUSTO" ? acessoCusto : acessoMedicao)) {
      negar("Seu acesso financeiro não permite consultar este indicador."); continue;
    }
    const de = goal.periodStart ?? "", fim = goal.periodEnd ?? "";
    if (!MES.test(de) || !MES.test(fim) || de > fim || somaMes(de, 47) < fim) {
      negar("Defina o período do indicador, de até 48 meses."); continue;
    }
    if (goal.source === "CUSTO" && de < COMPETENCIA_PISO) {
      negar("O histórico de custo pago está disponível a partir de " + COMPETENCIA_PISO + "."); continue;
    }
    if (de > mesAtual) { negar("O período de medição ainda não começou."); continue; }
    validas.push({ ...goal, ccu, de, ate: fim > mesAtual ? mesAtual : fim });
  }
  const custos = validas.filter((g) => g.source === "CUSTO");
  const medicoes = validas.filter((g) => g.source !== "CUSTO");
  await Promise.all([
    (async () => {
      if (!custos.length) return;
      try {
        const [registros, ultima] = await Promise.all([
          db.custoContaFinanceira.findMany({ where: { codccu: { in: [...new Set(custos.map((g) => g.ccu))] } }, select: { codccu: true, contaFinanceira: true, competencia: true, valor: true } }),
          db.atualizacaoCusto.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true } }),
        ]);
        for (const goal of custos) {
          const centro = registros.filter((r) => r.codccu === goal.ccu);
          const conta = goal.sourceAccount ? normalizarConta(goal.sourceAccount) : null;
          const linhas = conta ? centro.filter((r) => normalizarConta(r.contaFinanceira) === conta) : centro;
          if (!ultima?.finalizadoEm || !centro.length || (conta && !linhas.length)) {
            resultado.set(goal.id, { valor: null, atualizadoEm: ultima?.finalizadoEm?.toISOString() ?? null, erro: conta ? "Ainda não há dados sincronizados desta conta no contrato." : "Ainda não há custos sincronizados deste contrato." }); continue;
          }
          // Uma sincronização dentro de um mês ainda aberto não prova seu fechamento.
          // Sem cobertura, ausência de linhas é dado pendente, e não redução de custo a zero.
          if (!leituraCobrePeriodo(goal.ate, mesAtual, ultima.finalizadoEm)) {
            resultado.set(goal.id, { valor: null, atualizadoEm: ultima.finalizadoEm.toISOString(), erro: erroCobertura }); continue;
          }
          const valor = centavos(linhas.filter((r) => { const mes = r.competencia.toISOString().slice(0, 7); return mes >= goal.de && mes <= goal.ate; }).reduce((s, r) => s + r.valor, 0));
          resultado.set(goal.id, { valor, atualizadoEm: ultima.finalizadoEm.toISOString() });
        }
      } catch {
        for (const goal of custos) resultado.set(goal.id, { valor: null, atualizadoEm: null, erro: "Não foi possível consultar o custo. Os valores anteriores não foram alterados." });
      }
    })(),
    (async () => {
      if (!medicoes.length) return;
      try {
        const ccus = [...new Set(medicoes.map((g) => g.ccu))];
        const [contratos, docs, ultima] = await Promise.all([
          db.medicaoContrato.findMany({ where: { codccu: { in: ccus } }, select: { numCtr: true, codccu: true } }),
          db.faturamentoMedicao.findMany({ where: { codccu: { in: ccus } } }),
          db.atualizacaoMedicao.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true, resumo: true } }),
        ]);
        const itens = contratos.length ? await db.medicaoItem.findMany({ where: { numCtr: { in: contratos.map((c) => c.numCtr) } }, select: { numCtr: true, numPed: true, competencia: true, origem: true, boletim: true, situacao: true, qtd: true, valor: true, dataEmissao: true } }) : [];
        const documentos: DocConc[] = docs.map((d) => ({ ...d, tipo: d.tipo as "NF" | "ND", origem: d.origem as "PEDIDO" | "EMISSAO" | "ACUMULADO", dataEmissao: d.dataEmissao.toISOString().slice(0, 10), valorLiquido: d.valorLiquido > 0 ? d.valorLiquido : d.valor }));
        const itensConc = itens.map((i) => ({ ...i, dataEmissao: i.dataEmissao.toISOString().slice(0, 10) }));
        const cache = new Map<string, ReturnType<typeof consolidarFaturamento>>();
        const erroFaturamento = (ultima?.resumo as { faturamentoErro?: string } | null)?.faturamentoErro;
        for (const goal of medicoes) {
          const ccu = goal.ccu;
          if (!ultima?.finalizadoEm || !contratos.some((c) => c.codccu === ccu)) {
            resultado.set(goal.id, { valor: null, atualizadoEm: ultima?.finalizadoEm?.toISOString() ?? null, erro: "Ainda não há uma leitura completa deste indicador para o contrato." }); continue;
          }
          if (!leituraCobrePeriodo(goal.ate, mesAtual, ultima.finalizadoEm)) {
            resultado.set(goal.id, { valor: null, atualizadoEm: ultima.finalizadoEm.toISOString(), erro: erroCobertura }); continue;
          }
          if (goal.source === "FATURAMENTO" && erroFaturamento) {
            resultado.set(goal.id, { valor: null, atualizadoEm: ultima.finalizadoEm.toISOString(), erro: "A última leitura de faturamento falhou. Aguarde uma leitura completa antes de avaliar este indicador." }); continue;
          }
          const chave = `${ccu}|${goal.de}|${goal.ate}`;
          let resumo = cache.get(chave);
          if (!resumo) {
            resumo = consolidarFaturamento({ contratos, itens: itensConc, docs: documentos, ccusPermitidos: new Set([ccu]), de: goal.de, ate: goal.ate, hoje });
            cache.set(chave, resumo);
          }
          resultado.set(goal.id, { valor: goal.source === "FATURAMENTO" ? resumo.totais.faturado : resumo.totais.medido, atualizadoEm: ultima.finalizadoEm.toISOString() });
        }
      } catch {
        for (const goal of medicoes) resultado.set(goal.id, { valor: null, atualizadoEm: null, erro: "Não foi possível consultar o indicador. Os valores anteriores não foram alterados." });
      }
    })(),
  ]);
  return resultado;
}
