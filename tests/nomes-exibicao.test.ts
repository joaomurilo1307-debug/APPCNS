import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { NOMES_ANTIGOS_DO_SENIOR, NOMES_DE_EXIBICAO, nomeDeExibicao, nomeGravadoNovo, podeTrocarNome, semPrefixoCcu } from "../src/lib/contratos/nomesDeExibicao";

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

test("o seed de producao (sem importar de src) usa os mesmos nomes do app", () => {
  const seed = fs.readFileSync("prisma/seed-nomes-contratos.ts", "utf-8");
  assert.ok(!/from\s+["']\.\.\/src/.test(seed), "a imagem de producao nao tem a pasta src: o seed nao pode importar de la");
  for (const nome of [...Object.values(NOMES_DE_EXIBICAO), ...Object.values(NOMES_ANTIGOS_DO_SENIOR)]) assert.ok(seed.includes(`"${nome}"`), `o seed precisa conter "${nome}"`);
});
