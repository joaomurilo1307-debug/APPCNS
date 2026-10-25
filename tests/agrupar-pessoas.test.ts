import test from "node:test";
import assert from "node:assert/strict";
import { agruparPessoas } from "../src/lib/agruparPessoas";

const todos = [
  { id: "1", name: "Vitor Alves", cargo: "Analista de geoprocessamento", nucleo: "Geoprocessamento" },
  { id: "2", name: "Alan Gonçalves", cargo: "Analista", nucleo: "Geoprocessamento" },
  { id: "3", name: "Breno de Lana", cargo: "Coordenador", nucleo: "Inovação" },
  { id: "4", name: "Ana Souza", cargo: null, nucleo: null },
];

test("agrupa por nucleo (ordem alfabetica, 'sem nucleo' por ultimo) e ordena as pessoas pelo nome", () => {
  const g = agruparPessoas(todos, [], "");
  assert.deepEqual(g.map((x) => x.nucleo), ["Geoprocessamento", "Inovação", null]);
  assert.deepEqual(g[0].pessoas.map((p) => p.name), ["Alan Gonçalves", "Vitor Alves"]);
});

test("quem ja foi escolhido sai da lista e grupo vazio some", () => {
  const g = agruparPessoas(todos, ["3"], "");
  assert.deepEqual(g.map((x) => x.nucleo), ["Geoprocessamento", null]);
});

test("busca por nome, cargo ou nucleo, sem diferenciar acento nem maiuscula", () => {
  assert.deepEqual(agruparPessoas(todos, [], "goncalves").flatMap((x) => x.pessoas.map((p) => p.id)), ["2"]);
  assert.deepEqual(agruparPessoas(todos, [], "COORDENADOR").flatMap((x) => x.pessoas.map((p) => p.id)), ["3"]);
  assert.deepEqual(agruparPessoas(todos, [], "inovacao").flatMap((x) => x.pessoas.map((p) => p.id)), ["3"]);
  assert.deepEqual(agruparPessoas(todos, [], "zzz"), []);
});
