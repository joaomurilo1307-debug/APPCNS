// Gerador do arquivo de remessa CNAB240 SISPAG (Itau, layout versao 086),
// escopo "Fornecedores" (tipo 20): Segmento A (credito em conta / TED) e
// Segmento J (boleto em cobranca no Itau ou em outros bancos). Tributos,
// concessionarias e holerite ficam fora deste escopo -- ver
// docs/integracao-itau.md.
//
// Cada linha tem exatamente 240 bytes; o arquivo e' texto puro (CRLF),
// sem compactacao, conforme "2.1 - Intercambio de informacoes" do manual.

import { alfa, brancos, dataDDMMAAAA, horaHHMMSS, montarRegistro, numero, valorMonetario, zeros } from "./campos";
import { CODIGO_BANCO_ITAU, TIPO_MOVIMENTO, TIPO_PAGAMENTO_FORNECEDORES, segmentoDaForma } from "./constantes";
import { dataVencimentoDoFator, parseCodigoBarras, valorDoCodigoBarras } from "./codigoBarras";
import type { ContaDebito, ItemRemessa } from "./tipos";

const QUEBRA_LINHA = "\r\n";

function headerArquivo(conta: ContaDebito, dataGeracao: Date): string {
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    zeros(4), // codigo do lote
    numero(0, 1), // tipo de registro = 0
    brancos(6),
    numero(80, 3), // layout do arquivo
    numero(2, 1), // empresa-inscricao = CNPJ
    numero(conta.cnpj, 14),
    brancos(20),
    numero(conta.agencia, 5),
    brancos(1),
    numero(conta.conta, 12),
    brancos(1),
    numero(conta.dac, 1),
    alfa(conta.nomeEmpresa, 30),
    alfa("BANCO ITAU SA", 30),
    brancos(10),
    numero(1, 1), // arquivo-codigo = 1 (remessa)
    dataDDMMAAAA(dataGeracao),
    horaHHMMSS(dataGeracao),
    zeros(9),
    zeros(5), // unidade de densidade -- Nota 2: zeros no teleprocessamento
    brancos(69),
  ]);
}

function agenciaContaFavorecido(item: ItemRemessa): string {
  const banco = (item.bancoFavorecido ?? "").padStart(3, "0");
  const agencia = item.agenciaFavorecido ?? "";
  const conta = item.contaFavorecido ?? "";
  const dac = item.dacFavorecido ?? "";
  // Nota 11: layout muda conforme o banco favorecido seja Itau(341)/Unibanco(409) ou nao.
  if (banco === "341" || banco === "409") {
    return [numero(0, 1), numero(agencia, 4), brancos(1), zeros(6), numero(conta, 6), brancos(1), numero(dac, 1)].join("");
  }
  return [numero(agencia, 5), brancos(1), numero(conta, 12), brancos(1), alfa(dac, 1)].join("");
}

function montarHeaderLote(conta: ContaDebito, numeroLote: string, formaPagamento: string, layoutLote: string): string {
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(1, 1),
    "C",
    numero(TIPO_PAGAMENTO_FORNECEDORES, 2),
    numero(formaPagamento, 2),
    numero(layoutLote, 3),
    brancos(1),
    numero(2, 1),
    numero(conta.cnpj, 14),
    brancos(4),
    brancos(16),
    numero(conta.agencia, 5),
    brancos(1),
    numero(conta.conta, 12),
    brancos(1),
    numero(conta.dac, 1),
    alfa(conta.nomeEmpresa, 30),
    brancos(30),
    brancos(10),
    brancos(30),
    zeros(5),
    brancos(15),
    brancos(20),
    zeros(8),
    brancos(2),
    brancos(8),
    brancos(10),
  ]);
}

