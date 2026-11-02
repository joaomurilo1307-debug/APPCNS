import { test } from "node:test";
import assert from "node:assert/strict";
import { SEM_CENTRO, arredondarSomando, calcularMes, diaSP, feriados, janelasDaTarefa, motivoDiaNaoUtil, type TarefaTS } from "../src/lib/timesheetAuto/calculo";

const tarefa = (id: string, extra: Partial<TarefaTS> = {}): TarefaTS => ({
  id, titulo: `Tarefa ${id}`, projetoId: `p-${id}`, projetoNome: `Projeto ${id}`, codccu: "190", status: "FAZENDO",
  startDate: null, dueDate: null, durationDays: null, actualStartedAt: null, actualEndedAt: null, criadaEm: "2026-01-02", atualizadaEm: "2026-01-02",
  isEntrega: false, temSubtarefaDaPessoa: false, eventos: [], ...extra,
});
const base = { horasPorDia: 8, ausencias: [], desde: "2026-01-01", usarPrevistas: true };

test("calendario: feriados nacionais e de Belo Horizonte, e julho/2026 tem 23 dias uteis (como no timesheet do setor)", () => {
  const f26 = feriados(2026);
  assert.equal(f26.get("2026-04-03"), "Sexta-feira Santa");
  assert.ok(f26.has("2026-11-20") && f26.has("2026-12-08") && f26.has("2026-08-15"));
  assert.equal(feriados(2023).has("2023-11-20"), false, "Consciencia Negra so' desde 2024");
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [tarefa("a", { actualStartedAt: "2026-06-01", status: "FAZENDO" })] });
  assert.equal(r.diasUteis, 23);
  assert.equal(r.horasDisponiveis, 184);
  assert.equal(motivoDiaNaoUtil("2026-07-04", []), "sábado");
  assert.equal(motivoDiaNaoUtil("2026-07-06", [{ de: "2026-07-06", ate: "2026-07-10" }]), "ausência");
});

test("uma tarefa o mes todo: 100% para o centro de custo do projeto, com as horas dos dias uteis", () => {
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [tarefa("a", { actualStartedAt: "2026-06-15", status: "FAZENDO" })] });
  assert.equal(r.centros.length, 1);
  assert.equal(r.centros[0].codccu, "190");
  assert.equal(r.centros[0].horas, 184);
  assert.equal(r.centros[0].percentual, 100);
  assert.equal(r.horasSemTarefa, 0);
});

test("duas tarefas ao mesmo tempo em centros diferentes dividem o dia: 50% e 50%", () => {
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("b", { codccu: "230", actualStartedAt: "2026-07-01" }),
  ] });
  assert.deepEqual(r.centros.map((c) => [c.codccu, c.horas, c.percentual]), [["190", 92, 50], ["230", 92, 50]]);
});

test("tarefa que so' cobre parte do mes: o dia e' dividido so' nos dias em que ela existe", () => {
  // a o mes todo; b so' de 20 a 31/07 (8 dias uteis: 20,21,22,23,24,27,28,29,30,31 = 10 dias)
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("b", { codccu: "230", actualStartedAt: "2026-07-20", actualEndedAt: "2026-07-31", status: "FEITO" }),
  ] });
  const h = Object.fromEntries(r.centros.map((c) => [c.codccu, c.horas]));
  // 13 dias so' com a (104 h) + 10 dias divididos (40 h cada) = a: 144, b: 40
  assert.equal(h["190"], 144);
  assert.equal(h["230"], 40);
  assert.equal(r.horasAlocadas, 184);
});

test("dia sem nenhuma tarefa em andamento vira horas sem tarefa e fica fora do percentual", () => {
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [tarefa("a", { actualStartedAt: "2026-07-15", actualEndedAt: "2026-07-31", status: "FEITO" })] });
  // 1 a 14/07 = 10 dias uteis sem tarefa; 15 a 31 = 13 dias com tarefa
  assert.equal(r.diasSemTarefa.length, 10);
  assert.equal(r.horasSemTarefa, 80);
  assert.equal(r.horasAlocadas, 104);
  assert.equal(r.centros[0].percentual, 100, "percentual e' sobre as horas alocadas");
  assert.equal(r.diasSemTarefa[0], "2026-07-01");
});

