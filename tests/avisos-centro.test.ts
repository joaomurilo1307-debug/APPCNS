import { test } from "node:test";
import assert from "node:assert/strict";
import { AVISOS_POR_CCU, RESUMO_DO_AVISO, avisoDoCentro, temAviso } from "../src/lib/contratos/avisosPorCentro";

test("so' os centros de custo 210 e 230 tem aviso", () => {
  assert.deepEqual(Object.keys(AVISOS_POR_CCU), ["210", "230"]);
  assert.equal(avisoDoCentro("190"), null);
  assert.equal(avisoDoCentro(null), null);
  assert.equal(avisoDoCentro(undefined), null);
  assert.equal(temAviso(["190", null, "205"]), false);
  assert.equal(temAviso(["190", "230"]), true);
  for (const ccu of ["210", "230"]) assert.ok(avisoDoCentro(ccu)!.linhas.length >= 3 && avisoDoCentro(ccu)!.linhas.every((l) => l.trim().length > 0));
});

test("210: custos do 3686 juntos com os do 3687, e a receita do 3687 esta no 230", () => {
  const a = avisoDoCentro("210")!;
  const texto = a.linhas.join(" ");
  assert.ok(a.titulo.includes("3686") && a.titulo.includes("3687"));
  assert.ok(texto.includes("o 3686 e o 3687 estão juntos"));
  assert.ok(texto.includes("centro de custo 230") && texto.includes("3687 LT"));
});

test("230: a receita e' o 3687 LT mais o 3687, e os custos do 3687 estao no 210", () => {
  const a = avisoDoCentro("230")!;
  const texto = a.linhas.join(" ");
  assert.ok(a.titulo.includes("3687 LT mais o 3687"));
  assert.ok(texto.includes("a do 3687 LT mais a do 3687"));
  assert.ok(texto.includes("centro de custo 210") && texto.includes("3686"));
});

test("o resumo das telas com lista cita os dois centros de custo", () => {
  assert.ok(RESUMO_DO_AVISO.includes("CCU 210") && RESUMO_DO_AVISO.includes("CCU 230"));
  assert.ok(RESUMO_DO_AVISO.includes("3687 LT mais o 3687"));
});