function detalheSegmentoA(numeroLote: string, numeroRegistro: number, item: ItemRemessa): string {
  const finalidadeTed = "00005"; // Nota 26: "Pagamento de Fornecedores"
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "A",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    zeros(3), // camara centralizadora (so' TED p/ corretora)
    numero(item.bancoFavorecido ?? CODIGO_BANCO_ITAU, 3),
    agenciaContaFavorecido(item),
    alfa(item.favorecidoNome, 30),
    alfa(item.referenciaEmpresa, 20), // "seu numero"
    dataDDMMAAAA(item.dataPagamento),
    alfa("REA", 3), // moeda
    brancos(8), // codigo ISPB
    brancos(2), // identificacao transferencia conta pagamento / PIX (nao usado)
    zeros(5),
    valorMonetario(item.valor, 13, 2),
    brancos(15), // nosso numero (so' retorno)
    brancos(5),
    zeros(8), // data efetiva (so' retorno)
    zeros(15), // valor efetivo (so' retorno) -- 13+2
    brancos(20), // finalidade detalhe
    zeros(6), // numero do documento (so' retorno)
    numero(item.favorecidoDocumento, 14),
    brancos(2), // finalidade doc / status funcionario
    alfa(finalidadeTed, 5),
    brancos(5),
    "0", // aviso ao favorecido: nao emite
    brancos(10), // ocorrencias (so' retorno)
  ]);
}

function detalheSegmentoJ(numeroLote: string, numeroRegistro: number, item: ItemRemessa): string {
  const barras = parseCodigoBarras(item.codigoBarras ?? "");
  // Vencimento e valor nominais vem do proprio codigo de barras (o banco
  // considera o fator de vencimento do codigo acima de qualquer data
  // digitada -- Anexo A, nota (b)). Quando o valor pago difere do nominal
  // (juros/multa ou desconto), a diferenca vai nos campos proprios do layout.
  const vencimento = dataVencimentoDoFator(barras.fatorVencimento, item.dataPagamento) ?? item.dataPagamento;
  const nominal = valorDoCodigoBarras(barras.valor) || item.valor;
  const diferenca = Math.round((item.valor - nominal) * 100) / 100;
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "J",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    barras.bancoFavorecido,
    barras.moeda,
    barras.dvCodigoBarras,
    barras.fatorVencimento,
    barras.valor,
    barras.campoLivre,
    alfa(item.favorecidoNome, 30),
    dataDDMMAAAA(vencimento), // vencimento nominal
    valorMonetario(nominal, 13, 2), // valor do titulo (nominal)
    valorMonetario(diferenca < 0 ? -diferenca : 0, 13, 2), // descontos + abatimento
    valorMonetario(diferenca > 0 ? diferenca : 0, 13, 2), // mora + multa
    dataDDMMAAAA(item.dataPagamento),
    valorMonetario(item.valor, 13, 2), // valor do pagamento
    zeros(15),
    alfa(item.referenciaEmpresa, 20), // seu numero
    brancos(13),
    brancos(15), // nosso numero (so' retorno)
    brancos(10), // ocorrencias (so' retorno)
  ]);
}

// Segmento J-52: dados do pagador (sacado) e do beneficiario (cedente) do
// boleto. Obrigatorio para as formas 30 e 31 desde 01/09/2019 -- sem ele, ou
// com o cedente sem CPF/CNPJ valido, o banco rejeita o pagamento (ocorrencia
// "BI"). Vai logo apos o Segmento J correspondente e repete o mesmo numero
// de registro (Nota 9). O pagador e' sempre a propria empresa debitada; o
// beneficiario e' o favorecido do boleto.
function detalheSegmentoJ52(numeroLote: string, numeroRegistro: number, item: ItemRemessa, conta: ContaDebito): string {
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "J",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    "52",
    numero(2, 1), // tipo inscricao do sacado: CNPJ (conta debitada e' sempre de empresa)
    numero(conta.cnpj, 15),
    alfa(conta.nomeEmpresa, 40),
    numero(item.favorecidoTipoDocumento, 1), // tipo inscricao do cedente
    numero(item.favorecidoDocumento, 15),
    alfa(item.favorecidoNome, 40),
    numero(0, 1), // sacador avalista: nao informado
    zeros(15),
    brancos(40),
    brancos(53),
  ]);
}

