// Memoria do custo de pessoal (PURO): um mes FECHADO nao muda mais. O fechamento guarda o resumo do mes e uma impressao (SHA-256) das linhas; a
// impressao so' cobre quem esta em qual centro e os valores, nao a situacao atual da pessoa (que muda com o tempo e nao e' custo).

import { createHash } from "node:crypto";
import { IDS_COMPONENTES, type Componentes } from "./componentes";

export type LinhaDoMes = { codccu: string; matricula: string; salarioBase: number; total: number } & Componentes;

const centavos = (v: number) => Math.round(v * 100);

/** SHA-256 das linhas do mes (centro, matricula e cada valor em centavos), em ordem fixa: a mesma folha sempre gera a mesma impressao. */
export function impressaoDoMes(linhas: ReadonlyArray<LinhaDoMes>): string {
  const partes = linhas
    .map((l) => [l.codccu, l.matricula, centavos(l.salarioBase), ...IDS_COMPONENTES.map((id) => centavos(l[id])), centavos(l.total)].join("|"))
    .sort();
  return createHash("sha256").update(partes.join("\n")).digest("hex");
}

/** Resumo gravado no fechamento: linhas, pessoas (matriculas distintas) e total pela regra do Rito. */
export function resumoDoMes(linhas: ReadonlyArray<Pick<LinhaDoMes, "matricula" | "total">>): { linhas: number; pessoas: number; total: number } {
  return {
    linhas: linhas.length,
    pessoas: new Set(linhas.map((l) => l.matricula)).size,
    total: Math.round(linhas.reduce((s, l) => s + l.total, 0) * 100) / 100,
  };
}

/** Meses da carga que ja estao fechados (a carga inteira e' recusada se houver algum). */
export function mesesFechadosNaCarga(meses: ReadonlyArray<string>, fechados: ReadonlySet<string>): string[] {
  return meses.filter((m) => fechados.has(m)).sort();
}

export const MES_VALIDO = /^\d{4}-(0[1-9]|1[0-2])$/;
