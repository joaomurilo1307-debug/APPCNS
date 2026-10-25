import test from "node:test";
import assert from "node:assert/strict";
import { ccusDaOc, dentroDoPeriodo, dentroDoValor, lerValor, ocNoFiltroDeContratos } from "../src/lib/filtroOc";

const hoje = new Date("2026-10-25T15:00:00.000Z");

test("periodo: ultimos 30/90 dias, este ano, todo o periodo", () => {
  assert.equal(dentroDoPeriodo("2026-10-01T00:00:00.000Z", "30", "", "", hoje), true);
  assert.equal(dentroDoPeriodo("2026-09-20T00:00:00.000Z", "30", "", "", hoje), false);
  assert.equal(dentroDoPeriodo("2026-09-20T00:00:00.000Z", "90", "", "", hoje), true);
  assert.equal(dentroDoPeriodo("2026-07-01T00:00:00.000Z", "90", "", "", hoje), false);
  assert.equal(dentroDoPeriodo("2026-01-05T00:00:00.000Z", "ano", "", "", hoje), true);
  assert.equal(dentroDoPeriodo("2025-12-31T00:00:00.000Z", "ano", "", "", hoje), false);
  assert.equal(dentroDoPeriodo("2010-01-01T00:00:00.000Z", "todos", "", "", hoje), true);
  assert.equal(dentroDoPeriodo(null, "todos", "", "", hoje), true, "todo o periodo nao esconde OC sem data");
  assert.equal(dentroDoPeriodo(null, "30", "", "", hoje), false);
  assert.equal(dentroDoPeriodo("2026-11-30T00:00:00.000Z", "30", "", "", hoje), false, "data no futuro nao entra nos ultimos 30 dias");
});

test("periodo por datas: um lado vazio = sem limite; os extremos entram", () => {
  assert.equal(dentroDoPeriodo("2026-10-10T00:00:00.000Z", "datas", "2026-10-10", "2026-10-20", hoje), true);
  assert.equal(dentroDoPeriodo("2026-10-20T00:00:00.000Z", "datas", "2026-10-10", "2026-10-20", hoje), true);
  assert.equal(dentroDoPeriodo("2026-10-21T00:00:00.000Z", "datas", "2026-10-10", "2026-10-20", hoje), false);
  assert.equal(dentroDoPeriodo("2020-01-01T00:00:00.000Z", "datas", "", "2026-10-20", hoje), true);
  assert.equal(dentroDoPeriodo("2026-12-01T00:00:00.000Z", "datas", "2026-10-10", "", hoje), true);
});

test("valor: aceita virgula brasileira, vazio e invalido = sem limite", () => {
  assert.equal(lerValor("1.500,50"), 1500.5);
  assert.equal(lerValor("2000"), 2000);
  assert.equal(lerValor(""), null);
  assert.equal(lerValor("abc"), null);
  assert.equal(dentroDoValor(1000, "500", "1.500,00"), true);
  assert.equal(dentroDoValor(499.99, "500", ""), false);
  assert.equal(dentroDoValor(1500.01, "", "1500"), false);
  assert.equal(dentroDoValor(10, "", ""), true);
  assert.equal(dentroDoValor(10, "xx", "yy"), true);
});

test("contratos da OC: rateio manda; sem rateio usa o codccu; lixo nao quebra", () => {
  assert.deepEqual(ccusDaOc('[{"codccu":"280"},{"codccu":"70"},{"codccu":"280"}]', "999"), ["280", "70"]);
  assert.deepEqual(ccusDaOc(null, "280"), ["280"]);
  assert.deepEqual(ccusDaOc("não é json", "280"), ["280"]);
  assert.deepEqual(ccusDaOc("[]", null), []);
  assert.deepEqual(ccusDaOc('[{"semcodigo":1}]', "70"), ["70"]);
});

test("filtro de contratos do cookie: sem escolha tudo passa; com escolha basta um centro de custo em comum", () => {
  assert.equal(ocNoFiltroDeContratos(["280"], null), true);
  assert.equal(ocNoFiltroDeContratos([], null), true);
  assert.equal(ocNoFiltroDeContratos(["280", "70"], ["70", "10"]), true);
  assert.equal(ocNoFiltroDeContratos(["280"], ["70"]), false);
  assert.equal(ocNoFiltroDeContratos([], ["70"]), false, "OC sem contrato some quando ha escolha");
});
