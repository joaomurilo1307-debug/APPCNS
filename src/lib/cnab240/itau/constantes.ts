// Tabelas de codigo do manual SISPAG CNAB (Itau, versao 085 de out/2020 --
// https://download.itau.com.br/bankline/sispag_cnab.pdf; a 086 nao muda estas
// tabelas). Todas as formas da Nota 5 que servem a contas a pagar:
//   Segmento A: credito em conta/poupanca, cheque, OP, TED, PIX, NF liquidacao
//   Segmento J: boleto (30/31) e PIX QR-Code (47, com J-52 PIX)
//   Segmento O: concessionarias e tributos COM codigo de barras (Anexo B)
//   Segmento N: tributos SEM codigo de barras e FGTS-GRF (Anexo C)
// Fora de proposito: DOC C/D (03/07, extintos pela FEBRABAN em 29/02/2024) e
// 60 cartao salario (so' tipo 30 Salarios).

export const CODIGO_BANCO_ITAU = "341";

/** Nota 4 do manual: tipo de pagamento do lote. */
export const TIPO_PAGAMENTO_FORNECEDORES = "20";
export const TIPO_PAGAMENTO_TRIBUTOS = "22";

/** Nota 5 do manual: forma de pagamento. */
export const FORMA_PAGAMENTO = {
  CREDITO_CONTA_ITAU: "01",
  CHEQUE_PAGAMENTO: "02",
  CREDITO_POUPANCA_ITAU: "05",
  CREDITO_CONTA_MESMO_TITULAR: "06",
  ORDEM_PAGAMENTO: "10",
  CONCESSIONARIA: "13",
  DARF_NORMAL: "16",
  GPS: "17",
  DARF_SIMPLES: "18",
  TRIBUTO_MUNICIPAL: "19",
  GARE_SP_ICMS: "22",
  IPVA: "25",
  DPVAT: "27",
  BOLETO_ITAU: "30",
  BOLETO_OUTROS_BANCOS: "31",
  NF_LIQUIDACAO_ELETRONICA: "32",
  FGTS: "35",
  TED_OUTRO_TITULAR: "41",
  TED_MESMO_TITULAR: "43",
  PIX_TRANSFERENCIA: "45",
  PIX_QR_CODE: "47",
  GNRE_TRIBUTO_CODIGO_BARRAS: "91",
} as const;

export type FormaPagamento = (typeof FORMA_PAGAMENTO)[keyof typeof FORMA_PAGAMENTO];
export type Segmento = "A" | "J" | "O" | "N";

const FORMAS_J: string[] = [FORMA_PAGAMENTO.BOLETO_ITAU, FORMA_PAGAMENTO.BOLETO_OUTROS_BANCOS, FORMA_PAGAMENTO.PIX_QR_CODE];
const FORMAS_O: string[] = [FORMA_PAGAMENTO.CONCESSIONARIA, FORMA_PAGAMENTO.TRIBUTO_MUNICIPAL, FORMA_PAGAMENTO.GNRE_TRIBUTO_CODIGO_BARRAS];
export const FORMAS_N: string[] = [
  FORMA_PAGAMENTO.DARF_NORMAL, FORMA_PAGAMENTO.GPS, FORMA_PAGAMENTO.DARF_SIMPLES, FORMA_PAGAMENTO.GARE_SP_ICMS,
  FORMA_PAGAMENTO.IPVA, FORMA_PAGAMENTO.DPVAT, FORMA_PAGAMENTO.FGTS,
];

/** Segmento do registro de detalhe de cada forma ("2.2 Explicacoes gerais sobre o arquivo"). */
export function segmentoDaForma(forma: string): Segmento {
  if (FORMAS_J.includes(forma)) return "J";
  if (FORMAS_O.includes(forma)) return "O";
  if (FORMAS_N.includes(forma)) return "N";
  return "A";
}

