// Formas SISPAG adicionadas em 13/10/2026 (manual CNAB 085): cada uma gera
// registros de 240 bytes nas posicoes do manual, volta pelo leitor de retorno
// e tem as validacoes que impedem um arquivo que o banco recusaria.
import { test } from "node:test";
import assert from "node:assert/strict";
import { gerarArquivoRemessa } from "../src/lib/cnab240/itau/remessa";
import { lerArquivoRetorno } from "../src/lib/cnab240/itau/retorno";
import { arrecadacaoParaCodigoBarras } from "../src/lib/cnab240/itau/codigoBarras";
import { lerPixCopiaECola } from "../src/lib/cnab240/itau/pixQrCode";
import { validarItemRemessa } from "../src/lib/cnab240/itau/validacaoItem";
import { formaCoerente } from "../src/lib/pagamentos/conferenciaRemessa";
import { montarRetornoSimulado } from "../src/lib/pagamentos/casarRetorno";
import type { ContaDebito, ItemRemessa } from "../src/lib/cnab240/itau/tipos";

const conta: ContaDebito = { cnpj: "07080673000148", agencia: "5605", conta: "99624", dac: "7", nomeEmpresa: "CONSOMINAS ENGENHARIA LTDA" };
const dia = new Date("2026-10-20T00:00:00Z");
const pos = (l: string, de: number, ate: number) => l.slice(de - 1, ate);
// Exemplo de QR estatico do Manual de Padroes para Iniciacao do Pix (BCB).
const QR_BCB = "00020126580014br.gov.bcb.pix0136123e4567-e12b-12d1-a456-4266554400005204000053039865802BR5913Fulano de Tal6008BRASILIA62070503***63041D3D";
const SANEAGO = "826500000003816701066234019425090529837800000007"; // conta real 007944 (05/10/2026), R$ 81,67
const SEF_MG = "856500000000140602132619230123226071055520002258"; // guia real 007950, R$ 14,06

let seq = 0;
function item(forma: string, extra: Partial<ItemRemessa> = {}): ItemRemessa {
  seq += 1;
  return {
    referenciaEmpresa: `TESTE-${String(seq).padStart(4, "0")}`, numeroSequencial: seq, formaPagamento: forma as ItemRemessa["formaPagamento"],
    favorecidoNome: "FORNECEDOR TESTE", favorecidoTipoDocumento: "2", favorecidoDocumento: "07080673000148", valor: 100, dataPagamento: dia, ...extra,
  };
}

function gerarERetornar(itens: ItemRemessa[]) {
  const r = gerarArquivoRemessa(conta, itens, dia);
  const linhas = r.conteudo.split("\r\n").filter(Boolean);
  assert.ok(linhas.every((l) => l.length === 240), "toda linha com 240 bytes");
  const retorno = lerArquivoRetorno(montarRetornoSimulado(r.conteudo));
  assert.deepEqual(retorno.itens.map((i) => i.referenciaEmpresa), itens.map((i) => i.referenciaEmpresa));
  for (const [k, i] of retorno.itens.entries()) {
    assert.equal(i.ocorrencias[0].codigo, "00");
    assert.equal(i.valorEfetivo, itens[k].valor, `valor efetivo lido de volta (${i.segmento})`);
    assert.equal(i.dataEfetiva?.toISOString().slice(0, 10), "2026-10-20");
  }
  return { r, linhas, retorno };
}

test("Segmento A: cheque e OP levam so' a agencia; poupanca, mesmo titular e NF no layout do manual", () => {
  const { linhas, r } = gerarERetornar([
    item("02", { bancoFavorecido: "341", agenciaFavorecido: "1234" }),
    item("10", { bancoFavorecido: "341", agenciaFavorecido: "4321" }),
    item("05", { bancoFavorecido: "341", agenciaFavorecido: "1111", contaFavorecido: "22222", dacFavorecido: "3" }),
    item("06", { bancoFavorecido: "341", agenciaFavorecido: "1111", contaFavorecido: "22222", dacFavorecido: "3" }),
    item("32", { nfLiquidacao: { tipoIdentificacao: "2", numero: "12345" }, bancoFavorecido: "237", agenciaFavorecido: "1961", contaFavorecido: "11674", dacFavorecido: "2" }),
  ]);
  assert.deepEqual(r.lotes.map((l) => [l.formaPagamento, l.segmento]), [["02", "A"], ["10", "A"], ["05", "A"], ["06", "A"], ["32", "A"]]);
  const cheque = linhas[2];
  assert.equal(pos(cheque, 24, 43), "01234 000000000000 0"); // Nota 11 a: conta e DAC zerados
  assert.equal(pos(linhas[1], 10, 16), "2002040"); // header: tipo 20, forma 02, layout 040
  const nf = linhas[14];
  assert.equal(pos(nf, 14, 14), "A");
  assert.equal(pos(nf, 178, 191), "00012345      "); // Nota 31: numero da NF em 178-185
  assert.equal(pos(nf, 218, 218), "2"); // Nota 32
});

