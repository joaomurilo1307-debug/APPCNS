import test from "node:test";
import assert from "node:assert/strict";
import { assinaturaDoPlano, estadoEfetivoDaAprovacao, execucaoDoPlano, type PlanoParaAprovacao } from "../src/lib/contractGoals/planApproval";
import { acaoMeta } from "../src/lib/contractGoals/validacao";
import { detalhesDoPlano, fimRealDoItem } from "../src/lib/contractGoals/planDetails";

const completedProject = (): PlanoParaAprovacao => ({
  title: "Reduzir retrabalho", planTitle: "Plano de melhoria", planDescription: "Plano preservado mesmo com nome próprio do projeto", planApprovalStatus: "APROVADO", actions: [],
  actionPlan: { id: "projeto-teste", name: "Projeto de execução", description: "Escopo aprovado", ownerId: "gestor", teamId: "equipe", status: "CONCLUIDO", startDate: "2026-08-01T12:00:00.000Z", endDate: "2026-09-30T12:00:00.000Z",
    tasks: [{ id: "atividade", title: "Mapear causas", description: "Entrega", assigneeId: "pessoa", status: "FEITO", startDate: "2026-08-10T12:00:00.000Z", dueDate: "2026-08-12T12:00:00.000Z", durationDays: 2, actualStartedAt: "2026-08-10T12:00:00.000Z", actualEndedAt: "2026-08-12T12:00:00.000Z", priority: "MEDIA", parentTaskId: null }] },
});
const approve = () => { const meta = completedProject(); meta.planApprovalFingerprint = assinaturaDoPlano(meta); return meta; };

test("renomear projeto invalida aprovação mesmo quando o título do plano é independente", () => {
  const meta = approve(); assert.equal(estadoEfetivoDaAprovacao(meta), "APROVADO");
  meta.actionPlan!.name = "Projeto com escopo novo";
  assert.equal(meta.planTitle, "Plano de melhoria"); assert.equal(estadoEfetivoDaAprovacao(meta), "REAVALIAR");
});

test("reprogramar início/duração ou corrigir datas reais da mesma atividade concluída exige reavaliação", () => {
  for (const change of [{ startDate: "2026-08-11T12:00:00.000Z" }, { durationDays: 3 }, { actualEndedAt: "2026-08-13T12:00:00.000Z" }, { priority: "ALTA" }, { parentTaskId: "outra-atividade" }]) {
    const meta = approve(); Object.assign(meta.actionPlan!.tasks[0], change);
    assert.equal(estadoEfetivoDaAprovacao(meta), "REAVALIAR", JSON.stringify(change));
  }
});

test("alterar equipe, responsável ou datas do projeto invalida a versão aprovada", () => {
  for (const change of [{ teamId: "outra-equipe" }, { ownerId: "outra-pessoa" }, { description: "Escopo alterado" }, { endDate: "2026-10-01T12:00:00.000Z" }]) {
    const meta = approve(); Object.assign(meta.actionPlan!, change);
    assert.equal(estadoEfetivoDaAprovacao(meta), "REAVALIAR", JSON.stringify(change));
  }
});

test("modelo de plano aceita medidas independentes e recusa campos e datas incoerentes", () => {
  const details = { competence: "2026-09", item: "1.2", account: "EPI e EPC", fact: "Consumo acima da referência", correctiveMeasure: "Revisar distribuição", correctiveHow: "Conferir estoque e entrega", preventiveMeasure: "Planejar consumo", preventiveHow: "Conferência mensal", plannedStart: "2026-09-01", originalDueDate: "2026-09-20", replannedDueDate: "2026-09-25", actualCompletion: null, notes: "Preservar a segurança" };
  assert.equal(detalhesDoPlano.safeParse(details).success, true);
  assert.equal(detalhesDoPlano.safeParse({ ...details, plannedStart: "2026-02-30" }).success, false);
  assert.equal(detalhesDoPlano.safeParse({ ...details, plannedStart: "2026-09-26" }).success, false);
  assert.equal(detalhesDoPlano.safeParse({ ...details, arbitraryField: "não permitido" }).success, false);
  assert.equal(acaoMeta.safeParse({ operation: "action", title: "Ação", status: "A_FAZER", planDetails: { ...details, actualCompletion: "2026-09-22" } }).success, false);
  assert.equal(acaoMeta.safeParse({ operation: "action", title: "Ação", status: "CONCLUIDA", planDetails: { ...details, actualCompletion: "2026-09-22" } }).success, true);
});

test("mudança de fato ou medida no plano independente exige reavaliar aprovação", () => {
  const meta: PlanoParaAprovacao = { title: "Melhoria", planApprovalStatus: "APROVADO", actions: [{ id: "item", title: "Rever distribuição", status: "CONCLUIDA", planDetails: { fact: "Consumo acima da referência", correctiveMeasure: "Rever distribuição" } }] };
  meta.planApprovalFingerprint = assinaturaDoPlano(meta);
  assert.equal(estadoEfetivoDaAprovacao(meta), "APROVADO");
  meta.actions[0].planDetails = { fact: "Outro desvio", correctiveMeasure: "Rever distribuição" };
  assert.equal(estadoEfetivoDaAprovacao(meta), "REAVALIAR");
});

test("modelo preservado na ação migrada participa da assinatura sem duplicar execução", () => {
  const meta = completedProject();
  meta.actions = [{ id: "origem", title: "Título anterior", status: "CONCLUIDA", migratedAt: new Date(), task: { id: "atividade" }, planDetails: { preventiveMeasure: "Conferência mensal", preventiveHow: "Revisar estoque" } }];
  meta.actionPlan!.tasks[0].sourceGoalActionId = "origem";
  meta.planApprovalFingerprint = assinaturaDoPlano(meta);
  assert.equal(estadoEfetivoDaAprovacao(meta), "APROVADO");
  assert.equal(execucaoDoPlano(meta).total, 1);
  meta.actions[0].planDetails = { preventiveMeasure: "Conferência mensal", preventiveHow: "Nova regra de estoque" };
  assert.equal(estadoEfetivoDaAprovacao(meta), "REAVALIAR");
});

test("prazo realizado no dia do início real não cria duração negativa por causa do horário", () => {
  assert.equal(fimRealDoItem("2026-09-20", new Date("2026-09-20T18:30:00.000Z"))?.toISOString(), "2026-09-20T18:30:00.000Z");
  assert.equal(fimRealDoItem("2026-09-20", new Date("2026-09-20T08:30:00.000Z"))?.toISOString(), "2026-09-20T12:00:00.000Z");
  assert.equal(fimRealDoItem("2026-09-21", new Date("2026-09-20T18:30:00.000Z"))?.toISOString(), "2026-09-21T12:00:00.000Z");
  assert.equal(fimRealDoItem(null, new Date("2026-09-20T18:30:00.000Z")), null);
});
