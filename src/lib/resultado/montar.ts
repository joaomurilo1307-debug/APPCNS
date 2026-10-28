// Junta o que a API de resultado entrega (ficha, receita, retencoes, pessoal) com o custo da tela de custos (o mesmo ContratoCusto, a mesma base e os mesmos filtros),
// centro de custo a centro de custo, tudo alinhado aos mesmos meses. PURO.

import { chaveMes, contratosNaBase, type BaseMes, type ContratoCusto, type TipoCusto } from "../custos/agregacao";
import { serieDeCustoContrato } from "../contratos/curvas";
import { areaDoCentro } from "../areas";
import type { FichaDoCentro, LinhaDoResultado } from "./calculo";

export type CentroDaApi = FichaDoCentro & { receita: number[]; retencoes: number[]; semNota: number[]; pessoal: number[] | null };

const centavos = (v: number) => Math.round(v * 100) / 100;

export function montarLinhas(
  centros: ReadonlyArray<CentroDaApi>,
  contratosCusto: ReadonlyArray<ContratoCusto>,
  meses: ReadonlyArray<string>,
  f: { base: BaseMes; tipo: TipoCusto },
): LinhaDoResultado[] {
  const custos = new Map(contratosNaBase(contratosCusto, f.base).map((c) => [c.codccu, c]));
  const filtros = { de: meses[0] ?? "", ate: meses[meses.length - 1] ?? "", tipo: f.tipo, grupo: "todos" };
  const serie = (c: ContratoCusto | undefined) => (c ? serieDeCustoContrato(c, filtros, meses).map(centavos) : meses.map(() => 0));
  const linhas: LinhaDoResultado[] = centros.map((c) => ({ ...c, custo: serie(custos.get(c.codccu)) }));
  // centro que so' tem custo (sem ficha, sem receita, sem folha): aparece mesmo assim, para o custo nao sumir do total
  const conhecidos = new Set(centros.map((c) => c.codccu));
  for (const [codccu, contrato] of custos) {
    if (conhecidos.has(codccu)) continue;
    const custo = serie(contrato);
    if (custo.every((v) => v === 0)) continue;
    linhas.push({
      codccu, nome: contrato.nome || `CCU ${codccu}`, tipo: "CONTRATO", status: "ATIVO", area: areaDoCentro(codccu), cliente: null, numero: null, objeto: null,
      vigenciaInicio: null, vigenciaFim: null, valorContrato: null, receita: meses.map(() => 0), retencoes: meses.map(() => 0), semNota: meses.map(() => 0), pessoal: null, custo,
    });
  }
  return linhas;
}

/** Meses que o custo cobre, em ordem, no formato aaaa-mm. */
export const mesesComCusto = (mesesDoCusto: ReadonlyArray<string>) => Array.from(new Set(mesesDoCusto.map(chaveMes))).sort();
