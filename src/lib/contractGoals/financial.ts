// Indicadores do contrato leem a copia local ja usada nas telas financeiras.
// Nao gravam medições, nao sincronizam o Senior e nao concedem acesso financeiro por vinculo a projeto.
import { prisma } from "@/lib/prisma";
import { podeAcessarModulo } from "@/lib/acesso/servidor";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { consolidarFaturamento } from "@/lib/medicao/consolidado";
import type { DocConc } from "@/lib/medicao/conciliacao";
import { hojeBR } from "@/lib/financeiro/alertas";
import { somaMes } from "@/lib/medicao/competencia";

export type MetaComFonte = {
  id: string; source: string; sourceAccount?: string | null; periodStart?: string | null; periodEnd?: string | null;
  contrato: { codccu: string };
};
export type IndicadorFinanceiro = { valor: number | null; atualizadoEm: string | null; erro?: string };
type Usuario = { id: string; role: string };
type Dependencias = {
  db?: typeof prisma;
  podeAcessar?: typeof podeAcessarModulo;
  escopo?: Awaited<ReturnType<typeof escopoDeCustos>>;
  hoje?: string;
};
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const centavos = (valor: number) => Math.round(valor * 100) / 100;
const normalizarConta = (nome: string) => nome.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");

/** Um lote de consultas por fonte, mesmo quando varias metas compartilham o CCU. */
export async function lerIndicadoresFinanceiros(goals: readonly MetaComFonte[], usuario: Usuario, dependencias: Dependencias = {}): Promise<Map<string, IndicadorFinanceiro>> {
  const resultado = new Map<string, IndicadorFinanceiro>();
  const automaticas = goals.filter((g) => g.source !== "MANUAL");
  if (!automaticas.length) return resultado;
  const db = dependencias.db ?? prisma;
  const podeAcessar = dependencias.podeAcessar ?? podeAcessarModulo;
  const [acessoCusto, acessoMedicao, escopo] = await Promise.all([
    podeAcessar(usuario, "custos"), podeAcessar(usuario, "medicao"), dependencias.escopo ?? escopoDeCustos(db, usuario, "FINANCEIRO"),
  ]);
  const hoje = dependencias.hoje ?? hojeBR(), mesAtual = hoje.slice(0, 7);
  const validas: (MetaComFonte & { de: string; ate: string })[] = [];
  for (const goal of automaticas) {
    const negar = (erro: string) => resultado.set(goal.id, { valor: null, atualizadoEm: null, erro });
    const fonteValida = ["CUSTO", "FATURAMENTO", "MEDICAO"].includes(goal.source);
    if (!fonteValida) { negar("Fonte do indicador não reconhecida."); continue; }
    if (!podeVerCcu(escopo, goal.contrato.codccu) || !(goal.source === "CUSTO" ? acessoCusto : acessoMedicao)) {
      negar("Seu acesso financeiro não permite consultar este indicador."); continue;
    }
    const de = goal.periodStart ?? "", fim = goal.periodEnd ?? "";
    if (!MES.test(de) || !MES.test(fim) || de > fim || somaMes(de, 47) < fim) {
      negar("Defina o período do indicador, de até 48 meses."); continue;
    }
    if (de > mesAtual) { negar("O período de medição ainda não começou."); continue; }
    validas.push({ ...goal, de, ate: fim > mesAtual ? mesAtual : fim });
  }
  const custos = validas.filter((g) => g.source === "CUSTO");
  const medicoes = validas.filter((g) => g.source !== "CUSTO");
  await Promise.all([
    (async () => {
      if (!custos.length) return;
      try {
        const [registros, ultima] = await Promise.all([
          db.custoContaFinanceira.findMany({ where: { codccu: { in: [...new Set(custos.map((g) => g.contrato.codccu))] } }, select: { codccu: true, contaFinanceira: true, competencia: true, valor: true } }),
          db.atualizacaoCusto.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true } }),
        ]);
        for (const goal of custos) {
          const centro = registros.filter((r) => r.codccu === goal.contrato.codccu);
          const conta = goal.sourceAccount ? normalizarConta(goal.sourceAccount) : null;
          const linhas = conta ? centro.filter((r) => normalizarConta(r.contaFinanceira) === conta) : centro;
          if (!ultima?.finalizadoEm || !centro.length || (conta && !linhas.length)) {
            resultado.set(goal.id, { valor: null, atualizadoEm: ultima?.finalizadoEm?.toISOString() ?? null, erro: conta ? "Ainda não há dados sincronizados desta conta no contrato." : "Ainda não há custos sincronizados deste contrato." }); continue;
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
        const ccus = [...new Set(medicoes.map((g) => g.contrato.codccu))];
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
          const ccu = goal.contrato.codccu;
          if (!ultima?.finalizadoEm || !contratos.some((c) => c.codccu === ccu) || (goal.source === "FATURAMENTO" && erroFaturamento && !docs.some((d) => d.codccu === ccu))) {
            resultado.set(goal.id, { valor: null, atualizadoEm: ultima?.finalizadoEm?.toISOString() ?? null, erro: "Ainda não há uma leitura completa deste indicador para o contrato." }); continue;
          }
          const chave = `${ccu}|${goal.de}|${goal.ate}`;
          let resumo = cache.get(chave);
          if (!resumo) {
            resumo = consolidarFaturamento({ contratos, itens: itensConc, docs: documentos, ccusPermitidos: new Set([ccu]), de: goal.de, ate: goal.ate, hoje });
            cache.set(chave, resumo);
          }
          resultado.set(goal.id, { valor: goal.source === "FATURAMENTO" ? resumo.totais.faturado : resumo.totais.medido, atualizadoEm: ultima.finalizadoEm.toISOString(), ...(goal.source === "FATURAMENTO" && erroFaturamento ? { erro: "A última leitura de notas falhou; valor da leitura anterior." } : {}) });
        }
      } catch {
        for (const goal of medicoes) resultado.set(goal.id, { valor: null, atualizadoEm: null, erro: "Não foi possível consultar o indicador. Os valores anteriores não foram alterados." });
      }
    })(),
  ]);
  return resultado;
}
