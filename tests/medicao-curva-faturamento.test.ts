import { test } from "node:test";
import assert from "node:assert/strict";
import { alinharCurvaFaturamento } from "../src/lib/medicao/curvaFaturamento";
import { conciliar, type DocConc } from "../src/lib/medicao/conciliacao";
import { consolidarFaturamento, type ItemConsolidado } from "../src/lib/medicao/consolidado";
import { mediaDoPeriodo, mediaMovel } from "../src/lib/custos/agregacao";

const item = (numCtr: string, numPed: string, competencia: string, valor: number): ItemConsolidado => ({
  numCtr, numPed, competencia, valor, qtd: 1, origem: "BOLETIM", boletim: null, situacao: "4", dataEmissao: "2026-10-01",
});
const doc = (numero: string, competencia: string, valor: number, extra: Partial<DocConc> = {}): DocConc => ({
  chave: `NF|1|TESTE|${numero}|230`, tipo: "NF", numero, filial: "1", serie: "TESTE", dataEmissao: "2026-10-01", valor, valorLiquido: valor, valorDoc: valor,
  codccu: "230", competencia, origem: "EMISSAO", pedidos: null, situacao: "2", duplicadaDe: null, vencimento: null, dataPagamento: null, valorAberto: null, ...extra,
});

test("curva completa os meses anteriores ao primeiro pedido e preserva as barras da conciliacao", () => {
  const itens = [item("1", "10", "2026-03", 90)];
  const docs = [doc("100", "2026-03", 90, { pedidos: "10" })];
  const detalhe = conciliar(itens, docs, [], "2026-01", "2026-03", "2026-10-26");
  const antes = JSON.stringify(detalhe);
  assert.deepEqual(detalhe.meses.map((m) => m.mes), ["2026-03"]);
  const curva = alinharCurvaFaturamento(detalhe.meses, "2026-01", "2026-03", "2026-10");
  assert.deepEqual(curva.meses, ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(curva.valores, [0, 0, 90]);
  assert.equal(mediaDoPeriodo(curva.valores, !!curva.mesParcial), 30);
  assert.deepEqual(mediaMovel(curva.valores, 3, !!curva.mesParcial), [null, null, 30]);
  assert.equal(JSON.stringify(detalhe), antes);
});

test("curva e consolidado de um CCU concordam com duas referencias, ND, duplicada e medido sem nota", () => {
  const itens = [item("1", "10", "2026-03", 90), item("2", "20", "2026-07", 120), item("1", "30", "2026-08", 55), item("2", "40", "2026-10", 200)];
  const docs = [
    doc("100", "2026-03", 90, { pedidos: "10", valorAberto: 0, dataPagamento: "2026-05-10" }),
    doc("200", "2026-07", 120, { pedidos: "20" }),
    doc("201", "2026-07", 120, { duplicadaDe: "200" }),
    doc("ND1", "2026-07", 20, { tipo: "ND" }),
    doc("300", "2026-10", 200, { pedidos: "40", valorAberto: 200 }),
  ];
  const detalhe = conciliar(itens, docs, [], "2026-01", "2026-10", "2026-10-26");
  const curva = alinharCurvaFaturamento(detalhe.meses, "2026-01", "2026-10", "2026-10");
  const consolidado = consolidarFaturamento({ contratos: [{ numCtr: "1", codccu: "230" }, { numCtr: "2", codccu: "230" }], itens, docs, ccusPermitidos: new Set(["230"]), de: "2026-01", ate: "2026-10", hoje: "2026-10-26" });
  const valores = consolidado.meses.map((m) => m.faturado);
  assert.deepEqual(curva.meses, consolidado.meses.map((m) => m.mes));
  assert.deepEqual(curva.valores, valores);
  assert.equal(curva.mesParcial, "2026-10");
  assert.equal(mediaDoPeriodo(curva.valores, !!curva.mesParcial), mediaDoPeriodo(valores, true));
  assert.deepEqual(mediaMovel(curva.valores, 3, !!curva.mesParcial), mediaMovel(valores, 3, true));
  assert.equal(curva.valores[curva.meses.indexOf("2026-07")], 140);
  assert.equal(curva.valores[curva.meses.indexOf("2026-08")], 0);
  assert.equal(detalhe.meses.find((m) => m.mes === "2026-08")?.receita, 55);
  assert.equal(curva.valores.reduce((s, v) => s + v, 0), 430);
});

test("recorte exclui valores externos e normaliza periodo invertido, futuro e limite de 48 meses", () => {
  const meses = [{ mes: "2026-02", faturado: 999 }, { mes: "2026-03", faturado: 30 }, { mes: "2026-07", faturado: 70 }, { mes: "2026-08", faturado: 888 }];
  const curva = alinharCurvaFaturamento(meses, "2026-07", "2026-03", "2026-10");
  assert.equal(curva.de, "2026-03");
  assert.equal(curva.ate, "2026-07");
  assert.deepEqual(curva.valores, [30, 0, 0, 0, 70]);
  assert.equal(curva.mesParcial, undefined);
  const limitada = alinharCurvaFaturamento([], "2020-01", "2027-12", "2026-10");
  assert.equal(limitada.de, "2022-11");
  assert.equal(limitada.ate, "2026-10");
  assert.equal(limitada.meses.length, 48);
  assert.ok(limitada.valores.every((v) => v === 0));
});

test("mes corrente aparece na curva mas fica fora da media e do ultimo ponto MM3", () => {
  const meses = [{ mes: "2026-01", faturado: 10 }, { mes: "2026-02", faturado: 20 }, { mes: "2026-03", faturado: 30 }, { mes: "2026-04", faturado: 400 }];
  const parcial = alinharCurvaFaturamento(meses, "2026-01", "2026-04", "2026-04");
  assert.deepEqual(parcial.valores, [10, 20, 30, 400]);
  assert.equal(mediaDoPeriodo(parcial.valores, !!parcial.mesParcial), 20);
  assert.deepEqual(mediaMovel(parcial.valores, 3, !!parcial.mesParcial), [null, null, 20, null]);
  const fechado = alinharCurvaFaturamento(meses, "2026-01", "2026-04", "2026-05");
  assert.equal(mediaDoPeriodo(fechado.valores, !!fechado.mesParcial), 115);
  assert.equal(mediaMovel(fechado.valores, 3, !!fechado.mesParcial)[3], 150);
});

test("sem dados preserva todo o eixo zerado e MM3 indisponivel antes de tres meses fechados", () => {
  const curva = alinharCurvaFaturamento([], "2026-01", "2026-03", "2026-03");
  assert.deepEqual(curva.meses, ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(curva.valores, [0, 0, 0]);
  assert.equal(mediaDoPeriodo(curva.valores, !!curva.mesParcial), 0);
  assert.deepEqual(mediaMovel(curva.valores, 3, !!curva.mesParcial), [null, null, null]);
});
