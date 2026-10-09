// Casamento de uma linha do arquivo de retorno do Itau com o item da remessa que
// a originou. Fica aqui (e nao dentro da rota de retorno) pra a SIMULACAO da
// geracao poder passar por exatamente o mesmo caminho, dentro da transacao que
// depois e' desfeita -- assim da' pra provar o ciclo remessa -> retorno sem criar
// nada de verdade.

import type { Prisma } from "@prisma/client";
import type { ItemRetorno } from "@/lib/cnab240/itau/tipos";

export type ClienteItens = Pick<Prisma.TransactionClient, "remessaItemPagamento">;

// "Seu Numero" no formato da Senior (0 + CODFOR + NUMTIT + CODTPT) NAO e' unico: o
// mesmo titulo pode estar em mais de uma remessa (uma rejeitada, outra refeita).
// Nunca escolher por status ou pela remessa mais recente: retorno antigo pode
// atingir o reenvio errado. Havendo ambiguidade, exigir conferencia manual.
export async function casarItemDoRetorno(db: ClienteItens, referencia: string, retorno?: ItemRetorno) {
  // 1) referencia interna unica por tentativa (padrao das novas remessas)
  if (!referencia) return null;
  const porReferencia = await db.remessaItemPagamento.findUnique({ where: { referenciaEmpresa: referencia }, include: { remessa: { include: { contaBancaria: true } } } });
  // 2) "Seu Numero" legado no formato da Senior
  const candidatos = porReferencia ? [porReferencia] : await db.remessaItemPagamento.findMany({ where: { seuNumero: referencia }, include: { remessa: { include: { contaBancaria: true } } } });
  const numero = (s: string) => s.replace(/^0+/, "") || "0";
  const compativeis = candidatos.filter(c => {
    if (!retorno) return true;
    const conta = c.remessa.contaBancaria;
    if (numero(conta.banco) !== "341" || numero(conta.cnpj) !== numero(retorno.contaDebito.cnpj) ||
      numero(conta.agencia) !== numero(retorno.contaDebito.agencia) || numero(conta.conta) !== numero(retorno.contaDebito.conta) || conta.dac !== retorno.contaDebito.dac) return false;
    if (c.segmento !== retorno.segmento) return false;
    if (c.formaPagamento !== retorno.formaPagamento && retorno.formaPagamento !== "11") return false;
    if (retorno.favorecidoDocumento && numero(retorno.favorecidoDocumento) !== "0" && numero(c.favorecidoDocumento) !== numero(retorno.favorecidoDocumento)) return false;
    const destino = retorno.contaFavorecido;
    if (destino && c.bancoFavorecido && c.agenciaFavorecido && c.contaFavorecido && c.dacFavorecido) {
      if (numero(c.bancoFavorecido) !== numero(destino.banco) || numero(c.agenciaFavorecido) !== numero(destino.agencia) || numero(c.contaFavorecido) !== numero(destino.conta) || c.dacFavorecido !== destino.dac) return false;
    }
    if (retorno.codigoBarras && c.codigoBarras !== retorno.codigoBarras) return false;
    if (retorno.nossoNumero && c.nossoNumero && retorno.nossoNumero !== c.nossoNumero) return false;
    // Referencia unica vincula mesmo uma alteracao de data/valor. No legado, estes
    // campos sao necessarios para desambiguar remessas do mesmo titulo.
    if (!porReferencia) {
      if (retorno.valorProgramado && Math.round(c.valor * 100) !== Math.round(retorno.valorProgramado * 100)) return false;
      if (retorno.dataProgramada && c.dataPagamento.toISOString().slice(0, 10) !== retorno.dataProgramada.toISOString().slice(0, 10)) return false;
    }
    return true;
  });
  if (porReferencia && !compativeis.length) throw new Error(`Retorno ${referencia} diverge da conta, favorecido, segmento ou boleto da remessa. Nenhum pagamento foi atualizado.`);
  if (compativeis.length > 1) throw new Error(`Seu Numero ${referencia} identifica mais de uma remessa. Conferencia manual necessaria; nenhum pagamento foi atualizado.`);
  return compativeis[0] ?? null;
}

/**
 * Retorno ficticio para testes locais: cabecalho de retorno, ocorrencia "00" e
 * data/valor efetivos iguais aos programados. Preserva referencias e complementos
 * para exercitar o parser e o casamento. Nao representa homologacao pelo banco.
 */
export function montarRetornoSimulado(conteudoRemessa: string): string {
  return conteudoRemessa
    .split(/\r\n|\r|\n/)
    .filter((l) => l.length > 0)
    .map((linha) => {
      if (linha[7] === "0") return `${linha.slice(0, 142)}2${linha.slice(143)}`;
      if (linha.length < 240 || linha[7] !== "3") return linha; // so' detalhe (tipo de registro 3)
      const segmento = linha[13];
      if (segmento !== "A" && segmento !== "J") return linha;
      if (segmento === "J" && linha.slice(17, 19) === "52") return linha;
      if (segmento === "A") linha = `${linha.slice(0, 154)}${linha.slice(93, 101)}${linha.slice(119, 134)}${linha.slice(177)}`;
      return `${linha.slice(0, 230)}${"00".padEnd(10, " ")}${linha.slice(240)}`;
    })
    .join("\r\n");
}
