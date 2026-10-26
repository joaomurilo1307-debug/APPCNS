import { linhasDoContrato, soma, type ContratoCusto, type Filtros } from "@/lib/custos/agregacao";
import { normalizarPeriodoConsolidado } from "@/lib/medicao/consolidado";

/** Mesmo recorte disponível nas curvas, sem inventar custo zero antes da leitura. */
export function periodoDasCurvas(de: string | null, ate: string | null, mesAtual: string, mesesDisponiveis: readonly string[] = []) {
  const periodo = normalizarPeriodoConsolidado(de, ate, mesAtual);
  const disponiveis = mesesDisponiveis.filter((m) => m <= mesAtual).slice().sort();
  if (!disponiveis.length) return periodo;
  const primeiro = disponiveis[0];
  return { de: periodo.de < primeiro ? primeiro : periodo.de, ate: periodo.ate < primeiro ? primeiro : periodo.ate };
}

/** A mesma soma de contas e os mesmos filtros da aba Custos. */
export function serieDeCustoContrato(contrato: ContratoCusto, filtros: Filtros, meses: readonly string[], busca = "") {
  const linhas = linhasDoContrato(contrato, filtros, meses, busca).filter((l) => l.total !== 0);
  return meses.map((_, i) => soma(linhas.map((l) => l.serie[i])));
}
