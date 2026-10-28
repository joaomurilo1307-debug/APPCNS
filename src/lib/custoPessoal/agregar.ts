// Agregacoes do custo de pessoal (PURO): total por centro de custo e mes, total por mes, total do periodo. As linhas ja vem somadas por
// centro de custo e mes (a API agrupa no banco); aqui so' se combina o que a tela mostra.

import { somarComponentes, totalComProLabore, totalDoRito, zerar, type Componentes } from "./componentes";

export type LinhaCentroMes = { codccu: string; mes: string; pessoas: number } & Componentes;

export type Celula = Componentes & { pessoas: number; total: number; totalComProLabore: number };

const celulaVazia = (): Celula => ({ ...zerar(), pessoas: 0, total: 0, totalComProLabore: 0 });

function somarCelula(a: Celula, b: LinhaCentroMes | Celula, somarPessoas: boolean): Celula {
  const comp = somarComponentes(a, b);
  const pessoas = somarPessoas ? a.pessoas + b.pessoas : Math.max(a.pessoas, b.pessoas);
  return { ...comp, pessoas, total: totalDoRito(comp), totalComProLabore: totalComProLabore(comp) };
}

/** Meses (aaaa-mm) presentes nas linhas, em ordem. */
export const mesesDasLinhas = (linhas: ReadonlyArray<{ mes: string }>): string[] => Array.from(new Set(linhas.map((l) => l.mes))).sort();

/** Celula de cada centro de custo em cada mes: centro -> mes -> celula. */
export function porCentroEMes(linhas: ReadonlyArray<LinhaCentroMes>): Map<string, Map<string, Celula>> {
  const saida = new Map<string, Map<string, Celula>>();
  for (const l of linhas) {
    const meses = saida.get(l.codccu) ?? new Map<string, Celula>();
    meses.set(l.mes, somarCelula(meses.get(l.mes) ?? celulaVazia(), l, true));
    saida.set(l.codccu, meses);
  }
  return saida;
}

/** Total de todos os centros em cada mes (pessoas = soma das pessoas de cada centro). */
export function porMes(linhas: ReadonlyArray<LinhaCentroMes>, meses: ReadonlyArray<string>): Map<string, Celula> {
  const saida = new Map<string, Celula>(meses.map((m) => [m, celulaVazia()]));
  for (const l of linhas) if (saida.has(l.mes)) saida.set(l.mes, somarCelula(saida.get(l.mes)!, l, true));
  return saida;
}

/** Total de um centro de custo (ou de todos) em varios meses. */
export function totalDoPeriodo(celulas: ReadonlyArray<Celula | undefined>): Celula {
  return celulas.reduce<Celula>((s, c) => (c ? somarCelula(s, c, false) : s), celulaVazia());
}

/** Meses entre `de` e `ate` (inclusive), entre os disponiveis. */
export const mesesDoPeriodo = (todos: ReadonlyArray<string>, de: string, ate: string): string[] => todos.filter((m) => m >= de && m <= ate);
