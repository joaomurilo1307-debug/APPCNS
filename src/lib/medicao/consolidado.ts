// Faturamento do portfolio: cada centro de custo entra uma vez, pela mesma conciliacao do detalhe.
// Apenas calcula sobre a copia local do Senior; nao consulta nem altera banco ou integracoes.

import { conciliar, type DocConc, type ItemConc } from "./conciliacao";
import { somaMes } from "./competencia";

export type ValoresConsolidados = {
  faturado: number; nf: number; nd: number; medido: number; semNota: number; receita: number;
};
export type MesConsolidado = ValoresConsolidados & { mes: string };
export type ResumoFaturamentoConsolidado = {
  meses: MesConsolidado[];
  totais: ValoresConsolidados;
  quantidadeCentros: number;
  semFaturamento: boolean;
};
export type ConsolidadoFaturamento = ResumoFaturamentoConsolidado & {
  de: string;
  ate: string;
  mesAtual: string;
  atualizadoEm: string | null;
  faturamentoErro: string | null;
};
export type ContratoConsolidado = { numCtr: string; codccu: string | null };
export type ItemConsolidado = ItemConc & { numCtr: string };

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const arred = (valor: number) => Math.round(valor * 100) / 100 || 0;
const vazio = (): ValoresConsolidados => ({ faturado: 0, nf: 0, nd: 0, medido: 0, semNota: 0, receita: 0 });
const CAMPOS = ["faturado", "nf", "nd", "medido", "semNota", "receita"] as const;

/** Ultimos 12 meses por padrao, intervalo invertido normalizado, sem futuro e maximo de 48 meses. */
export function normalizarPeriodoConsolidado(de: string | null, ate: string | null, mesAtual: string): { de: string; ate: string } {
  let fim = ate && MES.test(ate) && ate < mesAtual ? ate : mesAtual;
  let inicio = de && MES.test(de) ? de : somaMes(fim, -11);
  if (inicio > fim) [inicio, fim] = [fim, inicio];
  if (fim > mesAtual) fim = mesAtual;
  if (inicio > fim) inicio = fim;
  if (somaMes(inicio, 47) < fim) inicio = somaMes(fim, -47);
  return { de: inicio, ate: fim };
}

function mesesDoIntervalo(de: string, ate: string): string[] {
  const indice = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1;
  const inicio = indice(de), fim = indice(ate);
  return Array.from({ length: fim - inicio + 1 }, (_, i) => {
    const n = inicio + i;
    return `${String(Math.floor(n / 12)).padStart(4, "0")}-${String(n % 12 + 1).padStart(2, "0")}`;
  });
}

export function consolidarFaturamento({ contratos, itens, docs, ccusPermitidos, de, ate, hoje }: {
  contratos: ReadonlyArray<ContratoConsolidado>;
  itens: ReadonlyArray<ItemConsolidado>;
  docs: ReadonlyArray<DocConc>;
  ccusPermitidos: ReadonlySet<string>;
  de: string;
  ate: string;
  hoje: string;
}): ResumoFaturamentoConsolidado {
  const centroDoContrato = new Map<string, string>();
  const centros = new Set<string>();
  for (const contrato of contratos) {
    if (!contrato.codccu || !ccusPermitidos.has(contrato.codccu)) continue;
    centroDoContrato.set(contrato.numCtr, contrato.codccu);
    centros.add(contrato.codccu);
  }

  const itensPorCentro = new Map<string, ItemConc[]>();
  for (const item of itens) {
    // O pedido pertence ao contrato, mesmo quando o rateio do item usa outro CCU.
    const centro = centroDoContrato.get(item.numCtr);
    if (!centro) continue;
    const grupo = itensPorCentro.get(centro) ?? [];
    grupo.push(item);
    itensPorCentro.set(centro, grupo);
  }
  const docsPorCentro = new Map<string, DocConc[]>();
  for (const doc of docs) {
    if (!doc.codccu || !centros.has(doc.codccu)) continue;
    const grupo = docsPorCentro.get(doc.codccu) ?? [];
    grupo.push(doc);
    docsPorCentro.set(doc.codccu, grupo);
  }

  const meses = mesesDoIntervalo(de, ate).map((mes) => ({ mes, ...vazio() }));
  const porMes = new Map(meses.map((mes) => [mes.mes, mes]));
  for (const centro of centros) {
    // Nao recortar antes de conciliar: uma nota de outro mes pode pertencer ao pedido do periodo.
    // Outros CCUs so' alimentam avisos do detalhe; nao afetam os valores e nao sao necessarios aqui.
    const conciliacao = conciliar(itensPorCentro.get(centro) ?? [], docsPorCentro.get(centro) ?? [], [], de, ate, hoje);
    for (const mes of conciliacao.meses) {
      const destino = porMes.get(mes.mes);
      if (destino) for (const campo of CAMPOS) destino[campo] += mes[campo];
    }
  }
  const totais = vazio();
  for (const mes of meses) {
    for (const campo of CAMPOS) {
      mes[campo] = arred(mes[campo]);
      totais[campo] += mes[campo];
    }
  }
  for (const campo of CAMPOS) totais[campo] = arred(totais[campo]);
  return { meses, totais, quantidadeCentros: centros.size, semFaturamento: docsPorCentro.size === 0 };
}
