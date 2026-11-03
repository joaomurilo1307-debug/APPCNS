// Leitura do banco para o "Pagos / semana" (ver pagosPorDia.ts). SOMENTE LEITURA. Junta o que o sistema ja sincroniza do Senior:
//   1) as BAIXAS (CustoFinanceiroDetalhe: baixa 90550 + 90558 por centro de custo, a mesma base e regra do Custo por Contrato, ja conferida com o Rel114) =
//      o que o Senior confirma como PAGO;
//   2) os retornos do Itau (RemessaItemPagamento com status PAGO) cruzados com os titulos que continuam em aberto no Senior: pago pelo banco, falta a baixa;
//   3) a OC de cada titulo e as aprovacoes dela (mesmo vinculo titulo-OC do "Ao vivo" e da Programacao de Pagamento).
// SO' APARECE O QUE FOI PAGO (decisao do Joao, 03/11/2026): titulo programado, enviado ao banco sem retorno, agendado, rejeitado ou cancelado NAO entra na tabela.

import type { prisma as prismaReal } from "@/lib/prisma";
import { nomeConta } from "@/lib/custos/planoContas";
import { lancamentosDeTitulos } from "./titulosPrevistos";
import { ehContaForaDoCusto } from "./previsao";
import { situacaoLabel } from "@/lib/vinculoOcTitulo";
import { aprovacoesDoHistorico, arred, type EvidenciaBanco, type OcDoPagamento, type Pagamento, type ParteDoPagamento, type SituacaoPago } from "./pagosPorDia";

export type DadosPagos = {
  pagamentos: Pagamento[];
  ocs: Map<string, OcDoPagamento>;
  atualizadoEm: { custo: string | null; titulos: string | null };
};

const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
const chaveTitulo = (numTit: string, codFor: string, tipo: string | null | undefined) => `${numTit}|${codFor}|${tipo ?? ""}`;

/** Primeiro dia do mes seguinte, em aaaa-mm-dd (UTC). */
function mesSeguinte(mes: string): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

type ItemRemessa = { tituloId: string | null; status: string; dataPagamento: Date; dataEfetivacao: Date | null; valorEfetivado: number | null; baixaSeniorStatus: string | null; baixaSeniorMsg: string | null; criadoEm: Date; remessa: { criadoEm: Date } };
export type SituacaoDoTitulo = { situacao: Extract<SituacaoPago, "pago_banco" | "enviado_banco">; evidencia: EvidenciaBanco } | { situacao: "descartado" };

/**
 * PURA: o que as remessas geradas e os retornos dizem de UM titulo. `itens` ja vem so' das remessas geradas (nao rascunho), do mais novo para o mais antigo.
 *   - algum item PAGO (o retorno do banco confirmou) -> pago_banco, na data efetiva;
 *   - senao, o item mais novo PENDENTE ou AGENDADO -> enviado_banco (remessa gerada, sem retorno), na data do pagamento do arquivo;
 *   - senao, so' REJEITADO/CANCELADO -> descartado (o banco nao pagou);
 *   - sem item nenhum -> null (o chamador trata como so' programado).
 */
export function situacaoPelaRemessa(itens: ItemRemessa[]): SituacaoDoTitulo | null {
  if (itens.length === 0) return null;
  const evidencia = (i: ItemRemessa): EvidenciaBanco => ({
    status: i.status, data: dia(i.status === "PAGO" ? i.dataEfetivacao ?? i.dataPagamento : i.dataPagamento), remessaEm: dia(i.remessa.criadoEm), valorEfetivado: i.valorEfetivado,
    baixaSenior: i.baixaSeniorStatus, baixaSeniorMsg: i.baixaSeniorMsg,
  });
  const pago = itens.find((i) => i.status === "PAGO");
  if (pago) return { situacao: "pago_banco", evidencia: evidencia(pago) };
  const enviado = itens.find((i) => i.status === "PENDENTE" || i.status === "AGENDADO");
  if (enviado) return { situacao: "enviado_banco", evidencia: evidencia(enviado) };
  return { situacao: "descartado" };
}

