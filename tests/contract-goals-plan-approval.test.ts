import test from "node:test";
import assert from "node:assert/strict";
import { assinaturaDoPlano, estadoEfetivoDaAprovacao, type PlanoParaAprovacao } from "../src/lib/contractGoals/planApproval";

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
