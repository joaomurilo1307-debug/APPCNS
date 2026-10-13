// Gerador do arquivo de remessa CNAB240 SISPAG (Itau). Todas as formas da
// Nota 5 que servem a contas a pagar (ver constantes.ts): Segmento A
// (credito/poupanca/cheque/OP/TED/PIX/NF liquidacao), J (boleto e PIX
// QR-Code), O (concessionaria/tributo com codigo de barras) e N (tributo sem
// codigo de barras, Anexo C). Holerite (C/D/E/F) fica fora.
//
// Cada linha tem exatamente 240 bytes; o arquivo e' texto puro (CRLF),
// sem compactacao, conforme "2.1 - Intercambio de informacoes" do manual.

import { alfa, brancos, dataDDMMAAAA, horaHHMMSS, montarRegistro, numero, valorMonetario, zeros } from "./campos";
import {
  CODIGO_BANCO_ITAU,
  CODIGO_COMPENSACAO_PIX,
  FORMA_PAGAMENTO,
  TIPO_MOVIMENTO,
  TIPO_TRANSFERENCIA_PIX,
  TRIBUTO_DA_FORMA,
  ehFormaPix,
  formaSoAgencia,
  layoutLoteDaForma,
  segmentoDaForma,
  tipoPagamentoDaForma,
  type Segmento,
} from "./constantes";
import { dataVencimentoDoFator, parseCodigoBarras, valorDaArrecadacao, valorDoCodigoBarras } from "./codigoBarras";
import { lerPixCopiaECola } from "./pixQrCode";
import type { ContaDebito, DadosTributo, ItemRemessa } from "./tipos";

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
    // Nota 11 a: cheque (02) e OP (10) levam so' a agencia onde ficam a disposicao.
    if (formaSoAgencia(item.formaPagamento)) return [numero(0, 1), numero(agencia, 4), brancos(1), zeros(6), zeros(6), brancos(1), zeros(1)].join("");
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
    numero(tipoPagamentoDaForma(formaPagamento), 2),
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
  if (item.formaPagamento === FORMA_PAGAMENTO.NF_LIQUIDACAO_ELETRONICA) return detalheSegmentoANotaFiscal(numeroLote, numeroRegistro, item);
  // Nota 26 "Pagamento de Fornecedores": mantido como sempre foi nas formas ja
  // usadas (01/41/43/45); nas novas (cheque, poupanca, mesmo titular, OP) nao
  // ha TED, entao vai em branco.
  const formasComFinalidade: string[] = [FORMA_PAGAMENTO.CREDITO_CONTA_ITAU, FORMA_PAGAMENTO.TED_OUTRO_TITULAR, FORMA_PAGAMENTO.TED_MESMO_TITULAR, FORMA_PAGAMENTO.PIX_TRANSFERENCIA];
  const finalidadeTed = formasComFinalidade.includes(item.formaPagamento) ? "00005" : "";
  const ehPix = item.formaPagamento === FORMA_PAGAMENTO.PIX_TRANSFERENCIA;
  const temContaReal = !!(item.bancoFavorecido && item.agenciaFavorecido && item.contaFavorecido && item.dacFavorecido);
  // Nota 71/36: PIX leva "009" (codigo de compensacao do SPI) nas posicoes
  // 018-020, no lugar da camara/zeros de um TED comum, e o tipo de
  // transferencia nas posicoes 113-114. Modelo "Chave" (04) quando nao ha
  // conta bancaria real do favorecido -- e' o caso de quem so' tem Pix
  // cadastrado na Senior, sem banco/agencia/conta.
  const tipoTransferenciaPix = temContaReal ? TIPO_TRANSFERENCIA_PIX.CONTA_CORRENTE : TIPO_TRANSFERENCIA_PIX.CHAVE;
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "A",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    ehPix ? numero(CODIGO_COMPENSACAO_PIX, 3) : zeros(3), // camara centralizadora (so' TED p/ corretora) / codigo SPI pra PIX
    // Banco favorecido "000" quando PIX via chave sem conta real -- nao
    // existe banco de verdade a declarar (achado 01/10/2026, Radioenlace e
    // outros fornecedores so' com chave Pix cadastrada).
    numero(item.bancoFavorecido ?? (ehPix && !temContaReal ? "0" : CODIGO_BANCO_ITAU), 3),
    agenciaContaFavorecido(item),
    alfa(item.favorecidoNome, 30),
    alfa(item.referenciaEmpresa, 20), // "seu numero"
    dataDDMMAAAA(item.dataPagamento),
    alfa("REA", 3), // moeda
    brancos(8), // codigo ISPB -- so' exigido p/ TED conta pagamento (Nota 35), nao pro modelo Chave
    ehPix ? alfa(tipoTransferenciaPix, 2) : brancos(2), // identificacao transferencia conta pagamento / PIX (Nota 36)
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

