// Historico de tarefas que alimenta o Timesheet automatico: cada mudanca de status e cada troca de responsavel fica registrada com a data. Sem isso so'
// saberiamos o estado de hoje e o passado seria chute. Todo lugar do sistema que muda status/responsavel de tarefa chama `registrarMudancas`.

import type { Prisma, TaskStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;
type Estado = { status: TaskStatus; assigneeId: string | null };

export async function registrarMudancas(db: Db, p: { taskId: string; porUserId: string | null; antes: Estado; depois: Estado }): Promise<void> {
  if (p.antes.status !== p.depois.status) {
    await db.tarefaStatusEvento.create({ data: { taskId: p.taskId, userId: p.porUserId, de: p.antes.status, para: p.depois.status } });
  }
  if (p.antes.assigneeId !== p.depois.assigneeId) {
    await db.tarefaResponsavelEvento.create({ data: { taskId: p.taskId, deUserId: p.antes.assigneeId, paraUserId: p.depois.assigneeId, porUserId: p.porUserId } });
  }
}

/** A pessoa ativou o Timesheet? So' para ela as horas dedicadas sao obrigatorias ao concluir a tarefa. */
export async function timesheetAtivo(userId: string): Promise<boolean> {
  return (await prisma.timesheetAuto.count({ where: { userId, ativo: true } })) > 0;
}

export const HORAS_OBRIGATORIAS = "HORAS_OBRIGATORIAS";