function trailerLote(numeroLote: string, qtdRegistros: number, totalValor: number): string {
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(5, 1),
    brancos(9),
    numero(qtdRegistros, 6),
    valorMonetario(totalValor, 16, 2),
    zeros(18),
    brancos(171),
    brancos(10),
  ]);
}

function trailerArquivo(qtdLotes: number, qtdRegistrosTotal: number): string {
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(9999, 4),
    numero(9, 1),
    brancos(9),
    numero(qtdLotes, 6),
    numero(qtdRegistrosTotal, 6),
    brancos(211),
  ]);
}

export type LoteGerado = {
  numeroLote: string;
  formaPagamento: string;
  segmento: "A" | "J";
  quantidadeItens: number;
  valorTotal: number;
};

export type ResultadoRemessa = {
  conteudo: string;
  totalRegistros: number;
  totalValor: number;
  lotes: LoteGerado[];
};

/**
 * Agrupa os itens por forma de pagamento (um lote SO pode ter uma forma --
 * "2.2 Explicacoes gerais sobre o arquivo" do manual) e monta o arquivo
 * inteiro. A ordem dos lotes segue a ordem em que cada forma aparece pela
 * primeira vez na lista de itens.
 */
export function gerarArquivoRemessa(conta: ContaDebito, itens: ItemRemessa[], dataGeracao: Date = new Date()): ResultadoRemessa {
  if (itens.length === 0) throw new Error("Nenhum item para gerar remessa.");

  const formasNaOrdem: string[] = [];
  const porForma = new Map<string, ItemRemessa[]>();
  for (const item of itens) {
    if (!porForma.has(item.formaPagamento)) {
      porForma.set(item.formaPagamento, []);
      formasNaOrdem.push(item.formaPagamento);
    }
    porForma.get(item.formaPagamento)!.push(item);
  }

  const linhas: string[] = [headerArquivo(conta, dataGeracao)];
  const lotes: LoteGerado[] = [];
  let numeroLoteAtual = 0;
  let totalRegistros = 1; // header de arquivo

  for (const forma of formasNaOrdem) {
    numeroLoteAtual += 1;
    const numeroLoteStr = String(numeroLoteAtual).padStart(4, "0");
    const itensDoLote = porForma.get(forma)!;
    const segmento = segmentoDaForma(forma);
    const layoutLote = segmento === "J" ? "030" : "040";

    linhas.push(montarHeaderLote(conta, numeroLoteStr, forma, layoutLote));
    totalRegistros += 1;

    let valorTotalLote = 0;
    let registrosDetalhe = 0;
    itensDoLote.forEach((item, idx) => {
      const numeroRegistro = idx + 1;
      if (segmento === "J") {
        linhas.push(detalheSegmentoJ(numeroLoteStr, numeroRegistro, item));
        linhas.push(detalheSegmentoJ52(numeroLoteStr, numeroRegistro, item, conta));
        registrosDetalhe += 2;
      } else {
        linhas.push(detalheSegmentoA(numeroLoteStr, numeroRegistro, item));
        registrosDetalhe += 1;
      }
      valorTotalLote += item.valor;
    });
    totalRegistros += registrosDetalhe;

    // qtd registros do lote inclui header+detalhes (todos os segmentos)+trailer (Nota 17)
    linhas.push(trailerLote(numeroLoteStr, registrosDetalhe + 2, valorTotalLote));
    totalRegistros += 1;

    lotes.push({ numeroLote: numeroLoteStr, formaPagamento: forma, segmento, quantidadeItens: itensDoLote.length, valorTotal: valorTotalLote });
  }

  linhas.push(trailerArquivo(numeroLoteAtual, totalRegistros + 1));
  totalRegistros += 1;

  return {
    conteudo: linhas.join(QUEBRA_LINHA) + QUEBRA_LINHA,
    totalRegistros,
    totalValor: itens.reduce((s, i) => s + i.valor, 0),
    lotes,
  };
}
