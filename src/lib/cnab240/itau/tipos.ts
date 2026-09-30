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
};

export type OcorrenciaRetorno = {
  codigo: string;
  descricao: string;
};

export type ItemRetorno = {
  segmento: "A" | "J";
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
