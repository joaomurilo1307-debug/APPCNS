import type { FormaPagamento } from "./constantes";

export type ContaDebito = {
  cnpj: string; // so' digitos
  agencia: string;
  conta: string;
  dac: string;
  nomeEmpresa: string;
};

export type ItemRemessa = {
  /** vai no campo "Seu Numero" do CNAB -- unica forma de casar o retorno de volta a este item. */
  referenciaEmpresa: string;
  numeroSequencial: number;
  formaPagamento: FormaPagamento;
  favorecidoNome: string;
  favorecidoTipoDocumento: "1" | "2"; // 1=CPF, 2=CNPJ
  favorecidoDocumento: string;
  valor: number;
  dataPagamento: Date;

  // Segmento A (credito em conta / TED)
  bancoFavorecido?: string;
  agenciaFavorecido?: string;
  contaFavorecido?: string;
  dacFavorecido?: string;

  // Segmento J (boleto em cobranca)
  codigoBarras?: string;

  // Segmento B obrigatorio pra PIX Transferencia no modelo "Chave" (Nota 37
  // do manual): usado quando o favorecido so' tem chave Pix cadastrada, sem
  // conta bancaria completa. "01" telefone / "02" e-mail / "03" CPF-CNPJ /
  // "04" aleatoria -- mesmo codigo do TPCPIX da Senior, so' com zero a esquerda.
  chavePixTipo?: "01" | "02" | "03" | "04";
  chavePixValor?: string;

  // Forma 47 (Segmento J + J-52 PIX): o "copia e cola" inteiro do QR Code.
  pixCopiaECola?: string;
  // Forma 32 (Segmento A, NF - Liquidacao Eletronica, Notas 31/32).
  nfLiquidacao?: NfLiquidacao;
  // Segmento N (tributo sem codigo de barras): dados da guia, Anexo C. O
  // contribuinte e' o favorecido do item (nome/CPF-CNPJ). Valores em reais.
  dadosTributo?: DadosTributo;
};

export type NfLiquidacao = { tipoIdentificacao: "1" | "2" | "3"; numero?: string };

/** Datas em yyyy-mm-dd; competencia/referencia em MMAAAA. Soma dos valores = valor do item. */
export type DadosTributo =
  | { tributo: "GPS"; codigoPagamento: string; competencia: string; identificador: string; valorTributo: number; valorOutrasEntidades: number; atualizacaoMonetaria: number }
  | { tributo: "DARF"; codigoReceita: string; periodoApuracao: string; referencia?: string; valorPrincipal: number; multa: number; juros: number; vencimento: string }
  | { tributo: "DARF_SIMPLES"; codigoReceita: string; periodoApuracao: string; receitaBruta: number; percentual: number; valorPrincipal: number; multa: number; juros: number; vencimento: string }
  | { tributo: "GARE_SP"; codigoReceita: string; inscricaoEstadual: string; dividaAtiva?: string; referencia: string; parcela?: string; valorReceita: number; juros: number; multa: number; vencimento: string }
  | { tributo: "IPVA" | "DPVAT"; exercicio: string; renavam: string; uf: string; codigoMunicipio?: string; placa: string; opcaoPagamento: string; valorTributo: number; desconto: number; vencimento?: string }
  | { tributo: "FGTS"; codigoReceita: string; tipoInscricao: "1" | "2"; codigoBarras: string; identificador: string; lacre: string; digitoLacre: string };

export type OcorrenciaRetorno = {
  codigo: string;
  descricao: string;
};

export type ItemRetorno = {
  segmento: "A" | "J" | "O" | "N";
  formaPagamento: string;
  contaDebito: ContaDebito;
  dataProgramada: Date | null;
  valorProgramado: number;
  codigoBarras?: string;
  favorecidoDocumento?: string;
  contaFavorecido?: { banco: string; agencia: string; conta: string; dac: string };
  referenciaEmpresa: string; // "Seu Numero" lido de volta -- usado pra casar com o item da remessa
  nossoNumero: string | null;
  dataEfetiva: Date | null;
  valorEfetivo: number | null;
  ocorrencias: OcorrenciaRetorno[];
};

export type ArquivoRetornoLido = {
  codigoBanco: string;
  dataGeracao: Date | null;
  itens: ItemRetorno[];
  totalRegistrosLote: number;
};