test("so' conta a partir da ativacao e, no mes corrente, ate hoje (nunca dia futuro)", () => {
  const r = calcularMes({ ...base, desde: "2026-07-20", competencia: "2026-07", hoje: "2026-08-05", tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] });
  assert.equal(r.de, "2026-07-20");
  assert.equal(r.diasUteis, 10); // 20,21,22,23,24,27,28,29,30,31
  const parcial = calcularMes({ ...base, competencia: "2026-11", hoje: "2026-11-05", tarefas: [tarefa("a", { actualStartedAt: "2026-10-01" })] });
  assert.equal(parcial.ate, "2026-11-05");
  assert.equal(parcial.diasUteis, 3, "3, 4 e 5/11 (2/11 e' Finados); dias futuros nao contam");
  const antes = calcularMes({ ...base, desde: "2026-09-01", competencia: "2026-07", hoje: "2026-08-05", tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] });
  assert.equal(antes.diasUteis, 0, "mes anterior a ativacao nao conta");
  assert.deepEqual(antes.centros, []);
});

test("ausencias (ferias, atestado) tiram o dia da conta", () => {
  const r = calcularMes({ ...base, ausencias: [{ de: "2026-07-13", ate: "2026-07-17" }], competencia: "2026-07", hoje: "2026-08-05", tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] });
  assert.equal(r.diasUteis, 18);
  assert.equal(r.horasDisponiveis, 144);
  assert.equal(r.diasIgnorados.filter((d) => d.motivo === "ausência").length, 5);
});

test("tarefa-mae so' conta se a pessoa nao tem subtarefa dela; entrega (marco) nunca conta", () => {
  const mae = tarefa("mae", { codccu: "190", actualStartedAt: "2026-07-01", temSubtarefaDaPessoa: true });
  const filha = tarefa("filha", { codccu: "230", actualStartedAt: "2026-07-01" });
  const marco = tarefa("marco", { codccu: "999", actualStartedAt: "2026-07-01", isEntrega: true });
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [mae, filha, marco] });
  assert.deepEqual(r.centros.map((c) => c.codccu), ["230"]);
  assert.equal(r.centros[0].horas, 184);
});

test("historico de status: pausa em Bloqueado nao conta; volta a Fazendo conta de novo", () => {
  const t = tarefa("a", { status: "FAZENDO", actualStartedAt: "2026-07-01", eventos: [
    { em: "2026-07-01", de: "A_FAZER", para: "FAZENDO" },
    { em: "2026-07-10", de: "FAZENDO", para: "BLOQUEADO" },
    { em: "2026-07-20", de: "BLOQUEADO", para: "FAZENDO" },
  ] });
  const j = janelasDaTarefa(t, "2026-08-05");
  assert.equal(j.origem, "historico");
  assert.deepEqual(j.janelas.map((x) => [x.de, x.ate]), [["2026-07-01", "2026-07-10"], ["2026-07-20", "2026-08-05"]]);
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [t] });
  // uteis 1..10 (8 dias: 1,2,3,6,7,8,9,10) + 20..31 (9 dias: 20,21,22,23,24,27,28,29,30,31 = 10) => 18 dias; 11..17 e 20 de pausa: 13,14,15,16,17 +
  assert.equal(r.diasSemTarefa.includes("2026-07-13"), true);
  assert.equal(r.diasSemTarefa.includes("2026-07-21"), false);
});

test("historico: tarefa que ja estava Fazendo antes do primeiro registro conta do inicio real ate a primeira mudanca", () => {
  const t = tarefa("a", { status: "FEITO", actualStartedAt: "2026-07-01", actualEndedAt: "2026-07-08", eventos: [{ em: "2026-07-08", de: "FAZENDO", para: "FEITO" }] });
  const j = janelasDaTarefa(t, "2026-08-05");
  assert.deepEqual(j.janelas.map((x) => [x.de, x.ate]), [["2026-07-01", "2026-07-08"]]);
});

