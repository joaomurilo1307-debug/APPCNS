import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidarRateioTitulo, lerRespostaEntrada, montarEnvelopeTituloRateio, type TituloNovo } from "../src/lib/senior/gravarTitulo";

// Rateio real da OC 15886 (4 centros de custo, conta 32, projeto 1/fase 1).
const oc15886 = [
  { CODCCU: "170", CTAFIN: "32", NUMPRJ: "1", CODFPJ: "1", VLRRAT: "150" },
  { CODCCU: "102205", CTAFIN: "32", NUMPRJ: "1", CODFPJ: "1", VLRRAT: "225" },
  { CODCCU: "102195", CTAFIN: "32", NUMPRJ: "1", CODFPJ: "1", VLRRAT: "300" },
  { CODCCU: "102185", CTAFIN: "32", NUMPRJ: "1", CODFPJ: "1", VLRRAT: "300" },
];
const base: TituloNovo = {
  codEmp: 1, codFil: 1, numTit: "TST15886", codTpt: "OUT", codFor: 91, codTns: "90500",
  emissao: new Date(Date.UTC(2026, 9, 9)), vencimento: new Date(Date.UTC(2026, 9, 16)), valor: 975, obs: "A & B", codFpg: "19",
  codBan: "237", codAge: "3024", ccbFor: "11539-8", codCcu: "NAO_DEVE_IR", ctaFin: "99", numPrj: "9", codFpj: "9",
};

test("caminho feliz: 4 linhas somam o valor do titulo e 100%", () => {
  const r = consolidarRateioTitulo(oc15886, 975);
  assert.equal(r.length, 4);
  assert.equal(Math.round(r.reduce((s, l) => s + l.valor, 0) * 100) / 100, 975);
  assert.equal(Math.round(r.reduce((s, l) => s + l.percentual, 0) * 10000) / 10000, 100);
  assert.deepEqual(r[0], { codCcu: "170", ctaFin: "32", numPrj: "1", codFpj: "1", valor: 150, percentual: 15.3846 });
});

test("envelope v2: rateio no grid, SEM codCcu/ctaFin/numPrj/codFpj no cabecalho, ordem alfabetica, ponto decimal", () => {
  const x = montarEnvelopeTituloRateio(base, consolidarRateioTitulo(oc15886, 975), "u", "s");
  assert.match(x, /<ser:EntradaTitulosLoteCP_2>/);
  const semGrid = x.replace(/<rateio>[\s\S]*?<\/rateio>/g, "");
  assert.ok(!/<(codCcu|ctaFin|numPrj|codFpj)>/.test(semGrid), "cabecalho nao pode ter campos de rateio");
  assert.equal((x.match(/<rateio>/g) ?? []).length, 4);
  assert.match(x, /<vlrOri>975\.00<\/vlrOri>/);
  assert.match(x, /<vlrRat>150\.00<\/vlrRat>/);
  const cab = [...semGrid.split("<entradaTitulos>")[1].split("</entradaTitulos>")[0].matchAll(/<(\w+)>/g)].map((m) => m[1]);
  assert.deepEqual(cab, [...cab].sort());
  const linha = [...x.split("<rateio>")[1].split("</rateio>")[0].matchAll(/<(\w+)>/g)].map((m) => m[1]);
  assert.deepEqual(linha, ["codCcu", "codFpj", "ctaFin", "numPrj", "perCta", "perRat", "vlrCta", "vlrRat"]);
  assert.match(x, /A &amp; B/);
});

test("arredondamento: a ultima linha absorve a diferenca (3 centros iguais de R$ 100)", () => {
  const r = consolidarRateioTitulo([1, 2, 3].map((i) => ({ CODCCU: String(i), VLRRAT: "33,33" })), 100);
  assert.equal(Math.round(r.reduce((s, l) => s + l.valor, 0) * 100) / 100, 100);
  assert.equal(Math.round(r.reduce((s, l) => s + l.percentual, 0) * 10000) / 10000, 100);
});

test("falha 1: uma so linha, soma errada ou titulo sem valor nao viram titulo com grid", () => {
  assert.equal(consolidarRateioTitulo([], 100).length, 0);
  assert.equal(consolidarRateioTitulo(oc15886, 0).length, 0);
  assert.throws(() => montarEnvelopeTituloRateio(base, consolidarRateioTitulo(oc15886.slice(0, 1), 150), "u", "s"), /2 ou mais/);
  assert.throws(() => montarEnvelopeTituloRateio(base, [{ codCcu: "1", valor: 10, percentual: 50 }, { codCcu: "2", valor: 10, percentual: 50 }], "u", "s"), /somar/);
});

test("falha 2: resposta com erroExecucao, fault ou texto de erro nunca e' ok", () => {
  assert.equal(lerRespostaEntrada("<erroExecucao>falhou</erroExecucao>").ok, false);
  assert.equal(lerRespostaEntrada("<faultstring>x</faultstring>").ok, false);
  assert.equal(lerRespostaEntrada("<result><gridResult><txtRet>É necessário informar o rateio</txtRet></gridResult><resultado>OK</resultado></result>").ok, false);
  assert.equal(lerRespostaEntrada("<result><gridResult><txtRet>Titulo gravado com sucesso</txtRet></gridResult><resultado>OK</resultado></result>").ok, true);
});
