import test from "node:test";
import assert from "node:assert/strict";
import { TAREFAS_DO_EXEMPLO, emDias, NOME_PROJETO_EXEMPLO } from "../src/lib/projetos/exemplo";

test("o projeto de exemplo mostra todas as colunas do Kanban e uma entrega", () => {
  for (const s of ["A_FAZER", "FAZENDO", "BLOQUEADO", "FEITO"]) assert.ok(TAREFAS_DO_EXEMPLO.some((t) => t.status === s), s);
  assert.equal(TAREFAS_DO_EXEMPLO.filter((t) => t.isEntrega).length, 1);
});

test("toda tarefa de exemplo tem titulo, explicacao e prazo depois do inicio", () => {
  for (const t of TAREFAS_DO_EXEMPLO) {
    assert.ok(t.title.length >= 2 && t.description.length > 20, t.title);
    assert.ok(t.prazoEmDias >= t.inicioEmDias, t.title);
  }
});

test("o exemplo ensina a montar a equipe antes de criar tarefas", () => {
  assert.ok(TAREFAS_DO_EXEMPLO.some((t) => /equipe/i.test(t.title)));
  assert.ok(NOME_PROJETO_EXEMPLO.startsWith("Projeto teste"));
});

test("emDias conta a partir da meia-noite UTC do dia, sem depender da hora", () => {
  const manha = new Date("2026-10-25T01:00:00Z");
  const noite = new Date("2026-10-25T23:30:00Z");
  assert.equal(emDias(manha, 3).toISOString(), "2026-10-28T00:00:00.000Z");
  assert.equal(emDias(noite, 3).toISOString(), "2026-10-28T00:00:00.000Z");
  assert.equal(emDias(manha, -1).toISOString(), "2026-10-24T00:00:00.000Z");
});
