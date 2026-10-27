import { createHash } from "node:crypto";
import type { Prisma } from "@prisma/client";

type Activity = { id: string; title: string; description?: string | null; ownerId?: string | null; dueDate?: Date | string | null; status: string; migratedAt?: Date | null; task?: unknown };
type ProjectTask = { id: string; title: string; description?: string | null; assigneeId?: string | null; dueDate?: Date | string | null; startDate?: Date | string | null; durationDays?: number | null; actualStartedAt?: Date | string | null; actualEndedAt?: Date | string | null; priority?: string | null; parentTaskId?: string | null; status: string };
export type PlanoParaAprovacao = {
  title: string; description?: string | null; planTitle?: string | null; planDescription?: string | null;
  planApprovalStatus?: string; planApprovalFingerprint?: string | null;
  actions: readonly Activity[];
  actionPlan?: { id: string; name: string; description?: string | null; startDate?: Date | string | null; endDate?: Date | string | null; actualStartedAt?: Date | string | null; actualEndedAt?: Date | string | null; status?: string | null; ownerId?: string | null; teamId?: string | null; tasks: readonly ProjectTask[] } | null;
};
/** Mesmo recorte no detalhe, na decisão e na caixa de aprovações evita assinaturas inconsistentes. */
export const selecionarProjetoParaAprovacao = {
  id: true, name: true, description: true, startDate: true, endDate: true, actualStartedAt: true, actualEndedAt: true, status: true, ownerId: true, teamId: true,
  tasks: { orderBy: { order: "asc" }, include: { assignee: { select: { id: true, name: true } } } },
} satisfies Prisma.ProjectSelect;
const statusDaTarefa = (status: string) => ({ A_FAZER: "A_FAZER", FAZENDO: "EM_ANDAMENTO", BLOQUEADO: "BLOQUEADA", FEITO: "CONCLUIDA" }[status] ?? status);
const date = (value?: Date | string | null) => value instanceof Date ? value.toISOString() : value ?? null;

/** Mesmos registros de execução da tela; ações migradas não são contadas novamente. */
export function atividadesDoPlano(meta: PlanoParaAprovacao): Activity[] {
  return [
    ...meta.actions.filter((action) => !action.migratedAt && !action.task),
    ...(meta.actionPlan?.tasks ?? []).map((task) => ({ ...task, ownerId: task.assigneeId, status: statusDaTarefa(task.status) })),
  ];
}

export function execucaoDoPlano(meta: PlanoParaAprovacao) {
  const activities = atividadesDoPlano(meta).filter((activity) => activity.status !== "CANCELADA");
  const completed = activities.filter((activity) => activity.status === "CONCLUIDA").length;
  return { total: activities.length, completed, fraction: activities.length ? completed / activities.length : null };
}

/** Aprovação vale para o conteúdo submetido; qualquer edição posterior exige nova análise. */
export function assinaturaDoPlano(meta: PlanoParaAprovacao): string {
  const tasks = new Map((meta.actionPlan?.tasks ?? []).map((task) => [task.id, task]));
  const activities = atividadesDoPlano(meta).map((activity) => {
    const task = tasks.get(activity.id);
    return { id: activity.id, title: activity.title, description: activity.description ?? null, ownerId: activity.ownerId ?? null, dueDate: date(activity.dueDate), status: activity.status,
      startDate: date(task?.startDate), durationDays: task?.durationDays ?? null, actualStartedAt: date(task?.actualStartedAt), actualEndedAt: date(task?.actualEndedAt), priority: task?.priority ?? null, parentTaskId: task?.parentTaskId ?? null };
  }).sort((a, b) => a.id.localeCompare(b.id));
  const project = meta.actionPlan ? { id: meta.actionPlan.id, name: meta.actionPlan.name, description: meta.actionPlan.description ?? null, startDate: date(meta.actionPlan.startDate), endDate: date(meta.actionPlan.endDate), actualStartedAt: date(meta.actionPlan.actualStartedAt), actualEndedAt: date(meta.actionPlan.actualEndedAt), status: meta.actionPlan.status ?? null, ownerId: meta.actionPlan.ownerId ?? null, teamId: meta.actionPlan.teamId ?? null } : null;
  return createHash("sha256").update(JSON.stringify({ name: meta.planTitle ?? meta.actionPlan?.name ?? meta.title, description: meta.planDescription ?? meta.description ?? null, project, activities })).digest("hex");
}

export function estadoEfetivoDaAprovacao(meta: PlanoParaAprovacao): string {
  const status = meta.planApprovalStatus ?? "NAO_SOLICITADA";
  if (["PENDENTE", "APROVADO"].includes(status) && (execucaoDoPlano(meta).fraction !== 1 || meta.planApprovalFingerprint !== assinaturaDoPlano(meta))) return "REAVALIAR";
  return status;
}
