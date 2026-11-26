// Titulos de UMA OC, ao vivo da Senior (so' leitura) + vinculos manuais e titulo gerado na Conferencia. Mesma regra da lista
// (apurarTitulosDasOcs): usado no painel "Conferir" e antes de gerar titulo, para nao gerar um segundo titulo para a mesma OC.

import { prisma } from "@/lib/prisma";
import { lerTitulosDasOcs, type OcConferencia } from "@/lib/senior/ocsConferencia";
import { carregarGruposFornecedores } from "@/lib/senior/vinculosOc";
import { apurarTitulosDasOcs, chaveOc, type ApuracaoTitulos } from "./titulosDaOc";

export async function apurarTitulosDeUmaOc(
  oc: Pick<OcConferencia, "numOcp" | "codFil" | "codFor" | "numTitSenior" | "numNfc" | "vencimento" | "valor">,
  opcoes: { incluirGeradoAqui?: boolean } = {}
): Promise<ApuracaoTitulos> {
  const grupos = await carregarGruposFornecedores();
  const [{ titulos, nfs }, manuais, gerados] = await Promise.all([
    lerTitulosDasOcs([oc], grupos),
    prisma.tituloOcVinculo.findMany({ where: { numOcp: oc.numOcp }, select: { numTit: true, codFil: true, codFor: true, numOcp: true } }),
    opcoes.incluirGeradoAqui === false ? Promise.resolve([]) : prisma.tituloGeradoOC.findMany({ where: { numOcp: oc.numOcp, codFil: oc.codFil } }),
  ]);
  return apurarTitulosDasOcs([oc], {
    titulos,
    nfs,
    manuais,
    gerados: gerados.map((g) => ({ ...g, vencimento: g.vencimento.toISOString().slice(0, 10) })),
    grupos,
  }).get(chaveOc(oc))!;
}
