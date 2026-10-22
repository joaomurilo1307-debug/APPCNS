import test from "node:test";
import assert from "node:assert/strict";
import { codigosDaOC, envolvidoNaOC, filtroGrosseiroDeEnvolvimento, type OcParaEnvolvimento } from "../src/lib/acesso/envolvimentoOc";

const meus = (...c: string[]) => new Set(c);

const rateio = JSON.stringify([
  {
    seq: 1,
    codccu: "190",
    niveis: [
      { nivel: 1, aprovadoresCod: ["203", "310"], status: "aprovado", aprovadoPorCod: "203" },
      { nivel: 2, aprovadoresCod: ["88"], status: "pendente" },
    ],
  },
]);
const historico = JSON.stringify([{ SEQAPR: 1, NIVAPR: 1, USUAPR: "203", SITAPR: "A", CCUAPR: "190", DATAPR: "2026-10-01" }]);
const oc: OcParaEnvolvimento = { criadorCod: "45", aprovadoresPendentesCod: "88,91", historicoNiveis: historico, rateioDetalhe: rateio };

test("envolvido: quem emitiu a OC", () => assert.equal(envolvidoNaOC(oc, meus("45")), true));
test("envolvido: quem falta aprovar", () => {
  assert.equal(envolvidoNaOC(oc, meus("91")), true);
  assert.equal(envolvidoNaOC(oc, meus("88")), true);
});
test("envolvido: quem ja assinou (historico e rateio)", () => {
  assert.equal(envolvidoNaOC({ historicoNiveis: historico }, meus("203")), true);
  assert.equal(envolvidoNaOC({ rateioDetalhe: JSON.stringify([{ niveis: [{ aprovadoPorCod: "777" }] }]) }, meus("777")), true);
});
test("envolvido: quem esta na alcada de algum nivel, mesmo sem ter agido", () => assert.equal(envolvidoNaOC(oc, meus("310")), true));
test("nao envolvido: codigo que so' CONTEM o numero (17 x 177) nao conta", () => {
  assert.equal(envolvidoNaOC({ criadorCod: "177", aprovadoresPendentesCod: "1177,2177" }, meus("17")), false);
  assert.equal(envolvidoNaOC(oc, meus("4")), false);
  assert.equal(envolvidoNaOC(oc, meus("20")), false);
});
test("nao envolvido: quem nao aparece na OC; sem codigo do Senior nao ve nada", () => {
  assert.equal(envolvidoNaOC(oc, meus("999")), false);
  assert.equal(envolvidoNaOC(oc, meus()), false);
});
test("USUAPR numerico no historico tambem vale; codigo 0 e vazio sao ignorados", () => {
  assert.equal(envolvidoNaOC({ historicoNiveis: JSON.stringify([{ USUAPR: 55 }]) }, meus("55")), true);
  assert.equal(codigosDaOC({ criadorCod: "0", aprovadoresPendentesCod: ",,", historicoNiveis: JSON.stringify([{ USUAPR: "" }, { USUAPR: 0 }]) }).size, 0);
});
test("JSON ilegivel ou formato inesperado nao quebra: so' vale o que da' para ler", () => {
  const ruim: OcParaEnvolvimento = { criadorCod: "45", historicoNiveis: "{nao e json", rateioDetalhe: JSON.stringify({ outra: "estrutura" }) };
  assert.equal(envolvidoNaOC(ruim, meus("45")), true);
  assert.equal(envolvidoNaOC(ruim, meus("203")), false);
  assert.equal(envolvidoNaOC({ historicoNiveis: null, rateioDetalhe: null, aprovadoresPendentesCod: null, criadorCod: null }, meus("45")), false);
});
test("filtro grosseiro: sem codigo = null; com codigo cobre criador, pendente, historico e rateio", () => {
  assert.equal(filtroGrosseiroDeEnvolvimento([]), null);
  assert.equal(filtroGrosseiroDeEnvolvimento(["", " "]), null);
  const f = filtroGrosseiroDeEnvolvimento(["177"])!;
  const texto = JSON.stringify(f);
  assert.ok(texto.includes('"criadorCod":{"in":["177"]}'));
  assert.ok(texto.includes("aprovadoresPendentesCod"));
  assert.ok(texto.includes('USUAPR\\": \\"177\\"'));
  assert.ok(texto.includes('USUAPR\\":\\"177\\"'));
  assert.ok(texto.includes("rateioDetalhe"));
});
test("o filtro grosseiro nunca deixa de fora uma OC que o filtro exato aceita (texto da OC contem o criterio)", () => {
  const f = filtroGrosseiroDeEnvolvimento(["203"])!;
  const criterios = f.OR.flatMap((c: any) => Object.entries(c).map(([campo, cond]: [string, any]) => ({ campo, cond })));
  const cobre = (o: OcParaEnvolvimento) =>
    criterios.some(({ campo, cond }) => {
      const valor = (o as any)[campo] as string | null | undefined;
      if (!valor) return false;
      if (cond.in) return cond.in.includes(valor);
      return valor.includes(cond.contains);
    });
  // assinou so' pelo historico / so' pela alcada / so' pendente / emitiu
  assert.equal(cobre({ historicoNiveis: historico }), true);
  assert.equal(cobre({ rateioDetalhe: rateio }), true);
  assert.equal(cobre({ aprovadoresPendentesCod: "1,203" }), true);
  assert.equal(cobre({ criadorCod: "203" }), true);
  assert.equal(cobre({ historicoNiveis: JSON.stringify([{ USUAPR: 203, SITAPR: "A" }]) }), true);
});