test("sem historico: datas reais; nao iniciada: datas previstas (se ligado); concluida sem data: no dia da conclusao; bloqueada: nada", () => {
  assert.deepEqual(janelasDaTarefa(tarefa("a", { actualStartedAt: "2026-07-01", actualEndedAt: "2026-07-03", status: "FEITO" }), "2026-08-05").janelas.map((x) => [x.de, x.ate]), [["2026-07-01", "2026-07-03"]]);
  assert.deepEqual(janelasDaTarefa(tarefa("b", { status: "A_FAZER", startDate: "2026-07-06", dueDate: "2026-07-08" }), "2026-08-05").janelas.map((x) => [x.de, x.ate]), [["2026-07-06", "2026-07-08"]]);
  assert.equal(janelasDaTarefa(tarefa("c", { status: "A_FAZER", startDate: "2026-07-06", dueDate: "2026-07-08" }), "2026-08-05", false).janelas.length, 0, "opcao desligada");
  assert.deepEqual(janelasDaTarefa(tarefa("d", { status: "FEITO", atualizadaEm: "2026-07-09" }), "2026-08-05").janelas.map((x) => [x.de, x.ate, x.origem]), [["2026-07-09", "2026-07-09", "conclusao"]]);
  assert.equal(janelasDaTarefa(tarefa("e", { status: "BLOQUEADO", startDate: "2026-07-06", dueDate: "2026-07-08" }), "2026-08-05").janelas.length, 0);
  assert.deepEqual(janelasDaTarefa(tarefa("f", { status: "A_FAZER", startDate: "2026-07-06", durationDays: 3 }), "2026-08-05").janelas.map((x) => [x.de, x.ate]), [["2026-07-06", "2026-07-08"]]);
  assert.deepEqual(janelasDaTarefa(tarefa("g", { status: "FAZENDO", actualStartedAt: "2026-07-30" }), "2026-08-03").janelas.map((x) => [x.de, x.ate]), [["2026-07-30", "2026-08-03"]], "aberta conta ate hoje");
});

test("tarefa em projeto sem centro de custo e tarefa sem projeto ficam em linhas proprias, fora do percentual identificado", () => {
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }),
    tarefa("b", { codccu: null, actualStartedAt: "2026-07-01" }),
    tarefa("c", { projetoId: null, projetoNome: null, codccu: null, actualStartedAt: "2026-07-01" }),
  ] });
  assert.equal(r.centros.length, 3);
  const sem = r.centros.find((c) => c.chave === SEM_CENTRO)!;
  assert.equal(sem.identificado, false);
  assert.equal(r.centros.filter((c) => c.identificado).length, 1);
  assert.equal(r.centros.reduce((s, c) => s + c.percentual, 0), 100);
  assert.ok(r.percentualIdentificado < 100);
  assert.equal(r.horasIdentificadas, r.centros.find((c) => c.codccu === "190")!.horas);
});

test("arredondamento nunca perde hora: 3 tarefas dividindo 8 h, em todos os niveis, fecham no total", () => {
  assert.deepEqual(arredondarSomando([2.6666, 2.6666, 2.6666], 8), [2.67, 2.67, 2.66]);
  const r = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("b", { codccu: "230", actualStartedAt: "2026-07-01" }), tarefa("c", { codccu: "250", actualStartedAt: "2026-07-01" }),
  ] });
  assert.equal(Math.round(r.centros.reduce((s, c) => s + c.horas, 0) * 100) / 100, r.horasAlocadas);
  assert.equal(Math.round(r.centros.reduce((s, c) => s + c.percentual, 0) * 100) / 100, 100);
  for (const c of r.centros) assert.equal(Math.round(c.projetos.reduce((s, p) => s + p.horas, 0) * 100) / 100, c.horas);
});

test("carga diaria diferente (6 h) e mes que nao existe tarefa: tudo zero, sem erro", () => {
  const r = calcularMes({ ...base, horasPorDia: 6, competencia: "2026-07", hoje: "2026-08-05", tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] });
  assert.equal(r.horasAlocadas, 138);
  const vazio = calcularMes({ ...base, competencia: "2026-07", hoje: "2026-08-05", tarefas: [] });
  assert.equal(vazio.horasAlocadas, 0);
  assert.equal(vazio.horasSemTarefa, 184);
  assert.deepEqual(vazio.centros, []);
  assert.equal(vazio.percentualIdentificado, 0);
});

test("dia de Sao Paulo: carimbo de 01h UTC ainda e' o dia anterior no Brasil", () => {
  assert.equal(diaSP(new Date("2026-07-02T01:00:00Z")), "2026-07-01");
  assert.equal(diaSP(new Date("2026-07-02T12:00:00Z")), "2026-07-02");
});
