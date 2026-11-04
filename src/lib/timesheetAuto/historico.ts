// Historico de tarefas que alimenta o Timesheet automatico: cada mudanca de status e cada troca de responsavel fica registrada com a data. Sem isso so'
// saberiamos o estado de hoje e o passado seria chute. Todo lugar do sistema que muda status/responsavel de tarefa chama `registrarMudancas`.

import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;
type Estado = { status: TaskStatus; assigneeId: string | null; horasDedicadas: number | null };

export async function registrarMudancas(db: Db, p: { taskId: string; porUserId: string | null; antes: Estado; depois: Estado }): Promise<void> {
  if (p.antes.status !== p.depois.status) {
    await db.tarefaStatusEvento.create({ data: { taskId: p.taskId, userId: p.porUserId, de: p.antes.status, para: p.depois.status } });
  }
  if (p.antes.assigneeId !== p.depois.assigneeId) {
    // as horas dedicadas pertencem a quem as informou: ficam guardadas no evento (para quem passou a tarefa) e o campo da tarefa zera para o novo dono informar as dele.
    // Se a mesma alteracao ja trouxe horas novas, elas sao do novo dono e ficam.
    await db.tarefaResponsavelEvento.create({ data: { taskId: p.taskId, deUserId: p.antes.assigneeId, paraUserId: p.depois.assigneeId, porUserId: p.porUserId, horasDoAnterior: p.antes.horasDedicadas } });
    if (p.antes.horasDedicadas !== null && p.depois.horasDedicadas === p.antes.horasDedicadas) {
      await db.task.update({ where: { id: p.taskId }, data: { horasDedicadas: null, horasDedicadasEm: null } });
    }
  }
}

/** A pessoa ativou o Timesheet? So' para ela as horas dedicadas sao obrigatorias ao concluir a tarefa. */
export async function timesheetAtivo(userId: string): Promise<boolean> {
  return (await prisma.timesheetAuto.count({ where: { userId, ativo: true } })) > 0;
}

export const HORAS_OBRIGATORIAS = "HORAS_OBRIGATORIAS";