test("Segmento J forma 47: codigo de barras zerado (Nota 18) e J-52 PIX com chave e TXID", () => {
  const { linhas } = gerarERetornar([item("47", { pixCopiaECola: QR_BCB })]);
  assert.equal(pos(linhas[1], 10, 16), "2047030");
  assert.equal(pos(linhas[2], 18, 61), "0".repeat(44));
  const j52 = linhas[3];
  assert.equal(pos(j52, 18, 19), "52");
  assert.equal(pos(j52, 132, 208).trim(), "123e4567-e12b-12d1-a456-426655440000"); // chave preservada em minusculo
  assert.equal(pos(j52, 209, 240).trim(), ""); // TXID "***" = sem identificador
});

test("Segmento O: concessionaria tipo 20 e tributo com barras tipo 22, trailer com quantidade de moeda", () => {
  const { linhas, r } = gerarERetornar([
    item("13", { codigoBarras: arrecadacaoParaCodigoBarras(SANEAGO), valor: 81.67 }),
    item("91", { codigoBarras: arrecadacaoParaCodigoBarras(SEF_MG), valor: 14.06 }),
  ]);
  assert.deepEqual(r.lotes.map((l) => l.segmento), ["O", "O"]);
  assert.equal(pos(linhas[1], 10, 16), "2013030");
  assert.equal(pos(linhas[4], 10, 16), "2291030");
  assert.equal(pos(linhas[2], 18, 61), "82650000000816701066230194250905283780000000");
  assert.equal(pos(linhas[2], 122, 136), "000000000008167");
  assert.equal(pos(linhas[3], 24, 41), "000000000000008167"); // trailer do lote O
  assert.throws(() => gerarArquivoRemessa(conta, [item("13", { codigoBarras: arrecadacaoParaCodigoBarras(SANEAGO), valor: 80 })], dia), /diferente do valor do codigo de barras/);
});

test("Segmento N: DARF, GPS, DARF Simples, GARE, IPVA, DPVAT e FGTS com os campos do Anexo C e totais no trailer", () => {
  const darf = item("16", { valor: 110, dadosTributo: { tributo: "DARF", codigoReceita: "5952", periodoApuracao: "2026-09-30", valorPrincipal: 100, multa: 6, juros: 4, vencimento: "2026-10-20" } });
  const gps = item("17", { valor: 150, dadosTributo: { tributo: "GPS", codigoPagamento: "2100", competencia: "092026", identificador: "07080673000148", valorTributo: 120, valorOutrasEntidades: 25, atualizacaoMonetaria: 5 } });
  const simples = item("18", { valor: 50, dadosTributo: { tributo: "DARF_SIMPLES", codigoReceita: "6106", periodoApuracao: "2026-09-30", receitaBruta: 100000, percentual: 4.5, valorPrincipal: 50, multa: 0, juros: 0, vencimento: "2026-10-20" } });
  const gare = item("22", { valor: 70, dadosTributo: { tributo: "GARE_SP", codigoReceita: "0463", inscricaoEstadual: "123456789012", referencia: "092026", valorReceita: 70, juros: 0, multa: 0, vencimento: "2026-10-20" } });
  const ipva = item("25", { valor: 90, dadosTributo: { tributo: "IPVA", exercicio: "2026", renavam: "123456789012", uf: "MG", codigoMunicipio: "4123", placa: "ABC1D23", opcaoPagamento: "1", valorTributo: 100, desconto: 10, vencimento: "2026-10-20" } });
  const dpvat = item("27", { valor: 60, dadosTributo: { tributo: "DPVAT", exercicio: "2026", renavam: "123456789", uf: "SP", placa: "XYZ9876", opcaoPagamento: "0", valorTributo: 60, desconto: 0 } });
  const fgts = item("35", { valor: 80, dadosTributo: { tributo: "FGTS", codigoReceita: "0115", tipoInscricao: "1", codigoBarras: "8".padEnd(48, "1"), identificador: "1234567890123456", lacre: "123456789", digitoLacre: "12" } });
  const { linhas, r } = gerarERetornar([darf, gps, simples, gare, ipva, dpvat, fgts]);
  assert.ok(r.lotes.every((l) => l.segmento === "N"));
  const detalhe = (forma: string) => linhas.find((l, i) => l[13] === "N" && pos(linhas[i - 1], 12, 13) === forma)!;
  assert.equal(pos(linhas[1], 10, 16), "2216030"); // tributos: tipo 22
  const d = detalhe("16");
  assert.equal(pos(d, 18, 19), "02");
  assert.equal(pos(d, 20, 23), "5952");
  assert.equal(pos(d, 25, 38), "07080673000148");
  assert.equal(pos(d, 39, 46), "30092026");
  assert.equal(pos(d, 106, 119), "00000000011000");
  assert.equal(pos(d, 196, 215).trim(), darf.referenciaEmpresa);
  const g = detalhe("17");
  assert.equal(pos(g, 18, 29), "012100092026");
  assert.equal(pos(g, 86, 99), "00000000015000");
  const ip = detalhe("25");
  assert.equal(pos(ip, 43, 51), "000000000"); // RENAVAM de 12 vai em 154-165
  assert.equal(pos(ip, 154, 165), "123456789012");
  assert.equal(pos(detalhe("27"), 43, 51), "123456789");
  // Trailer do lote GPS: principal 120, outras entidades 25, acrescimos 5, total 150 (pag. 42).
  const trailerGps = linhas[linhas.indexOf(g) + 1];
  assert.equal(pos(trailerGps, 24, 79), "00000000012000" + "00000000002500" + "00000000000500" + "00000000015000");
});