/** Tabela "Tipos x Formas" (pag. 4): concessionaria vai como Fornecedores; tributos so' no tipo 22. */
export function tipoPagamentoDaForma(forma: string): string {
  return FORMAS_N.includes(forma) || forma === FORMA_PAGAMENTO.TRIBUTO_MUNICIPAL || forma === FORMA_PAGAMENTO.GNRE_TRIBUTO_CODIGO_BARRAS
    ? TIPO_PAGAMENTO_TRIBUTOS
    : TIPO_PAGAMENTO_FORNECEDORES;
}

/** Layout do lote: 040 pros pagamentos do Segmento A, 030 pros demais (headers de lote, pags. 13/25/33/37). */
export function layoutLoteDaForma(forma: string): string {
  return segmentoDaForma(forma) === "A" ? "040" : "030";
}

/** "2.2 Explicacoes gerais": lotes PIX (transferencia e QR-Code) vao em arquivo separado. */
export function ehFormaPix(forma: string): boolean {
  return forma === FORMA_PAGAMENTO.PIX_TRANSFERENCIA || forma === FORMA_PAGAMENTO.PIX_QR_CODE;
}

/** Formas do Segmento A sem conta de destino: cheque/OP ficam a disposicao numa agencia (Nota 11 a). */
export function formaSoAgencia(forma: string): boolean {
  return forma === FORMA_PAGAMENTO.CHEQUE_PAGAMENTO || forma === FORMA_PAGAMENTO.ORDEM_PAGAMENTO;
}

/** Formas do Segmento A que so' creditam conta no Itau (Nota 5: "no Itau"). */
export function formaSoItau(forma: string): boolean {
  return [FORMA_PAGAMENTO.CREDITO_CONTA_ITAU, FORMA_PAGAMENTO.CREDITO_POUPANCA_ITAU, FORMA_PAGAMENTO.CREDITO_CONTA_MESMO_TITULAR].includes(forma as any);
}

/**
 * Forma sugerida pela 2a posicao do codigo de arrecadacao (identificacao do
 * segmento, Anexo B): 1 prefeituras -> 19; 2 saneamento, 3 energia/gas,
 * 4 telecom -> 13; 5 orgaos governamentais -> 91.
 */
export function formaDaArrecadacao(cb44: string): string {
  const segmento = cb44[1];
  if (segmento === "1") return FORMA_PAGAMENTO.TRIBUTO_MUNICIPAL;
  if ("234".includes(segmento)) return FORMA_PAGAMENTO.CONCESSIONARIA;
  // ponytail: o Anexo B so' lista os segmentos 1-4; 5 (orgao do governo, ex.:
  // DAE da SEF-MG, DARF com codigo de barras) -> 91 e' leitura da Nota 5
  // ("tributos com codigo de barras"). Se o Itau rejeitar com IM, e' aqui.
  if (segmento === "5") return FORMA_PAGAMENTO.GNRE_TRIBUTO_CODIGO_BARRAS;
  throw new Error(`Segmento de arrecadacao "${segmento}" sem forma de pagamento definida no manual SISPAG (Anexo B).`);
}

/** Anexo C: identificacao do tributo nas posicoes 018-019 do Segmento N. */
export const TRIBUTO_DA_FORMA: Record<string, string> = {
  [FORMA_PAGAMENTO.GPS]: "01",
  [FORMA_PAGAMENTO.DARF_NORMAL]: "02",
  [FORMA_PAGAMENTO.DARF_SIMPLES]: "03",
  [FORMA_PAGAMENTO.GARE_SP_ICMS]: "05",
  [FORMA_PAGAMENTO.IPVA]: "07",
  [FORMA_PAGAMENTO.DPVAT]: "08",
  [FORMA_PAGAMENTO.FGTS]: "11",
};