// Segmento B obrigatorio pra PIX Transferencia no modelo "Chave" (manual
// pag. 22, Nota 37) -- carrega a chave Pix de verdade. So' gerado quando o
// item e' PIX; vai sempre logo apos o Segmento A correspondente, mesmo
// numero de registro (Nota 9).
function detalheSegmentoBPix(numeroLote: string, numeroRegistro: number, item: ItemRemessa): string {
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "B",
    alfa(item.chavePixTipo ?? "", 2), // tipo chave: 01 telefone / 02 e-mail / 03 CPF-CNPJ / 04 aleatoria
    brancos(1),
    numero(item.favorecidoTipoDocumento, 1),
    numero(item.favorecidoDocumento, 14),
    brancos(30), // posicoes 33-62, sem nome no manual -- preenchimento
    brancos(65), // informacoes entre usuarios (63-127, opcional, nao usamos)
    alfa(item.chavePixValor ?? "", 100), // chave de enderecamento (Nota 40)
    brancos(3),
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

// Segmento A, variante "Nota Fiscal - Liquidacao Eletronica" (forma 32, pag. 16).
function detalheSegmentoANotaFiscal(numeroLote: string, numeroRegistro: number, item: ItemRemessa): string {
  const nf = item.nfLiquidacao;
  if (!nf) throw new Error("NF - Liquidacao Eletronica sem tipo de identificacao (Nota 32).");
  // Nota 31: por numero de NF usa so' 178-185 (8 posicoes) + brancos; por CNPJ de terceiro, as 14.
  const numeroNf =
    nf.tipoIdentificacao === "2" ? numero(nf.numero ?? "", 8) + brancos(6) : nf.tipoIdentificacao === "3" ? numero(nf.numero ?? "", 14) : zeros(14);
  const temConta = !!(item.bancoFavorecido && item.agenciaFavorecido && item.contaFavorecido);
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "A",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    zeros(3),
    temConta ? numero(item.bancoFavorecido!, 3) : zeros(3),
    temConta ? agenciaContaFavorecido(item) : zeros(20),
    alfa(item.favorecidoNome, 30),
    alfa(item.referenciaEmpresa, 20),
    dataDDMMAAAA(item.dataPagamento),
    alfa("REA", 3),
    zeros(15),
    valorMonetario(item.valor, 13, 2),
    brancos(15), // nosso numero (so' retorno)
    brancos(5),
    zeros(8), // data efetiva (so' retorno)
    zeros(15), // valor efetivo (so' retorno)
    numeroNf,
    brancos(6),
    zeros(6), // numero do documento (so' retorno)
    numero(item.favorecidoDocumento, 14),
    numero(nf.tipoIdentificacao, 1),
    brancos(11),
    "0", // aviso ao favorecido: nao emite
    brancos(10),
  ]);
}

