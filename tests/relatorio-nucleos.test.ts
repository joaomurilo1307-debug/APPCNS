import test from "node:test";
import assert from "node:assert/strict";
import { indicadoresDoNucleo } from "../src/lib/relatorios/nucleos";

const p = (nucleos: string[], status: string, counts: Record<string, number>, atrasadas = 0, horas = 0) => ({
  status, nucleos: nucleos.map((id) => ({ id, name: id })), taskCount: Object.values(counts).reduce((a, b) => a + b, 0), taskCounts: counts, overdueCount: atrasadas, totalHours: horas,
});

test("indicadores do nucleo: soma so' os projetos ligados a ele", () => {
  const projetos = [
    p(["n1"], "EM_ANDAMENTO", { FEITO: 3, FAZENDO: 1, A_FAZER: 4, BLOQUEADO: 2 }, 2, 10.5),
    p(["n1", "n2"], "CONCLUIDO", { FEITO: 5 }, 0, 4),
    p(["n2"], "EM_ANDAMENTO", { A_FAZER: 7 }, 1, 1),
  ];
  const n1 = indicadoresDoNucleo("n1", projetos);
  assert.deepEqual(n1, { projetos: 2, emAndamento: 1, tarefas: 15, feitas: 8, bloqueadas: 2, atrasadas: 2, horas: 14.5, andamento: 8 / 15 });
  const n2 = indicadoresDoNucleo("n2", projetos);
  assert.equal(n2.projetos, 2);
  assert.equal(n2.tarefas, 12);
  assert.equal(n2.atrasadas, 1);
});

test("nucleo sem projeto ou sem tarefa: tudo zero, sem dividir por zero", () => {
  assert.deepEqual(indicadoresDoNucleo("nx", []), { projetos: 0, emAndamento: 0, tarefas: 0, feitas: 0, bloqueadas: 0, atrasadas: 0, horas: 0, andamento: 0 });
  assert.equal(indicadoresDoNucleo("n1", [p(["n1"], "PLANEJADO", {})]).andamento, 0);
});