// PIX Transferencia (manual pag. 9, 22, 71 -- Notas 35/36/37): vai pelo
// Segmento A normal, mas com 3 diferencas em relacao a credito/TED comuns:
//   1. Posicao 018-020 do Segmento A leva "009" (codigo de compensacao do
//      SPI), nao a camara/zeros de um TED comum.
//   2. Posicao 113-114 do Segmento A leva o tipo de transferencia (Nota 36).
//   3. Segmento B fica OBRIGATORIO quando o modelo e' "Chave" (tipo 04) --
//      e' ele que carrega a chave Pix de verdade (posicoes 128-227).
// Alem disso, pagamentos PIX tem que ir em arquivo SEPARADO das demais
// formas (pag. 8, "2.2 Explicacoes gerais sobre o arquivo") -- nao da pra
// misturar PIX com TED/boleto no mesmo arquivo de remessa.
export const CODIGO_COMPENSACAO_PIX = "009";

/** Nota 36 do manual: tipo de transferencia nas posicoes 113-114 do Segmento A, so' quando a forma for PIX. */
export const TIPO_TRANSFERENCIA_PIX = {
  CONTA_CORRENTE: "01",
  CONTA_PAGAMENTO: "PG",
  CONTA_POUPANCA: "03",
  CHAVE: "04",
} as const;

/** Nota 37 do manual: tipo de chave Pix no Segmento B (mesmo codigo do TPCPIX da Senior: 1 a 4). */
export const TIPO_CHAVE_PIX = {
  TELEFONE: "01",
  EMAIL: "02",
  CPF_CNPJ: "03",
  ALEATORIA: "04",
} as const;

/** Nota 10 do manual: tipo de movimento no registro de detalhe. */
export const TIPO_MOVIMENTO = {
  INCLUSAO: "000",
  EXCLUSAO: "999",
} as const;

/**
 * Nota 8 do manual (tabela de ocorrencias do arquivo retorno). So' as mais
 * comuns -- qualquer codigo fora daqui ainda e' guardado, so' sem descricao
 * amigavel (ver retorno.ts).
 */
export const OCORRENCIAS: Record<string, string> = {
  "00": "Pagamento efetuado",
  AE: "Data de pagamento alterada",
  BD: "Pagamento agendado",
  BE: "Pagamento agendado com forma alterada para OP",
  CE: "Pagamento cancelado",
  CD: "CNPJ/CPF informado divergente do cadastrado",
  CN: "Conta nao cadastrada",
  AL: "Codigo do banco favorecido invalido",
  AM: "Agencia do favorecido invalida",
  AN: "Conta corrente do favorecido invalida",
  AO: "Nome do favorecido invalido",
  IN: "Banco/agencia nao cadastrados",
  IM: "Tipo x forma nao compativel",
  NA: "Pagamento cancelado por falta de autorizacao",
  SS: "Pagamento cancelado por insuficiencia de saldo / limite diario excedido",
  TA: "Lote nao aceito - totais do lote com diferenca",
  RJ: "Registro rejeitado",
  NI: "Tributo/titulo ja foi pago ou esta vencido",
  BI: "CNPJ/CPF do favorecido no segmento J-52/B invalido",
  IR: "Pagamento alterado",
  LA: "Data de pagamento de um lote alterada",
  LC: "Lote de pagamentos cancelado",
  DV: "DOC/TED devolvido pelo banco favorecido",
  EX: "Devolucao de OP nao sacada pelo favorecido",
  CP: "Confirmacao de OP cumprida",
  EM: "Confirmacao de OP emitida",
  TI: "Titularidade invalida",
  AP: "Data de pagamento invalida",
  CF: "Valor do documento invalido",
  IP: "DAC do codigo de barras invalido",
  NR: "Operacao nao realizada",
};

export function descricaoOcorrencia(codigo: string): string {
  return OCORRENCIAS[codigo] ?? `Ocorrencia ${codigo} (nao catalogada -- consultar Nota 8 do manual SISPAG)`;
}

/** Ocorrencias que representam sucesso (nao sao erro/rejeicao). */
export const OCORRENCIAS_POSITIVAS = new Set(["00", "AE", "BD", "BE", "IR", "CP", "EM", "LA"]);
