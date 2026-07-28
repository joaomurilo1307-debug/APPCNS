import { prisma } from "@/lib/prisma";
import { pushCreateEvent, pushUpdateEvent, pushDeleteEvent } from "@/lib/microsoftGraph";

const REMINDER_MINUTES_BEFORE = 60;

function isMidnight(d: Date) {
  return d.getHours() === 0 && d.getMinutes() === 0;
}

function taskEventPayload(title: string, dueDate: Date) {
  const allDay = isMidnight(dueDate);
  return {
    title: `Prazo: ${title}`,
    description: null,
    startAt: dueDate,
    endAt: allDay ? null : new Date(dueDate.getTime() + 30 * 60 * 1000),
    allDay,
  };
}

type TaskState = {
  id: string;
  title: string;
  dueDate: Date | null;
  assigneeId: string | null;
  status: string;
  outlookEventId: string | null;
};

/** Cria/atualiza/remove o evento de prazo no Outlook do responsável conforme o estado da tarefa muda. */
export async function reconcileTaskOutlook(prev: Pick<TaskState, "assigneeId" | "outlookEventId">, updated: TaskState) {
  const shouldHaveEvent = !!updated.dueDate && !!updated.assigneeId && updated.status !== "FEITO";
  const assigneeChanged = prev.assigneeId !== updated.assigneeId;

  if (prev.outlookEventId && (assigneeChanged || !shouldHaveEvent)) {
    if (prev.assigneeId) await pushDeleteEvent(prev.assigneeId, prev.outlookEventId);
    await prisma.task.update({ where: { id: updated.id }, data: { outlookEventId: null } });
    updated.outlookEventId = null;
  }

  if (!shouldHaveEvent) return;

  const payload = taskEventPayload(updated.title, updated.dueDate!);

  if (updated.outlookEventId && !assigneeChanged) {
    await pushUpdateEvent(updated.assigneeId!, updated.outlookEventId, payload, REMINDER_MINUTES_BEFORE);
  } else {
    const outlookEventId = await pushCreateEvent(updated.assigneeId!, payload, REMINDER_MINUTES_BEFORE);
    if (outlookEventId) {
      await prisma.task.update({ where: { id: updated.id }, data: { outlookEventId } });
    }
  }
}

export async function removeTaskFromOutlook(task: Pick<TaskState, "assigneeId" | "outlookEventId">) {
  if (task.outlookEventId && task.assigneeId) {
    await pushDeleteEvent(task.assigneeId, task.outlookEventId);
  }
}
