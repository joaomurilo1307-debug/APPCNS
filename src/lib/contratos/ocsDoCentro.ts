// Ordens de compra (OC) do Senior ligadas a centros de custo e a linhas de custo, para a Previsao (OC programada que ainda vai virar titulo) e
// para o "Ao vivo". Somente leitura. OC que ja gerou titulo nao entra aqui: ela aparece como o titulo, com a OC ao lado.

import type { prisma as prismaReal } from "@/lib/prisma";
import { codigoPeloNome } from "@/lib/custos/planoContas";
import type { OcDoCentro } from "./aoVivo";

type LinhaRateioOc = { codccu?: string; contaFinanceira?: string; valor?: number; perc?: number };

/** "1234 - Material" -> "1234"; "Material de escritório" -> codigo pelo nome, se existir no plano. */
export function codigoDaContaDaOc(texto: string | undefined | null): string | null {
  const t = (texto ?? "").trim();
  if (!t) return null;
  const m = /^(\d+)\b/.exec(t);
  if (m) return m[1];
  const c = codigoPeloNome(t);
  return c === null ? null : String(c);
}

export function linhasDaOc(oc: { codccu: string | null; temRateio: boolean; valor: number; rateioDetalhe: string | null }): { ccu: string; ctaFin: string | null; valor: number }[] | "ilegivel" {
  let det: LinhaRateioOc[] = [];
  if (oc.rateioDetalhe) {
    try {
      const j = JSON.parse(oc.rateioDetalhe);
      if (Array.isArray(j)) det = j as LinhaRateioOc[];
    } catch {
      /* cai no caso de baixo */
    }
  }
  if (!oc.temRateio) {
    if (!oc.codccu) return [];
    return [{ ccu: oc.codccu, ctaFin: codigoDaContaDaOc(det[0]?.contaFinanceira), valor: oc.valor }];
  }
  const linhas = det.filter((l) => l.codccu).map((l) => ({ ccu: String(l.codccu), ctaFin: codigoDaContaDaOc(l.contaFinanceira), valor: typeof l.valor === "number" ? l.valor : typeof l.perc === "number" ? Math.round(oc.valor * l.perc) / 100 : NaN }));
  if (linhas.length === 0 || linhas.some((l) => !Number.isFinite(l.valor))) return "ilegivel";
  return linhas;
}

const PISO_OC = new Date("2026-01-01T00:00:00.000Z"); // OCs encerradas antes de 2026 nao entram; as em andamento entram sempre

/**
 * OCs que ainda nao viraram titulo, uma por (OC x centro de custo). `soEmAndamento`: so' em analise/aprovadas e ainda nao pagas (Previsao);
 * senao inclui tambem as reprovadas/canceladas recentes e as ja marcadas como pagas (Ao vivo).
 */
export async function ocsAindaSemTitulo(db: typeof prismaReal, ocsVinculadas: ReadonlySet<string>, opcoes: { soEmAndamento: boolean }): Promise<{ itens: OcDoCentro[]; ilegiveis: number }> {
  const ocs = await db.aprovacaoSenior.findMany({
    where: opcoes.soEmAndamento ? { situacaoAtual: { in: ["ANA", "PRE", "APR"] }, pago: false } : { OR: [{ situacaoAtual: { in: ["ANA", "PRE", "APR"] } }, { dataEmissao: { gte: PISO_OC } }] },
    select: { numOcp: true, valor: true, situacaoAtual: true, dataEmissao: true, fornecedorNome: true, fornecedorCodigo: true, descricao: true, codccu: true, temRateio: true, rateioDetalhe: true, previsaoPagamento: true, pago: true },
  });
  const itens: OcDoCentro[] = [];
  let ilegiveis = 0;
  for (const oc of ocs) {
    if (ocsVinculadas.has(oc.numOcp)) continue; // ja aparece como titulo, com a OC ao lado
    const linhas = linhasDaOc(oc);
    if (linhas === "ilegivel") { ilegiveis += 1; continue; }
    for (const l of linhas) {
      itens.push({ numOcp: oc.numOcp, ccu: l.ccu, ctaFin: l.ctaFin, valor: l.valor, situacaoAtual: oc.situacaoAtual, dataEmissao: oc.dataEmissao.toISOString().slice(0, 10), fornecedor: oc.fornecedorNome ?? `código ${oc.fornecedorCodigo}`, descricao: oc.descricao, previsaoPagamento: oc.previsaoPagamento?.toISOString().slice(0, 10) ?? null, pago: oc.pago });
    }
  }
  return { itens, ilegiveis };
}
