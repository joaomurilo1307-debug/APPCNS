import type { Prisma } from "@prisma/client";
import type { DependencyType } from "./cpm";

export type RescheduleTaskInput = {
  id: string;
  startDate: Date | null;
  dueDate: Date | null;
  durationDays: number | null;
};

export type RescheduleDependencyInput = {
  predecessorId: string;
  successorId: string;
  type: DependencyType;
  lagDays: number;
};

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function derivedDuration(t: RescheduleTaskInput): number | null {
  if (t.durationDays !== null && t.durationDays !== undefined) return t.durationDays;
  if (t.startDate && t.dueDate) {
    return Math.max(0, Math.round((t.dueDate.getTime() - t.startDate.getTime()) / 86400000));
  }
  return null;
}

/**
 * Recalcula início/término das tarefas COM predecessora, em cascata (ordem topológica), a partir
 * da duração informada e do término/início da(s) predecessora(s) — "auto schedule" no espírito do
 * MS Project/Primavera. Tarefas sem predecessora nunca são tocadas aqui (são a âncora manual do
 * cronograma). Tarefas com predecessora só são recalculadas se tiverem duração definida
 * (`durationDays`, ou derivada de datas já existentes) — sem duração, ficam como estão.
 * Tarefas dentro de um ciclo de dependências (não deveria acontecer, a criação já bloqueia ciclos)
 * também ficam de fora, por segurança.
 */
export function rescheduleProject(
  tasks: RescheduleTaskInput[],
  dependencies: RescheduleDependencyInput[]
): Map<string, { startDate: Date; dueDate: Date }> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const idSet = new Set(tasks.map((t) => t.id));
  const predsOf = new Map<string, RescheduleDependencyInput[]>();
  const succsOf = new Map<string, RescheduleDependencyInput[]>();
  for (const d of dependencies) {
    if (!idSet.has(d.predecessorId) || !idSet.has(d.successorId)) continue;
    if (!predsOf.has(d.successorId)) predsOf.set(d.successorId, []);
    predsOf.get(d.successorId)!.push(d);
    if (!succsOf.has(d.predecessorId)) succsOf.set(d.predecessorId, []);
    succsOf.get(d.predecessorId)!.push(d);
  }

  const inDegree = new Map<string, number>();
  for (const t of tasks) inDegree.set(t.id, (predsOf.get(t.id) ?? []).length);
  const queue = tasks.filter((t) => (inDegree.get(t.id) ?? 0) === 0).map((t) => t.id);
  const order: string[] = [];
  const seen = new Set<string>();
  while (queue.length) {
    const id = queue.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
    for (const d of succsOf.get(id) ?? []) {
      const remaining = (inDegree.get(d.successorId) ?? 0) - 1;
      inDegree.set(d.successorId, remaining);
      if (remaining === 0) queue.push(d.successorId);
    }
  }

  const resolvedStart = new Map<string, Date>();
  const resolvedEnd = new Map<string, Date>();
  const result = new Map<string, { startDate: Date; dueDate: Date }>();

  for (const id of order) {
    const t = byId.get(id)!;
    const preds = predsOf.get(id) ?? [];
    if (preds.length === 0) {
      // âncora manual: nunca mexe no início, mas se já tem início + duração, o término
      // segue a duração (mesmo pra tarefa raiz — sem isso, colocar só a duração numa
      // tarefa sem predecessora nunca preenchia o término).
      const rootDuration = derivedDuration(t);
      if (t.startDate && rootDuration !== null) {
        const newEnd = addDays(t.startDate, rootDuration);
        resolvedStart.set(id, t.startDate);
        resolvedEnd.set(id, newEnd);
        result.set(id, { startDate: t.startDate, dueDate: newEnd });
      } else {
        if (t.startDate) resolvedStart.set(id, t.startDate);
        if (t.dueDate) resolvedEnd.set(id, t.dueDate);
      }
      continue;
    }

    const duration = derivedDuration(t);
    if (duration === null) continue;

    let candidateStart: Date | null = null;
    for (const link of preds) {
      const predStart = resolvedStart.get(link.predecessorId);
      const predEnd = resolvedEnd.get(link.predecessorId);
      if (!predStart || !predEnd) continue;
      let c: Date;
      if (link.type === "FS") c = addDays(predEnd, link.lagDays);
      else if (link.type === "SS") c = addDays(predStart, link.lagDays);
      else if (link.type === "FF") c = addDays(predEnd, link.lagDays - duration);
      else c = addDays(predStart, link.lagDays - duration); // SF
      if (!candidateStart || c > candidateStart) candidateStart = c;
    }
    if (!candidateStart) continue;

    const newEnd = addDays(candidateStart, duration);
    resolvedStart.set(id, candidateStart);
    resolvedEnd.set(id, newEnd);
    result.set(id, { startDate: candidateStart, dueDate: newEnd });
  }

  return result;
}

/**
 * Busca todas as tarefas + dependências do projeto, recalcula em cascata e persiste só o que
 * mudou. Chamado depois de qualquer alteração que possa afetar o cronograma de um projeto:
 * duração/data de uma tarefa, ou criação/remoção de dependência.
 */
export async function rescheduleAndPersist(tx: Prisma.TransactionClient, projectId: string) {
  const tasks = await tx.task.findMany({
    where: { projectId },
    select: { id: true, startDate: true, dueDate: true, durationDays: true },
  });
  if (tasks.length === 0) return;

  const dependencies = await tx.taskDependency.findMany({
    where: { successor: { projectId } },
    select: { predecessorId: true, successorId: true, type: true, lagDays: true },
  });

  const result = rescheduleProject(tasks, dependencies);
  const byId = new Map(tasks.map((t) => [t.id, t]));

  for (const [id, dates] of result) {
    const current = byId.get(id)!;
    const changedStart = !current.startDate || current.startDate.getTime() !== dates.startDate.getTime();
    const changedEnd = !current.dueDate || current.dueDate.getTime() !== dates.dueDate.getTime();
    if (changedStart || changedEnd) {
      await tx.task.update({ where: { id }, data: { startDate: dates.startDate, dueDate: dates.dueDate } });
    }
  }
}