// Segmento J da forma 47 (PIX QR-Code): a Nota 18 manda zerar banco, moeda, DV,
// vencimento, valor e campo livre do codigo de barras.
function detalheSegmentoJPix(numeroLote: string, numeroRegistro: number, item: ItemRemessa): string {
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "J",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    zeros(44),
    alfa(item.favorecidoNome, 30),
    dataDDMMAAAA(item.dataPagamento), // vencimento nominal
    valorMonetario(item.valor, 13, 2), // valor do titulo
    zeros(15), // descontos
    zeros(15), // acrescimos
    dataDDMMAAAA(item.dataPagamento),
    valorMonetario(item.valor, 13, 2),
    zeros(15),
    alfa(item.referenciaEmpresa, 20),
    brancos(13),
    brancos(15),
    brancos(10),
  ]);
}

// Segmento J-52 PIX (pag. 28): sacado/cedente como no J-52 + chave ou URL do QR (Nota 41) e TXID (Nota 38).
function detalheSegmentoJ52Pix(numeroLote: string, numeroRegistro: number, item: ItemRemessa, conta: ContaDebito): string {
  const qr = lerPixCopiaECola(item.pixCopiaECola ?? "");
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "J",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    "52",
    numero(2, 1),
    numero(conta.cnpj, 15),
    alfa(conta.nomeEmpresa, 40),
    numero(item.favorecidoTipoDocumento, 1),
    numero(item.favorecidoDocumento, 15),
    alfa(item.favorecidoNome, 40),
    // Chave/URL e TXID diferenciam maiusculas: sem alfa() (que converte).
    qr.chaveOuUrl.padEnd(77, " "),
    qr.txid.padEnd(32, " "),
  ]);
}

// Segmento O (pag. 34): concessionaria / tributo com codigo de barras. O
// codigo vai como 44 digitos em 018-061 (Anexo B item 1) e 4 brancos; o
// Anexo B tambem aceita a representacao de 48 nas mesmas posicoes.
function detalheSegmentoO(numeroLote: string, numeroRegistro: number, item: ItemRemessa): string {
  const cb = item.codigoBarras ?? "";
  const nominal = valorDaArrecadacao(cb);
  if (nominal !== null && Math.round(nominal * 100) !== Math.round(item.valor * 100)) {
    throw new Error(`Item ${item.referenciaEmpresa}: valor ${item.valor.toFixed(2)} diferente do valor do codigo de barras (${nominal.toFixed(2)}).`);
  }
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "O",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    cb.padEnd(48, " "),
    alfa(item.favorecidoNome, 30), // nome da concessionaria / contribuinte
    dataDDMMAAAA(item.dataPagamento), // vencimento nominal (o codigo de arrecadacao nao traz data)
    alfa("REA", 3),
    zeros(15), // quantidade de moeda (Nota 19: so' moeda diferente de Real)
    valorMonetario(item.valor, 13, 2),
    dataDDMMAAAA(item.dataPagamento),
    zeros(15), // valor pago (so' retorno)
    brancos(3),
    zeros(9), // nota fiscal (Nota 33: so' GNRE-SP 10009.9)
    brancos(3),
    alfa(item.referenciaEmpresa, 20),
    brancos(21),
    brancos(15),
    brancos(10),
  ]);
}

const centavos = (v: number) => Math.round(v * 100);

/** Partes do valor de um tributo do Segmento N, pros totais do trailer (pag. 42, Nota 17). */
export function partesDoTributo(d: DadosTributo, valorItem: number): { principal: number; outrasEntidades: number; acrescimos: number } {
  switch (d.tributo) {
    case "GPS":
      return { principal: d.valorTributo, outrasEntidades: d.valorOutrasEntidades, acrescimos: d.atualizacaoMonetaria };
    case "DARF":
    case "DARF_SIMPLES":
      return { principal: d.valorPrincipal, outrasEntidades: 0, acrescimos: d.multa + d.juros };
    case "GARE_SP":
      return { principal: d.valorReceita, outrasEntidades: 0, acrescimos: d.juros + d.multa };
    case "IPVA":
    case "DPVAT":
      return { principal: d.valorTributo, outrasEntidades: d.desconto, acrescimos: 0 };
    case "FGTS":
      return { principal: valorItem, outrasEntidades: 0, acrescimos: 0 };
  }
}

