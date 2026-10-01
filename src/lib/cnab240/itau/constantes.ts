// Tabelas de codigo do manual "SISPAG - Layout de Arquivos CNAB Versao 086"
// (Layout-de-Arquivos_CNAB-Versa-o-086_SISPAG.pdf). So' os subconjuntos
// realmente usados pela geracao de remessa "Fornecedores" (tipo 20) desta
// integracao: credito em conta/TED (Segmento A) e boleto em cobranca
// (Segmento J). Ver docs/integracao-itau.md pra o que falta (tributos,
// concessionarias, holerite).

export const CODIGO_BANCO_ITAU = "341";

/** Nota 4 do manual: tipo de pagamento do lote. So' "20" (Fornecedores) e usado aqui. */
export const TIPO_PAGAMENTO_FORNECEDORES = "20";

/** Nota 5 do manual: forma de pagamento. */
export const FORMA_PAGAMENTO = {
  CREDITO_CONTA_ITAU: "01",
  TED_OUTRO_TITULAR: "41",
  TED_MESMO_TITULAR: "43",
  BOLETO_ITAU: "30",
  BOLETO_OUTROS_BANCOS: "31",
  PIX_TRANSFERENCIA: "45",
} as const;

export type FormaPagamento = (typeof FORMA_PAGAMENTO)[keyof typeof FORMA_PAGAMENTO];

/** Segmento A e' usado para as formas de credito/TED/PIX; J para boleto. */
export function segmentoDaForma(forma: string): "A" | "J" {
  if (forma === FORMA_PAGAMENTO.BOLETO_ITAU || forma === FORMA_PAGAMENTO.BOLETO_OUTROS_BANCOS) return "J";
  return "A";
}

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
};

export function descricaoOcorrencia(codigo: string): string {
  return OCORRENCIAS[codigo] ?? `Ocorrencia ${codigo} (nao catalogada -- consultar Nota 8 do manual SISPAG)`;
}

/** Ocorrencias que representam sucesso (nao sao erro/rejeicao). */
export const OCORRENCIAS_POSITIVAS = new Set(["00", "AE", "BD", "IR", "CP", "EM"]);
