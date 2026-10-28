// Receita de cada centro de custo, mes a mes, pela MESMA conciliacao da aba Receita e Medicao (conciliacao.ts) e do faturamento consolidado (consolidado.ts):
// cada centro entra uma vez; o pedido pertence ao contrato (nao ao CC do rateio); a nota pertence ao CC principal do contrato. So' calculo sobre a copia local do Senior.

import { conciliar, type DocConc, type ItemConc } from "../medicao/conciliacao";
import type { ContratoConsolidado, ItemConsolidado } from "../medicao/consolidado";

export type ReceitaDoMes = { mes: string; receita: number; retencoes: number; nf: number; nd: number; semNota: number; faturado: number };
export type ReceitaPorCentro = Map<string, ReceitaDoMes[]>;

/** Receita de cada centro permitido entre `de` e `ate` (aaaa-mm). Meses sem movimento vem zerados: o resultado sempre tem os mesmos meses. */
export function receitaPorCentro({ contratos, itens, docs, ccusPermitidos, de, ate, hoje }: {
  contratos: ReadonlyArray<ContratoConsolidado>;
  itens: ReadonlyArray<ItemConsolidado>;
  docs: ReadonlyArray<DocConc>;
  ccusPermitidos: ReadonlySet<string>;
  de: string;
  ate: string;
  hoje: string;
}): ReceitaPorCentro {
  const centroDoContrato = new Map<string, string>();
  const centros = new Set<string>();
  for (const c of contratos) {
    if (!c.codccu || !ccusPermitidos.has(c.codccu)) continue;
    centroDoContrato.set(c.numCtr, c.codccu);
    centros.add(c.codccu);
  }
  const itensPorCentro = new Map<string, ItemConc[]>();
  for (const item of itens) {
    const centro = centroDoContrato.get(item.numCtr);
    if (!centro) continue;
    (itensPorCentro.get(centro) ?? itensPorCentro.set(centro, []).get(centro)!).push(item);
  }
  const docsPorCentro = new Map<string, DocConc[]>();
  for (const doc of docs) {
    if (!doc.codccu || !centros.has(doc.codccu)) continue;
    (docsPorCentro.get(doc.codccu) ?? docsPorCentro.set(doc.codccu, []).get(doc.codccu)!).push(doc);
  }
  const saida: ReceitaPorCentro = new Map();
  for (const centro of centros) {
    // nao recorta antes de conciliar: uma nota de outro mes pode pertencer ao pedido do periodo
    const c = conciliar(itensPorCentro.get(centro) ?? [], docsPorCentro.get(centro) ?? [], [], de, ate, hoje);
    saida.set(centro, c.meses.map((m) => ({ mes: m.mes, receita: m.receita, retencoes: m.retencoes, nf: m.nf, nd: m.nd, semNota: m.semNota, faturado: m.faturado })));
  }
  return saida;
}

/** Alinha a receita de um centro aos `meses` da tela (mes sem registro = zero). */
export function alinharAosMeses(receita: ReadonlyArray<ReceitaDoMes> | undefined, meses: ReadonlyArray<string>) {
  const porMes = new Map((receita ?? []).map((r) => [r.mes, r]));
  const col = (f: (r: ReceitaDoMes) => number) => meses.map((m) => (porMes.has(m) ? f(porMes.get(m)!) : 0));
  return { receita: col((r) => r.receita), retencoes: col((r) => r.retencoes), semNota: col((r) => r.semNota), nf: col((r) => r.nf), nd: col((r) => r.nd) };
}
