// Casamento de uma linha do arquivo de retorno do Itau com o item da remessa que
// a originou. Fica aqui (e nao dentro da rota de retorno) pra a SIMULACAO da
// geracao poder passar por exatamente o mesmo caminho, dentro da transacao que
// depois e' desfeita -- assim da' pra provar o ciclo remessa -> retorno sem criar
// nada de verdade.

import type { Prisma } from "@prisma/client";

export type ClienteItens = Pick<Prisma.TransactionClient, "remessaItemPagamento">;

// "Seu Numero" no formato da Senior (0 + CODFOR + NUMTIT + CODTPT) NAO e' unico: o
// mesmo titulo pode estar em mais de uma remessa (uma rejeitada, outra refeita).
// Entre os candidatos vale o que ainda espera o banco (pendente/agendado); sem
// nenhum, o mais recente.
export async function casarItemDoRetorno(db: ClienteItens, referencia: string) {
  // 1) referencia interna (remessas antigas e titulos que nao cabem no formato da Senior)
  const porReferencia = await db.remessaItemPagamento.findUnique({ where: { referenciaEmpresa: referencia } });
  if (porReferencia) return porReferencia;
  if (!referencia) return null;
  // 2) "Seu Numero" no formato da Senior (remessas novas)
  const candidatos = await db.remessaItemPagamento.findMany({ where: { seuNumero: referencia }, orderBy: { criadoEm: "desc" } });
  return candidatos.find((c) => c.status === "PENDENTE" || c.status === "AGENDADO") ?? candidatos[0] ?? null;
}

/**
 * Retorno de mentira, so' pra prova: o proprio arquivo de remessa com a ocorrencia
 * "00" (pago) nas posicoes 231-240 dos registros de detalhe. O Itau devolve o "Seu
 * Numero" identico ao que recebeu, entao o que muda de verdade no retorno e' so' a
 * ocorrencia (e nosso numero/valor efetivo), que nao importam pro casamento.
 */
export function montarRetornoSimulado(conteudoRemessa: string): string {
  return conteudoRemessa
    .split(/\r\n|\r|\n/)
    .filter((l) => l.length > 0)
    .map((linha) => {
      if (linha.length < 240 || linha[7] !== "3") return linha; // so' detalhe (tipo de registro 3)
      const segmento = linha[13];
      if (segmento !== "A" && segmento !== "J") return linha;
      return `${linha.slice(0, 230)}${"00".padEnd(10, " ")}${linha.slice(240)}`;
    })
    .join("\r\n");
}