/** Quanto a guia paga segundo as partes informadas -- tem que bater com o valor do item. */
export function totalDoTributo(d: DadosTributo, valorItem: number): number {
  const p = partesDoTributo(d, valorItem);
  if (d.tributo === "IPVA" || d.tributo === "DPVAT") return (centavos(p.principal) - centavos(p.outrasEntidades)) / 100;
  return (centavos(p.principal) + centavos(p.outrasEntidades) + centavos(p.acrescimos)) / 100;
}

const dataOuZeros = (iso: string | undefined) => (iso ? dataDDMMAAAA(new Date(`${iso}T00:00:00Z`)) : zeros(8));

// Inscricao do contribuinte (Anexo C, obs. (1) do DARF): CPF alinhado a esquerda + 3 brancos; CNPJ com zeros a esquerda.
function inscricaoContribuinte(tipo: "1" | "2", documento: string): string {
  return tipo === "1" ? numero(documento, 11) + brancos(3) : numero(documento, 14);
}

// Dados do tributo, posicoes 018-195 (178 bytes), Anexo C.
function dadosDoTributo(item: ItemRemessa): string {
  const d = item.dadosTributo;
  if (!d) throw new Error(`Item ${item.referenciaEmpresa}: tributo sem os dados da guia (Anexo C).`);
  const tipoDoc = item.favorecidoTipoDocumento;
  const doc = item.favorecidoDocumento;
  const nome = alfa(item.favorecidoNome, 30);
  const pagamento = dataDDMMAAAA(item.dataPagamento);
  const valor = (v: number) => valorMonetario(v, 12, 2);
  const codigo = TRIBUTO_DA_FORMA[item.formaPagamento];
  switch (d.tributo) {
    case "GPS":
      return [codigo, numero(d.codigoPagamento, 4), numero(d.competencia, 6), numero(d.identificador, 14), valor(d.valorTributo),
        valor(d.valorOutrasEntidades), valor(d.atualizacaoMonetaria), valor(item.valor), pagamento, brancos(8), brancos(50), nome].join("");
    case "DARF":
      return [codigo, numero(d.codigoReceita, 4), numero(tipoDoc, 1), inscricaoContribuinte(tipoDoc, doc), dataOuZeros(d.periodoApuracao),
        numero(d.referencia || "0", 17), valor(d.valorPrincipal), valor(d.multa), valor(d.juros), valor(item.valor), dataOuZeros(d.vencimento),
        pagamento, brancos(30), nome].join("");
    case "DARF_SIMPLES":
      return [codigo, numero(d.codigoReceita, 4), numero(tipoDoc, 1), inscricaoContribuinte(tipoDoc, doc), dataOuZeros(d.periodoApuracao),
        valorMonetario(d.receitaBruta, 7, 2), valorMonetario(d.percentual, 2, 2), brancos(4), valor(d.valorPrincipal), valor(d.multa), valor(d.juros),
        valor(item.valor), dataOuZeros(d.vencimento), pagamento, brancos(30), nome].join("");
    case "GARE_SP":
      return [codigo, numero(d.codigoReceita, 4), numero(tipoDoc, 1), numero(doc, 14), numero(d.inscricaoEstadual, 12), numero(d.dividaAtiva || "0", 13),
        numero(d.referencia, 6), numero(d.parcela || "0", 13), valor(d.valorReceita), valor(d.juros), valor(d.multa), valor(item.valor),
        dataOuZeros(d.vencimento), pagamento, brancos(11), nome].join("");
    case "IPVA":
    case "DPVAT": {
      // Anexo C obs. (5): RENAVAM de 9 digitos em 043-051; de 12 em 154-165.
      const renavam = d.renavam.replace(/\D/g, "");
      const curto = renavam.length <= 9;
      return [codigo, brancos(4), numero(tipoDoc, 1), numero(doc, 14), numero(d.exercicio, 4), curto ? numero(renavam, 9) : zeros(9), alfa(d.uf, 2),
        numero(d.codigoMunicipio || "0", 5), alfa(d.placa, 7), alfa(d.opcaoPagamento, 1), valor(d.valorTributo), valor(d.desconto), valor(item.valor),
        dataOuZeros(d.vencimento), pagamento, brancos(29), curto ? zeros(12) : numero(renavam, 12), nome].join("");
    }
    case "FGTS":
      return [codigo, numero(d.codigoReceita, 4), numero(d.tipoInscricao, 1), numero(doc, 14), alfa(d.codigoBarras, 48), numero(d.identificador, 16),
        numero(d.lacre, 9), numero(d.digitoLacre, 2), nome, pagamento, valor(item.valor), brancos(30)].join("");
  }
}

