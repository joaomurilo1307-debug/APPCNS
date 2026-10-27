// Monta, a partir do banco (dados do Senior ja sincronizados), a lista "Ao vivo": titulos (pagos ou nao, com OC ou sem) e OCs que ainda
// nao viraram titulo, cada um ligado a um centro de custo e a uma linha de custo. Somente leitura.

import type { prisma as prismaReal } from "@/lib/prisma";
import { nomeConta } from "@/lib/custos/planoContas";
import { NOMES_DE_EXIBICAO } from "./nomesDeExibicao";
import { itemDaOc, itemDoTitulo, type ItemAoVivo } from "./aoVivo";
import { codigoDaContaDaOc, linhasDaOc, ocsAindaSemTitulo } from "./ocsDoCentro";
import { ehContaForaDoCusto } from "./previsao";
import { lancamentosDeTitulos } from "./titulosPrevistos";

export type AtualizadoEm = { titulos: string | null; rateios: string | null; ocs: string | null };
export type DadosAoVivo = { itens: ItemAoVivo[]; foraDoCusto: ItemAoVivo[]; atualizadoEm: AtualizadoEm; ocsSemRateioLegivel: number };

const nomeLinha = (cod: string) => nomeConta(cod);

export { codigoDaContaDaOc, linhasDaOc };

/** Nome de cada centro de custo: o do contrato cadastrado; senao o que a tela de custos ja mostra (sem o "CCU - " do comeco). */
export async function nomesDosCentros(db: typeof prismaReal, ccus: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>();
  if (ccus.length === 0) return nomes;
  for (const c of await db.contrato.findMany({ where: { codccu: { in: ccus } }, select: { codccu: true, nome: true } })) nomes.set(c.codccu, c.nome);
  const faltam = ccus.filter((c) => !nomes.has(c));
  if (faltam.length) {
    for (const c of await db.custoContaFinanceira.findMany({ where: { codccu: { in: faltam } }, distinct: ["codccu"], select: { codccu: true, contrato: true } })) {
      nomes.set(c.codccu, c.contrato.replace(new RegExp(`^${c.codccu}\\s*-\\s*`), "").trim() || c.contrato);
    }
  }
  for (const c of ccus) if (NOMES_DE_EXIBICAO[c]) nomes.set(c, NOMES_DE_EXIBICAO[c]); // 210 e 230: nome de exibicao (ver nomesDeExibicao.ts)
  return nomes;
}

let cache: { em: number; promessa: Promise<DadosAoVivo> } | null = null;
const CACHE_MS = 90_000; // o sincronismo com o Senior roda a cada ~30 min; varios coordenadores na tela nao refazem a montagem a cada requisicao

export function carregarAoVivo(db: typeof prismaReal, hoje: string): Promise<DadosAoVivo> {
  if (cache && Date.now() - cache.em < CACHE_MS) return cache.promessa;
  const promessa = montarDados(db, hoje);
  cache = { em: Date.now(), promessa };
  promessa.catch(() => { cache = null; });
  return promessa;
}

async function montarDados(db: typeof prismaReal, hoje: string): Promise<DadosAoVivo> {

  const { itens: titulos, ocsVinculadas } = await lancamentosDeTitulos(db, { somenteAbertos: false });
  const itens: ItemAoVivo[] = [];
  const foraDoCusto: ItemAoVivo[] = []; // contas de pessoal e impostos: ficam de fora (so' contadas)
  const guardar = (i: ItemAoVivo) => (ehContaForaDoCusto(i.ctaFin) ? foraDoCusto : itens).push(i);
  for (const t of titulos) if (t.ccu) guardar(itemDoTitulo(t, hoje, nomeLinha));

  // OCs que ainda nao viraram titulo (em analise, aprovadas aguardando titulo, reprovadas/canceladas recentes)
  const { itens: ocsSemTitulo, ilegiveis: ocsSemRateioLegivel } = await ocsAindaSemTitulo(db, ocsVinculadas, { soEmAndamento: false, hoje });
  for (const o of ocsSemTitulo) guardar(itemDaOc(o, nomeLinha));

  const [t, r, o] = await Promise.all([
    db.tituloContasAPagar.aggregate({ _max: { atualizadoEm: true } }),
    db.tituloRateioSenior.aggregate({ _max: { atualizadoEm: true } }),
    db.aprovacaoSenior.aggregate({ _max: { ultimaSincEm: true } }),
  ]);
  const dados: DadosAoVivo = { itens, foraDoCusto, atualizadoEm: { titulos: t._max.atualizadoEm?.toISOString() ?? null, rateios: r._max.atualizadoEm?.toISOString() ?? null, ocs: o._max.ultimaSincEm?.toISOString() ?? null }, ocsSemRateioLegivel };
  return dados;
}
