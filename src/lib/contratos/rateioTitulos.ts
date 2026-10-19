// Guarda o rateio (centro de custo + linha de custo + valor) das linhas de ENTRADA e de PREVISAO dos titulos do Senior (E501RAT).
// Os dados ja sao lidos na atualizacao do custo (todas as linhas de rateio de cada centro de custo); aqui so' se guarda a parte que
// diz a que centro de custo pertence cada titulo -- inclusive as previsoes (PRV), que no Senior nao trazem o CC no cabecalho do titulo.
// So' leitura do Senior; nenhuma regra do custo e' alterada.

import type { prisma as prismaReal } from "@/lib/prisma";
import { TRANSACOES_DE_ENTRADA, mesDaCompetencia, numeroSenior, type LinhaRateio } from "@/lib/custos/motorCustoContrato";

export const TRANSACAO_PREVISAO = "90503";
export const TRANSACOES_DO_RATEIO_DO_TITULO: ReadonlySet<string> = new Set([...TRANSACOES_DE_ENTRADA, TRANSACAO_PREVISAO]);

export type LinhaRateioTitulo = { numTit: string; codFil: string; codTpt: string; codFor: string; seqMov: string; codTns: string; ctaFin: string; codccu: string; valor: number; mesAno: Date | null };

export const chaveDoTitulo = (t: { numTit: string; codFil: string; codTpt: string; codFor: string }) => `${t.numTit}|${t.codFil}|${t.codTpt}|${t.codFor}`;

/** Linhas de entrada/previsao que pertencem a titulos que o app conhece (os demais nao interessam e so' pesariam no banco). */
export function linhasDoRateioDosTitulos(rateios: ReadonlyArray<LinhaRateio>, titulosConhecidos: ReadonlySet<string>): LinhaRateioTitulo[] {
  const saida: LinhaRateioTitulo[] = [];
  for (const r of rateios) {
    if (!TRANSACOES_DO_RATEIO_DO_TITULO.has(r.codTns)) continue;
    if (!titulosConhecidos.has(chaveDoTitulo(r))) continue;
    const valor = numeroSenior(r.vlrRat);
    if (!valor) continue;
    const mes = mesDaCompetencia(r.mesAno);
    saida.push({ numTit: r.numTit, codFil: r.codFil, codTpt: r.codTpt, codFor: r.codFor, seqMov: r.seqMov, codTns: r.codTns, ctaFin: r.ctaFin, codccu: r.codCcu, valor, mesAno: mes ? new Date(`${mes}-01T00:00:00.000Z`) : null });
  }
  return saida;
}

/** Regrava o rateio dos titulos (substituicao total e atomica). Nao grava nada se o resultado vier muito menor que o ja gravado. */
export async function gravarRateioDosTitulos(db: typeof prismaReal, rateios: ReadonlyArray<LinhaRateio>) {
  const titulos = await db.tituloContasAPagar.findMany({ select: { numTit: true, codFil: true, codFor: true, tipo: true } });
  const conhecidos = new Set(titulos.map((t) => chaveDoTitulo({ numTit: t.numTit, codFil: t.codFil, codTpt: t.tipo, codFor: t.codFor })));
  const linhas = linhasDoRateioDosTitulos(rateios, conhecidos);
  const antes = await db.tituloRateioSenior.count();
  if (linhas.length === 0) throw new Error("Nenhuma linha de rateio de título foi lida — o rateio anterior foi mantido.");
  if (antes > 200 && linhas.length < antes * 0.5) throw new Error(`Leitura do rateio dos títulos veio com ${linhas.length} linhas contra ${antes} já gravadas (menos da metade) — mantido o anterior.`);
  await db.$transaction(
    async (tx) => {
      await tx.tituloRateioSenior.deleteMany({});
      for (let i = 0; i < linhas.length; i += 2000) await tx.tituloRateioSenior.createMany({ data: linhas.slice(i, i + 2000) });
    },
    { timeout: 180_000, maxWait: 30_000 }
  );
  return { linhas: linhas.length, titulosComRateio: new Set(linhas.map(chaveDoTitulo)).size, antes };
}