test("PIX QR-Code e PIX transferencia vao em arquivo separado das demais formas", () => {
  assert.throws(() => gerarArquivoRemessa(conta, [item("47", { pixCopiaECola: QR_BCB }), item("13", { codigoBarras: arrecadacaoParaCodigoBarras(SANEAGO), valor: 81.67 })], dia), /PIX/);
});

test("Leitura do PIX copia e cola confere CRC e GUI", () => {
  assert.equal(lerPixCopiaECola(QR_BCB).nomeRecebedor, "Fulano de Tal");
  assert.throws(() => lerPixCopiaECola(QR_BCB.slice(0, -1) + "0"), /CRC/);
  assert.throws(() => lerPixCopiaECola("123"), /000201/);
});

test("Validacao: codigo de arrecadacao, guia incompleta, soma das partes e conta nao-Itau em forma so' Itau", () => {
  const base = { favorecidoNome: "X", favorecidoDocumento: "07080673000148", dataPagamento: "2026-10-20" };
  const msgs = (i: object) => validarItemRemessa({ ...base, ...i } as any, "2026-10-13").map((p) => p.mensagem).join(" | ");
  assert.equal(msgs({ formaPagamento: "13", codigoBarras: SANEAGO, valor: 81.67 }), "");
  assert.match(msgs({ formaPagamento: "13", codigoBarras: SANEAGO.slice(0, -1) + "1", valor: 81.67 }), /digito verificador/);
  assert.match(msgs({ formaPagamento: "13", codigoBarras: SANEAGO, valor: 90 }), /81\.67/);
  assert.equal(msgs({ formaPagamento: "16", valor: 110, dadosTributo: { tributo: "DARF", codigoReceita: "5952", periodoApuracao: "2026-09-30", valorPrincipal: 100, multa: 6, juros: 4, vencimento: "2026-10-20" } }), "");
  assert.match(msgs({ formaPagamento: "16", valor: 110 }), /dados da guia/);
  assert.match(msgs({ formaPagamento: "16", valor: 120, dadosTributo: { tributo: "DARF", codigoReceita: "5952", periodoApuracao: "2026-09-30", valorPrincipal: 100, multa: 6, juros: 4, vencimento: "2026-10-20" } }), /somam R\$ 110\.00/);
  assert.match(msgs({ formaPagamento: "17", valor: 10, dadosTributo: { tributo: "DARF", codigoReceita: "1", periodoApuracao: "2026-09-30", valorPrincipal: 10, multa: 0, juros: 0, vencimento: "2026-10-20" } }), /forma 17 é GPS/);
  assert.match(msgs({ formaPagamento: "05", valor: 10, bancoFavorecido: "237", agenciaFavorecido: "1", contaFavorecido: "2", dacFavorecido: "3" }), /só credita conta no Itaú/);
  assert.match(msgs({ formaPagamento: "47", valor: 10, pixCopiaECola: "" }), /copia e cola/);
  assert.match(msgs({ formaPagamento: "32", valor: 10, bancoFavorecido: "341" }), /Escolha como a NF/);
  assert.equal(msgs({ formaPagamento: "02", valor: 10, bancoFavorecido: "341", agenciaFavorecido: "1234" }), "");
});

test("Forma coerente: codigo de arrecadacao digitado como boleto vira Segmento O com a forma do Anexo B", () => {
  assert.equal(formaCoerente({ formaPagamento: "31", codigoBarras: SANEAGO }).forma, "13");
  assert.equal(formaCoerente({ formaPagamento: "13", codigoBarras: SEF_MG }).forma, "91");
  assert.equal(formaCoerente({ formaPagamento: "13", codigoBarras: SANEAGO }).motivo, null);
});