export async function carregarPagos(db: typeof prismaReal, mes: string, hoje: string): Promise<DadosPagos> {
  const de = new Date(`${mes}-01T00:00:00.000Z`);
  const ate = new Date(`${mesSeguinte(mes)}T00:00:00.000Z`);

  const [baixas, { itens }, itensRemessa, ultimoCusto, ultimoTitulo] = await Promise.all([
    db.custoFinanceiroDetalhe.findMany({
      where: { dataPagamento: { gte: de, lt: ate } },
      select: { codccu: true, contaFinanceira: true, numTit: true, codFor: true, codTpt: true, fornecedorNome: true, dataPagamento: true, dataVencimento: true, valorRateado: true, baixa: true },
    }),
    lancamentosDeTitulos(db, { somenteAbertos: false }),
    db.remessaItemPagamento.findMany({
      where: { tituloId: { not: null }, status: "PAGO", remessa: { status: { in: ["GERADO", "RETORNO_PROCESSADO"] } } }, // so' o que o retorno do banco confirmou como pago
      orderBy: { criadoEm: "desc" },
      select: { tituloId: true, status: true, dataPagamento: true, dataEfetivacao: true, valorEfetivado: true, baixaSeniorStatus: true, baixaSeniorMsg: true, criadoEm: true, remessa: { select: { criadoEm: true } } },
    }),
    db.atualizacaoCusto.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true } }),
    db.tituloContasAPagar.aggregate({ _max: { atualizadoEm: true } }),
  ]);

  // OC de cada titulo (mesmo vinculo do Ao vivo): chave titulo|fornecedor|tipo -> numOcp
  const ocDoTitulo = new Map<string, string>();
  for (const i of itens) {
    const n = i.numOcpVinculada ?? i.numOcp;
    if (n) ocDoTitulo.set(chaveTitulo(i.numTit, i.codFor, i.tipo), n);
  }

  // ---- 1) baixas do mes, agrupadas por titulo + fornecedor + tipo + dia da baixa
  type Grupo = { pagamento: Pagamento; partes: ParteDoPagamento[]; todasAdiantamento: boolean };
  const grupos = new Map<string, Grupo>();
  for (const b of baixas) {
    const data = dia(b.dataPagamento);
    if (!data) continue;
    const chave = `${chaveTitulo(b.numTit, b.codFor, b.codTpt)}|${data}`;
    let g = grupos.get(chave);
    if (!g) {
      g = {
        partes: [], todasAdiantamento: true,
        pagamento: { chave, situacao: "pago", forma: "pagamento", data, numTit: b.numTit, tipo: b.codTpt, codFor: b.codFor, fornecedor: b.fornecedorNome ?? `código ${b.codFor}`, vencimento: dia(b.dataVencimento), partes: [], numOcp: ocDoTitulo.get(chaveTitulo(b.numTit, b.codFor, b.codTpt)) ?? null, remessa: null },
      };
      grupos.set(chave, g);
    }
    g.partes.push({ ccu: b.codccu, conta: b.contaFinanceira, valor: b.valorRateado });
    if (b.baixa !== "ADIANTAMENTO") g.todasAdiantamento = false;
  }
  const pagamentos: Pagamento[] = [];
  for (const g of grupos.values()) {
    g.pagamento.partes = g.partes.map((x) => ({ ...x, valor: arred(x.valor) })); // cada linha de rateio como veio do Senior, no centavo
    g.pagamento.forma = g.todasAdiantamento ? "adiantamento" : "pagamento";
    pagamentos.push(g.pagamento);
  }

  // ---- 2) titulo ainda em aberto no Senior que o retorno do Itau confirmou como PAGO (falta a baixa): so' esse, na data efetiva do pagamento
  const remessaPorTitulo = new Map<string, ItemRemessa[]>();
  for (const r of itensRemessa) if (r.tituloId) (remessaPorTitulo.get(r.tituloId) ?? remessaPorTitulo.set(r.tituloId, []).get(r.tituloId))!.push(r);
  const abertos = new Map<string, { base: (typeof itens)[number]; partes: ParteDoPagamento[] }>();
  for (const i of itens) {
    if (i.pago || i.tipo === "PRV" || !i.ccu || ehContaForaDoCusto(i.ctaFin) || i.valorAberto <= 0 || !remessaPorTitulo.has(i.id)) continue;
    let a = abertos.get(i.id);
    if (!a) {
      a = { base: i, partes: [] };
      abertos.set(i.id, a);
    }
    a.partes.push({ ccu: i.ccu, conta: i.ctaFin ? nomeConta(i.ctaFin) ?? `Conta ${i.ctaFin}` : "Sem linha de custo", valor: i.valorAberto });
  }
  for (const [id, a] of abertos) {
    const pelaRemessa = situacaoPelaRemessa(remessaPorTitulo.get(id) ?? []);
    if (pelaRemessa?.situacao !== "pago_banco") continue;
    const t = a.base;
    const data = pelaRemessa.evidencia.data;
    if (!data || data.slice(0, 7) !== mes || data > hoje) continue;
    pagamentos.push({
      chave: `${chaveTitulo(t.numTit, t.codFor, t.tipo)}|${data}|pago_banco`, situacao: "pago_banco", forma: null, data, numTit: t.numTit, tipo: t.tipo, codFor: t.codFor,
      fornecedor: t.fornecedorNome ?? `código ${t.codFor}`, vencimento: t.vencimento, partes: a.partes.map((x) => ({ ...x, valor: arred(x.valor) })), numOcp: t.numOcpVinculada ?? t.numOcp ?? null, remessa: pelaRemessa.evidencia,
    });
  }

  // ---- 3) OCs ligadas: situacao + aprovacoes (nome do aprovador: conta do sistema quando ha, senao o nome do Senior)
  const numerosOc = Array.from(new Set(pagamentos.map((p) => p.numOcp).filter((n): n is string => !!n)));
  const [aprovacoes, usuarios] = numerosOc.length
    ? await Promise.all([
        db.aprovacaoSenior.findMany({ where: { numOcp: { in: numerosOc } }, select: { numOcp: true, situacaoAtual: true, historicoNiveis: true } }),
        db.usuarioSenior.findMany({ select: { codigo: true, nome: true, user: { select: { name: true } } } }),
      ])
    : [[], []];
  const nomePorCod = new Map(usuarios.map((u) => [u.codigo, u.user?.name || u.nome]));
  const ocs = new Map<string, OcDoPagamento>();
  for (const a of aprovacoes) {
    ocs.set(a.numOcp, {
      rotulo: situacaoLabel(a.situacaoAtual).replace(" (pendente)", ""),
      situacao: a.situacaoAtual,
      aprovacoes: aprovacoesDoHistorico(a.historicoNiveis, (cod) => nomePorCod.get(cod) ?? `Usuário Senior #${cod}`),
    });
  }

  return { pagamentos, ocs, atualizadoEm: { custo: ultimoCusto?.finalizadoEm?.toISOString() ?? null, titulos: ultimoTitulo._max.atualizadoEm?.toISOString() ?? null } };
}
