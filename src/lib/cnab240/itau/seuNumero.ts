// "Seu Numero" no formato da PROPRIA Senior (Pagamento Eletronico), pra a tela de
// retorno da Senior (F510PRT / processo automatico 155) achar o titulo mesmo
// quando a remessa nasceu aqui e nao la.
//
// Documentacao oficial (Leiaute de exportacao e importacao para remessa e retorno
// do pagamento eletronico, documentacao.senior.com.br/goup/5.10.3/...): "Nos
// segmentos A e K atraves do numero do titulo (NUMTIT), tipo do titulo (CODTPT) e
// do fornecedor (CODFOR) que devem ser enviados no campo Seu Numero do arquivo. A
// primeira posicao sera desconsiderada, as seis seguintes sao para o codigo do
// fornecedor, as proximas dez para o numero do titulo" (e as 3 ultimas, o tipo).
// Ou seja: 20 posicoes = "0" + CODFOR(6) + NUMTIT(10) + CODTPT(3). Variaveis de
// retorno da Senior: NumTit (Alfa), CodFor (Numero), CodTpt (Alfa).
//
// Boleto (segmento J): a Senior NAO usa o Seu Numero, acha o titulo pelo codigo de
// barras gravado em E501TCP.CODBAR -- por isso o mesmo codigo precisa estar no
// titulo la'.
//
// Limites do formato: NUMTIT acima de 10 caracteres, CODFOR acima de 6 digitos ou
// CODTPT acima de 3 caracteres nao cabem -- devolve null e quem chama volta pra
// referencia interna (o retorno ainda casa AQUI; so' a Senior nao casa).
//
// Alinhamento: a documentacao nao diz. Segue a convencao da Senior pra layouts --
// numerico (CODFOR) com zeros a esquerda, alfa (NUMTIT/CODTPT) a esquerda com
// brancos a direita. VALIDAR com um titulo real no retorno da Senior.

export type TituloParaSeuNumero = { codFor: string; numTit: string; tipo: string };

export function seuNumeroSenior(t: TituloParaSeuNumero): string | null {
  const codFor = (t.codFor ?? "").trim();
  const numTit = (t.numTit ?? "").trim();
  const tipo = (t.tipo ?? "").trim();
  if (!/^\d{1,6}$/.test(codFor)) return null;
  if (numTit.length === 0 || numTit.length > 10) return null;
  if (tipo.length === 0 || tipo.length > 3) return null;
  // Maiusculo: e' assim que o CNAB grava (alfa() em campos.ts) e assim que volta no retorno.
  return `0${codFor.padStart(6, "0")}${numTit.padEnd(10, " ")}${tipo.padEnd(3, " ")}`.toUpperCase().trimEnd();
}

/** Por que o titulo nao cabe no formato (pra explicar na conferencia); null se cabe. */
export function motivoSemSeuNumeroSenior(t: TituloParaSeuNumero): string | null {
  const codFor = (t.codFor ?? "").trim();
  const numTit = (t.numTit ?? "").trim();
  const tipo = (t.tipo ?? "").trim();
  if (!/^\d{1,6}$/.test(codFor)) return `código do fornecedor "${codFor}" não é numérico de até 6 dígitos`;
  if (numTit.length > 10) return `o número do título tem ${numTit.length} caracteres e o "Seu Número" da Senior só comporta 10`;
  if (tipo.length > 3) return `o tipo do título "${tipo}" tem mais de 3 caracteres`;
  return null;
}
