import test from "node:test";
import assert from "node:assert/strict";
import { resumirGrupo } from "../src/lib/ganttResumo";

const hoje = new Date(2026, 9, 25); // 25/10/2026

test("resumo do projeto: periodo (menor inicio, maior prazo), andamento e atrasos", () => {
  const r = resumirGrupo([
    { startDate: "2026-10-01T00:00:00.000Z", dueDate: "2026-10-10T00:00:00.000Z", status: "FEITO" },
    { startDate: "2026-10-05T00:00:00.000Z", dueDate: "2026-10-20T00:00:00.000Z", status: "FAZENDO" }, // atrasada
    { startDate: "2026-11-01T00:00:00.000Z", dueDate: "2026-12-15T00:00:00.000Z", status: "A_FAZER" },
    { startDate: null, dueDate: "2026-10-01T00:00:00.000Z", status: "BLOQUEADO" }, // sem inicio: conta atraso, nao entra no periodo
  ], hoje);
  assert.equal(r.total, 4);
  assert.equal(r.feitas, 1);
  assert.equal(r.atrasadas, 2);
  assert.equal(r.comData, 3);
  assert.equal(r.inicio?.slice(0, 10), "2026-10-01");
  assert.equal(r.fim?.slice(0, 10), "2026-12-15");
  assert.equal(r.pct, 25);
});

test("resumo: grupo vazio ou sem datas nao quebra", () => {
  assert.deepEqual(resumirGrupo([], hoje), { total: 0, feitas: 0, atrasadas: 0, comData: 0, inicio: null, fim: null, pct: 0 });
  const r = resumirGrupo([{ startDate: null, dueDate: null, status: "A_FAZER" }], hoje);
  assert.equal(r.inicio, null);
  assert.equal(r.fim, null);
  assert.equal(r.atrasadas, 0);
});

test("tarefa feita com prazo vencido nao e' atrasada", () => {
  assert.equal(resumirGrupo([{ startDate: "2026-09-01T00:00:00.000Z", dueDate: "2026-09-10T00:00:00.000Z", status: "FEITO" }], hoje).atrasadas, 0);
});
