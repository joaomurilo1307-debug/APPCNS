import test from "node:test";
import assert from "node:assert/strict";
import { saudeDoProjeto } from "../src/lib/projetos/saude";

const hoje = new Date("2026-10-25T12:00:00.000Z");
const base = { status: "EM_ANDAMENTO", startDate: "2026-09-25T00:00:00.000Z", endDate: "2026-11-25T00:00:00.000Z", total: 10, feitas: 5, atrasadas: 0, bloqueadas: 0 };

test("no prazo: sem atraso, sem bloqueio e andamento compativel com a data", () => {
  const s = saudeDoProjeto(base, hoje); // 30 dias de 61 = 49% esperado, 50% feito
  assert.equal(s.nivel, "NO_PRAZO");
  assert.match(s.motivos[0], /50% concluído/);
});

test("concluido e sem tarefas sao casos a parte", () => {
  assert.equal(saudeDoProjeto({ ...base, status: "CONCLUIDO", atrasadas: 4 }, hoje).nivel, "CONCLUIDO");
  assert.equal(saudeDoProjeto({ ...base, total: 0, feitas: 0 }, hoje).nivel, "SEM_DADOS");
});

test("atencao: tarefa atrasada, tarefa bloqueada, pausado ou andamento abaixo do esperado", () => {
  assert.equal(saudeDoProjeto({ ...base, atrasadas: 1 }, hoje).nivel, "ATENCAO");
  assert.deepEqual(saudeDoProjeto({ ...base, bloqueadas: 2 }, hoje).motivos, ["2 tarefas bloqueadas"]);
  assert.equal(saudeDoProjeto({ ...base, status: "PAUSADO" }, hoje).nivel, "ATENCAO");
  const lento = saudeDoProjeto({ ...base, feitas: 2 }, hoje); // 20% feito, 49% esperado
  assert.equal(lento.nivel, "ATENCAO");
  assert.match(lento.motivos[0], /Andamento 20%, esperado 49%/);
  assert.equal(saudeDoProjeto({ ...base, feitas: 4 }, hoje).nivel, "NO_PRAZO", "ate 15 pontos abaixo ainda e' normal");
});

test("atrasado: passou do fim, 3 ou mais atrasadas, ou metade das abertas vencidas", () => {
  const passou = saudeDoProjeto({ ...base, endDate: "2026-10-10T00:00:00.000Z" }, hoje);
  assert.equal(passou.nivel, "ATRASADO");
  assert.match(passou.motivos[0], /Passou do fim previsto \(10\/10\/2026\) com 50% concluído/);
  assert.equal(saudeDoProjeto({ ...base, atrasadas: 3 }, hoje).nivel, "ATRASADO");
  assert.equal(saudeDoProjeto({ ...base, total: 8, feitas: 4, atrasadas: 2 }, hoje).nivel, "ATRASADO", "2 de 4 abertas = 50%");
  assert.equal(saudeDoProjeto({ ...base, total: 8, feitas: 4, atrasadas: 1 }, hoje).nivel, "ATENCAO", "1 de 4 abertas = 25%: so' atencao");
  assert.equal(saudeDoProjeto({ ...base, total: 20, feitas: 4, atrasadas: 2 }, hoje).nivel, "ATENCAO", "2 de 16 abertas = 12%");
  const mais = saudeDoProjeto({ ...base, atrasadas: 3, bloqueadas: 1 }, hoje);
  assert.deepEqual(mais.motivos, ["3 tarefas atrasadas", "1 tarefa bloqueada"]);
});

test("datas ausentes ou invalidas e fim no mesmo dia nao quebram nem acusam atraso", () => {
  assert.equal(saudeDoProjeto({ ...base, startDate: null, endDate: null }, hoje).nivel, "NO_PRAZO");
  assert.equal(saudeDoProjeto({ ...base, startDate: "lixo", endDate: "lixo" }, hoje).nivel, "NO_PRAZO");
  const noDiaDoFim = saudeDoProjeto({ ...base, endDate: "2026-10-25T00:00:00.000Z" }, hoje);
  assert.equal(noDiaDoFim.nivel, "ATENCAO", "o dia do fim ainda nao e' atraso, mas 50% feito no ultimo dia pede atencao");
  assert.match(noDiaDoFim.motivos[0], /Andamento 50%, esperado 100%/);
  assert.equal(saudeDoProjeto({ ...base, endDate: "2026-10-25T00:00:00.000Z", feitas: 10 }, hoje).nivel, "NO_PRAZO");
  assert.equal(saudeDoProjeto({ ...base, feitas: 10 }, hoje).nivel, "NO_PRAZO");
});
