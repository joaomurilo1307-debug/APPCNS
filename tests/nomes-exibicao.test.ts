import { test } from "node:test";
import assert from "node:assert/strict";
import { NOMES_DE_EXIBICAO, nomeDeExibicao, nomeGravadoNovo, podeTrocarNome, semPrefixoCcu } from "../src/lib/contratos/nomesDeExibicao";

test("210 e 230 mostram o nome de exibicao; os demais ficam com o que veio do Senior", () => {
  assert.equal(nomeDeExibicao("210", "MRN CT 3686/2023"), "MRN CT 3686 + 3687");
  assert.equal(nomeDeExibicao("230", "MRN CT 3687/2023"), "MRN CT 3687 LT");
  assert.equal(nomeDeExibicao("190", "MRN CT 3748/2023"), "MRN CT 3748/2023");
  assert.equal(nomeDeExibicao("999", null), null);
  assert.deepEqual(Object.keys(NOMES_DE_EXIBICAO), ["210", "230"]);
});

test("so' troca no banco o que ainda esta com o nome do Senior (com ou sem o CCU na frente)", () => {
  assert.equal(podeTrocarNome("210", "MRN CT 3686/2023"), true);
  assert.equal(podeTrocarNome("210", "210 - MRN CT 3686/2023"), true);
  assert.equal(podeTrocarNome("230", "230 - MRN CT 3687/2023"), true);
  assert.equal(podeTrocarNome("210", "MRN CT 3686 + 3687"), false); // ja trocado
  assert.equal(podeTrocarNome("210", "Nome que o administrador escolheu"), false); // editado a mao: fica
  assert.equal(podeTrocarNome("190", "MRN CT 3748/2023"), false); // centro sem nome de exibicao
});

test("o nome gravado novo mantem o formato de antes", () => {
  assert.equal(nomeGravadoNovo("210", "210 - MRN CT 3686/2023"), "210 - MRN CT 3686 + 3687");
  assert.equal(nomeGravadoNovo("210", "MRN CT 3686/2023"), "MRN CT 3686 + 3687");
  assert.equal(nomeGravadoNovo("230", "230 - MRN CT 3687/2023"), "230 - MRN CT 3687 LT");
  assert.equal(semPrefixoCcu("230", "230 - MRN CT 3687 LT"), "MRN CT 3687 LT");
});
