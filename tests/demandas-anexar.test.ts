import test from "node:test";
import assert from "node:assert/strict";
import { montarTarefaAnexada } from "../src/lib/demandas";

const base = {
  titulo: "Mapa de talhões", descricao: "Atualizar o mapa", prioridade: "NORMAL", prazoDesejado: new Date("2026-11-30T00:00:00.000Z"),
  contrato: { nome: "SVPM CT 072/2024", codccu: "280" }, solicitante: { name: "Maria" },
  itens: [{ texto: "Levantar dados", concluido: true }, { texto: "Gerar o mapa", concluido: false }],
};

test("aceitar anexando: a demanda vira tarefa com a origem na descricao, prioridade e prazo", () => {
  const t = montarTarefaAnexada(base);
  assert.equal(t.title, "Mapa de talhões");
  assert.match(t.description, /^Atualizar o mapa\n\nOrigem: demanda para o contrato SVPM CT 072\/2024 \(CCU 280\), pedida por Maria\.$/);
  assert.equal(t.priority, "MEDIA", "NORMAL da demanda = MEDIA da tarefa");
  assert.equal(t.dueDate?.toISOString().slice(0, 10), "2026-11-30");
});

test("cada item da lista vira uma subtarefa, na ordem, mantendo o que ja estava concluido", () => {
  const t = montarTarefaAnexada(base);
  assert.deepEqual(t.subtarefas, [
    { title: "Levantar dados", ordem: 0, status: "FEITO" },
    { title: "Gerar o mapa", ordem: 1, status: "A_FAZER" },
  ]);
});

test("sem descricao, sem prazo, sem itens e prioridade desconhecida: nada quebra", () => {
  const t = montarTarefaAnexada({ ...base, descricao: null, prazoDesejado: null, itens: [], prioridade: "QUALQUER" });
  assert.equal(t.description, "Origem: demanda para o contrato SVPM CT 072/2024 (CCU 280), pedida por Maria.");
  assert.equal(t.dueDate, null);
  assert.deepEqual(t.subtarefas, []);
  assert.equal(t.priority, "MEDIA");
  assert.equal(montarTarefaAnexada({ ...base, prioridade: "URGENTE" }).priority, "URGENTE");
  assert.equal(montarTarefaAnexada({ ...base, prioridade: "BAIXA" }).priority, "BAIXA");
  assert.equal(montarTarefaAnexada({ ...base, prioridade: "ALTA" }).priority, "ALTA");
});
