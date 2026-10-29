import { test } from "node:test";
import assert from "node:assert/strict";
import { tituloDigitadoExiste } from "../src/lib/conferenciaOc/tituloDigitado";

// Titulos reais do fornecedor 625803 (JC14) como estavam no Senior em 29/10/2026: o ultimo era o 41=1; o 43=1 digitado na OC 16239 nao existia.
const JC14 = ["37=1", "38=1", "39=1", "40=1", "41=1", "JC14_01", "JC14_02", "JC14_05"];

test("caso real: OC 16239 digitou 43=1, que nao existe -> nao tem titulo (tem que aparecer na Conferencia)", () => {
  assert.equal(tituloDigitadoExiste("43=1", JC14), false);
});

test("caminho feliz: o numero digitado existe -> ja tem titulo (continua fora da lista)", () => {
  assert.equal(tituloDigitadoExiste("41=1", JC14), true);
  assert.equal(tituloDigitadoExiste(" 41=1 ", JC14), true, "espacos");
  assert.equal(tituloDigitadoExiste("jc14_02", JC14), true, "caixa");
});

test("varios numeros no mesmo campo: basta um existir (OC 16362 digitou '008100 - 008101' e so' o 008101 existe)", () => {
  assert.equal(tituloDigitadoExiste("008100 - 008101", ["008101", "008102"]), true);
  assert.equal(tituloDigitadoExiste("008100 - 008101", ["007999", "008102"]), false);
  assert.equal(tituloDigitadoExiste("8100, 8101;8102", ["008102"]), true, "separadores e zeros a esquerda");
});

test("parcela: numero-base digitado casa o titulo com parcela, e vice-versa nao inventa", () => {
  assert.equal(tituloDigitadoExiste("3834", ["3834$01"]), true);
  assert.equal(tituloDigitadoExiste("3834$01", ["3834$01"]), true);
  assert.equal(tituloDigitadoExiste("3835", ["3834$01"]), false);
});

test("falhas: campo vazio/zero, fornecedor sem titulos, lixo digitado", () => {
  assert.equal(tituloDigitadoExiste(null, JC14), false);
  assert.equal(tituloDigitadoExiste("", JC14), false);
  assert.equal(tituloDigitadoExiste("0", JC14), false);
  assert.equal(tituloDigitadoExiste("43=1", []), false);
  assert.equal(tituloDigitadoExiste("A DEFINIR", JC14), false);
});
