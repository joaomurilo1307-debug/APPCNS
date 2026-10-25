import test from "node:test";
import assert from "node:assert/strict";
import { diferencaDeMembros, filtrarNucleos, papelFinal } from "../src/lib/nucleosEdicao";

test("colaboradores: quem entra e quem sai, sem repetir", () => {
  assert.deepEqual(diferencaDeMembros(["a", "b"], ["b", "c", "c"]), { entram: ["c"], saem: ["a"] });
  assert.deepEqual(diferencaDeMembros([], []), { entram: [], saem: [] });
  assert.deepEqual(diferencaDeMembros(["a"], ["a"]), { entram: [], saem: [] });
  assert.deepEqual(diferencaDeMembros(["a", "b"], []), { entram: [], saem: ["a", "b"] });
});

test("papel: pessoa invalida nova nao entra, mas quem ja estava no papel nao some sozinho", () => {
  // x = invalido novo (inativo/contratante); d = ja era gerente e foi desligado; v = valido novo
  assert.deepEqual(papelFinal(["v", "x", "d"], ["d"], ["v"]), ["v", "d"]);
  assert.deepEqual(papelFinal([], ["d"], []), [], "tirar de proposito funciona");
  assert.deepEqual(papelFinal(["v", "v"], [], ["v"]), ["v"]);
});

const lista = [
  { name: "ADM FINANCEIRO", description: null, tipo: "SETOR", diretores: [], gerentes: [{ name: "Claudia Moreira" }], coordenadores: [], membros: [{ name: "Renata Marinho" }] },
  { name: "MRN CT 3748/2023", description: "Contrato Flora", tipo: "CONTRATO", diretores: [{ name: "Samara Hissa" }], gerentes: [], coordenadores: [], membros: [] },
  { name: "Sem tipo antigo", description: null, tipo: "", diretores: [], gerentes: [], coordenadores: [], membros: [] },
];

test("filtro da lista de nucleos: tipo e busca (nome, descricao e pessoas), sem acento", () => {
  assert.deepEqual(filtrarNucleos(lista, { tipo: "todos", busca: "" }).length, 3);
  assert.deepEqual(filtrarNucleos(lista, { tipo: "CONTRATO", busca: "" }).map((n) => n.name), ["MRN CT 3748/2023"]);
  assert.deepEqual(filtrarNucleos(lista, { tipo: "SETOR", busca: "" }).map((n) => n.name), ["ADM FINANCEIRO", "Sem tipo antigo"], "tipo vazio conta como setor");
  assert.deepEqual(filtrarNucleos(lista, { tipo: "todos", busca: "claudia" }).map((n) => n.name), ["ADM FINANCEIRO"]);
  assert.deepEqual(filtrarNucleos(lista, { tipo: "todos", busca: "flora" }).map((n) => n.name), ["MRN CT 3748/2023"]);
  assert.deepEqual(filtrarNucleos(lista, { tipo: "todos", busca: "SAMARA" }).map((n) => n.name), ["MRN CT 3748/2023"]);
  assert.deepEqual(filtrarNucleos(lista, { tipo: "CONTRATO", busca: "claudia" }), []);
});