// Segmento N (pag. 38): tributo sem codigo de barras / FGTS-GRF.
function detalheSegmentoN(numeroLote: string, numeroRegistro: number, item: ItemRemessa): string {
  const dados = dadosDoTributo(item);
  if (dados.length !== 178) throw new Error(`Dados do tributo com ${dados.length} posicoes (esperado 178) no item ${item.referenciaEmpresa}.`);
  return montarRegistro([
    numero(CODIGO_BANCO_ITAU, 3),
    numero(numeroLote, 4),
    numero(3, 1),
    numero(numeroRegistro, 5),
    "N",
    numero(TIPO_MOVIMENTO.INCLUSAO, 3),
    dados,
    alfa(item.referenciaEmpresa, 20),
    brancos(15),
    brancos(10),
  ]);
}

function trailerLote(numeroLote: string, qtdRegistros: number, totalValor: number, segmento: Segmento, itens: ItemRemessa[]): string {
  const inicio = [numero(CODIGO_BANCO_ITAU, 3), numero(numeroLote, 4), numero(5, 1), brancos(9), numero(qtdRegistros, 6)];
  if (segmento === "N") {
    // Pag. 42: principal, outras entidades (GPS / desconto do IPVA), acrescimos e total arrecadado.
    let principal = 0;
    let outras = 0;
    let acrescimos = 0;
    for (const i of itens) {
      const p = partesDoTributo(i.dadosTributo!, i.valor);
      principal += centavos(p.principal);
      outras += centavos(p.outrasEntidades);
      acrescimos += centavos(p.acrescimos);
    }
    return montarRegistro([
      ...inicio,
      valorMonetario(principal / 100, 12, 2),
      valorMonetario(outras / 100, 12, 2),
      valorMonetario(acrescimos / 100, 12, 2),
      valorMonetario(totalValor, 12, 2),
      brancos(151),
      brancos(10),
    ]);
  }
  // Pag. 36 (O): quantidade de moeda 9(07)V9(08) + 174 brancos; A e J (pags. 24/32): 18 zeros + 171 brancos.
  const complemento = segmento === "O" ? [zeros(15), brancos(174)] : [zeros(18), brancos(171)];
  return montarRegistro([...inicio, valorMonetario(totalValor, 16, 2), ...complemento, brancos(10)]);
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
  segmento: Segmento;
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

  // Manual pag. 8 ("2.2 Explicacoes gerais sobre o arquivo"): "Os lotes de
  // servicos de pagamentos na forma de PIX devem ser enviados
  // obrigatoriamente em arquivo separado das demais formas de pagamento."
  // Nao da pra misturar PIX com TED/boleto no mesmo .rem -- se a selecao
  // tiver as duas coisas, melhor recusar com uma mensagem clara do que gerar
  // um arquivo que o banco provavelmente rejeita inteiro.
  const temPix = itens.some((i) => ehFormaPix(i.formaPagamento));
  const temOutraForma = itens.some((i) => !ehFormaPix(i.formaPagamento));
  if (temPix && temOutraForma) {
    throw new Error(
      "PIX Transferência não pode ir na mesma remessa que outras formas de pagamento (exigência do manual SISPAG) -- gere os itens PIX numa remessa separada dos boletos/TED/crédito."
    );
  }

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
    const layoutLote = layoutLoteDaForma(forma);

    linhas.push(montarHeaderLote(conta, numeroLoteStr, forma, layoutLote));
    totalRegistros += 1;

    let valorTotalLote = 0;
    let registrosDetalhe = 0;
    itensDoLote.forEach((item, idx) => {
      const numeroRegistro = idx + 1;
      if (segmento === "O") {
        linhas.push(detalheSegmentoO(numeroLoteStr, numeroRegistro, item));
        registrosDetalhe += 1;
      } else if (segmento === "N") {
        linhas.push(detalheSegmentoN(numeroLoteStr, numeroRegistro, item));
        registrosDetalhe += 1;
      } else if (item.formaPagamento === FORMA_PAGAMENTO.PIX_QR_CODE) {
        linhas.push(detalheSegmentoJPix(numeroLoteStr, numeroRegistro, item));
        linhas.push(detalheSegmentoJ52Pix(numeroLoteStr, numeroRegistro, item, conta));
        registrosDetalhe += 2;
      } else if (segmento === "J") {
        linhas.push(detalheSegmentoJ(numeroLoteStr, numeroRegistro, item));
        linhas.push(detalheSegmentoJ52(numeroLoteStr, numeroRegistro, item, conta));
        registrosDetalhe += 2;
      } else if (item.formaPagamento === FORMA_PAGAMENTO.PIX_TRANSFERENCIA) {
        // Segmento B so' no modelo "Chave" (tipo de transferencia 04), que e' quando
        // NAO ha conta bancaria completa do favorecido (manual pag. 9: "Obrigatorio
        // para a forma PIX Transferencia no modelo Chave"). Com conta completa o
        // pagamento vai pelos dados bancarios (tipo 01) e o B NAO deve ir.
        //
        // NOTA 07/10/2026: antes o B ia "sempre junto, mesmo com conta real" por
        // precaucao. Mudado pra seguir o manual literalmente (B so' no modelo Chave).
        // ATENCAO: NAO foi validado pelo Itau com arquivo NOSSO -- as rejeicoes reais
        // de 07/10 foram de arquivos gerados pela SENIOR (F510PRM), nao por este
        // gerador. So' o primeiro retorno do Itau a um arquivo nosso confirma isto.
        const temContaReal = !!(item.bancoFavorecido && item.agenciaFavorecido && item.contaFavorecido && item.dacFavorecido);
        linhas.push(detalheSegmentoA(numeroLoteStr, numeroRegistro, item));
        if (temContaReal) {
          registrosDetalhe += 1;
        } else {
          linhas.push(detalheSegmentoBPix(numeroLoteStr, numeroRegistro, item));
          registrosDetalhe += 2;
        }
      } else {
        linhas.push(detalheSegmentoA(numeroLoteStr, numeroRegistro, item));
        registrosDetalhe += 1;
      }
      valorTotalLote += Math.round(item.valor * 100); // totaliza em centavos inteiros
    });
    totalRegistros += registrosDetalhe;

    // qtd registros do lote inclui header+detalhes (todos os segmentos)+trailer (Nota 17)
    valorTotalLote /= 100;
    linhas.push(trailerLote(numeroLoteStr, registrosDetalhe + 2, valorTotalLote, segmento, itensDoLote));
    totalRegistros += 1;

    lotes.push({ numeroLote: numeroLoteStr, formaPagamento: forma, segmento, quantidadeItens: itensDoLote.length, valorTotal: valorTotalLote });
  }

  linhas.push(trailerArquivo(numeroLoteAtual, totalRegistros + 1));
  totalRegistros += 1;

  return {
    conteudo: linhas.join(QUEBRA_LINHA) + QUEBRA_LINHA,
    totalRegistros,
    totalValor: itens.reduce((s, i) => s + Math.round(i.valor * 100), 0) / 100,
    lotes,
  };
}
