// Excecoes de centro de custo DECIDIDAS PELO JOAO: o custo de um TITULO especifico vai para outro centro que nao o do rateio do Senior. O Senior continua sendo a fonte; isto e' so'
// uma reatribuicao de gestao, explicita e auditavel. So' vale enquanto o Senior ainda tiver o titulo no centro `de` (se o financeiro corrigir o rateio la, a excecao se desliga sozinha).
// Para incluir outra: acrescentar uma linha aqui, com o titulo (numero + fornecedor + tipo), o centro atual no Senior (`de`), o novo (`para`), o motivo e a data da decisao.

export type Reatribuicao = { numTit: string; codFor: string; codTpt: string; de: string; para: string; motivo: string; decididoEm: string };

export const REATRIBUICOES: ReadonlyArray<Reatribuicao> = [
  {
    numTit: "3A1", codFor: "625456", codTpt: "NFS", de: "260", para: "102295",
    motivo: "Breno de Lana Goncalves (PJ): R$ 9.500 pagos em 07/01/2026, lancados no centro 260 ADMINISTRATIVO; o Joao mandou para ADM ENGENHARIA, junto do Bruno Teixeira.",
    decididoEm: "2026-10-28",
  },
];

type Linha = { numTit: string; codFor: string; codTpt: string; codCcu: string };

/** Centro para onde o custo desta linha de rateio foi reatribuido, ou null (fica no centro do Senior). */
export function centroReatribuido(r: Linha, lista: ReadonlyArray<Reatribuicao> = REATRIBUICOES): string | null {
  const x = lista.find((e) => e.numTit === r.numTit.trim() && e.codFor === r.codFor.trim() && e.codTpt === r.codTpt.trim() && e.de === r.codCcu.trim());
  return x ? x.para : null;
}
