import { normalizarPeriodoConsolidado } from "./consolidado";
import { somaMes } from "./competencia";

/** Eixo do periodo completo, como no consolidado; nao altera a conciliacao nem as barras do detalhe. */
export function alinharCurvaFaturamento(meses: ReadonlyArray<{ mes: string; faturado: number }>, de: string, ate: string, mesAtual: string) {
  const periodo = normalizarPeriodoConsolidado(de, ate, mesAtual);
  const porMes = new Map(meses.map((m) => [m.mes, m.faturado]));
  const eixo: string[] = [];
  for (let mes = periodo.de; mes <= periodo.ate; mes = somaMes(mes, 1)) eixo.push(mes);
  return {
    ...periodo,
    meses: eixo,
    valores: eixo.map((mes) => porMes.get(mes) ?? 0),
    mesParcial: periodo.ate === mesAtual ? mesAtual : undefined,
  };
}
