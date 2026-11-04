import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSeSoConsulta } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { canModifyTaskScoped, canDeleteTask, canViewProject } from "@/lib/permissions";
import { reconcileTaskOutlook, removeTaskFromOutlook } from "@/lib/taskOutlookSync";
import { rescheduleAndPersist } from "@/lib/reschedule";
import { z } from "zod";
import { HORAS_OBRIGATORIAS, registrarMudancas, timesheetAtivo } from "@/lib/timesheetAuto/historico";
import { diaSP } from "@/lib/timesheetAuto/calculo";
import { hojeSP } from "@/lib/timesheetAuto/servidor";

const updateTaskSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["A_FAZER", "FAZENDO", "BLOQUEADO", "FEITO"]).optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
  assigneeId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  actualStartedAt: z.string().datetime().nullable().optional(),
  actualEndedAt: z.string().datetime().nullable().optional(),
  durationDays: z.number().int().min(0).max(3650).nullable().optional(),
  // horas que a pessoa dedicou a tarefa inteira: ancoram o Timesheet automatico e o custo do projeto (null = apaga)
  horasDedicadas: z.number().positive().max(5000).nullable().optional(),
  isEntrega: z.boolean().optional(),
  locked: z.boolean().optional(),
  customFieldValues: z.record(z.string().nullable()).optional(),
});

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: {
      assignee: { select: { id: true, name: true, avatarColor: true } },
      project: { select: { id: true, name: true, teamId: true } },
      parentTask: { select: { id: true, title: true } },
      subtasks: { include: { assignee: { select: { id: true, name: true, avatarColor: true } } } },
      attachments: true,
      comments: { include: { author: { select: { id: true, name: true } } }, orderBy: { createdAt: "asc" } },
    },
  });
  if (!task) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  const uid = (session.user as any).id;
  if (task.assigneeId !== uid && !(task.projectId && (await canViewProject(uid, (session.user as any).role, task.projectId)))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  return NextResponse.json(task);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  { const soConsulta = await negarSeSoConsulta(session.user as any, "tarefas"); if (soConsulta) return soConsulta; }

  const task = await prisma.task.findUnique({
    where: { id: params.id },
    include: { project: { select: { teamId: true } } },
  });
  if (!task) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const isAssignee = task.assigneeId === userId;

  if (!(await canModifyTaskScoped(userId, role, isAssignee, task.locked, task.project?.teamId, task.projectId))) {
    return NextResponse.json({ error: "Sem permissão para alterar esta tarefa" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (parsed.data.locked !== undefined && role !== "ADMIN" && role !== "GESTOR_PROJETO") {
    return NextResponse.json({ error: "Só Admin ou Gestor de Projeto pode travar/destravar tarefa" }, { status: 403 });
  }

  if (parsed.data.parentTaskId) {
    if (parsed.data.parentTaskId === task.id) {
      return NextResponse.json({ error: "Uma tarefa não pode ser subtarefa dela mesma" }, { status: 422 });
    }
    let cursor: string | null = parsed.data.parentTaskId;
    while (cursor) {
      const ancestor: { id: string; parentTaskId: string | null } | null = await prisma.task.findUnique({
        where: { id: cursor },
        select: { id: true, parentTaskId: true },
      });
      if (!ancestor) break;
      if (ancestor.parentTaskId === task.id) {
        return NextResponse.json({ error: "Isso criaria um ciclo entre tarefa e subtarefa" }, { status: 422 });
      }
      cursor = ancestor.parentTaskId;
    }
  }

  // Concluir (100%) exige as horas dedicadas quando o responsavel usa o Timesheet automatico: e' a base do calculo de horas por centro de custo.
  if (parsed.data.status === "FEITO" && task.status !== "FEITO") {
    const responsavel = parsed.data.assigneeId !== undefined ? parsed.data.assigneeId : task.assigneeId;
    const marco = parsed.data.isEntrega !== undefined ? parsed.data.isEntrega : task.isEntrega;
    // faltam as horas quando nao ha nenhuma; e, se foram informadas antes (em andamento), a pessoa confirma o TOTAL na conclusao (podem ter mudado desde entao)
    const desatualizadas = !!task.horasDedicadasEm && diaSP(task.horasDedicadasEm) < hojeSP();
    const faltam = parsed.data.horasDedicadas !== undefined ? parsed.data.horasDedicadas == null : task.horasDedicadas == null || desatualizadas;
    if (responsavel && !marco && faltam && (await timesheetAtivo(responsavel))) {
      // tarefa-mae cujas subtarefas sao da mesma pessoa: so' as subtarefas contam horas
      const temSubtarefaDela = (await prisma.task.count({ where: { parentTaskId: task.id, assigneeId: responsavel } })) > 0;
      if (!temSubtarefaDela) {
        const confirmar = task.horasDedicadas != null;
        return NextResponse.json({ error: confirmar ? "Confirme o total de horas dedicadas a esta tarefa antes de concluí-la." : "Informe as horas dedicadas a esta tarefa antes de concluí-la.", code: HORAS_OBRIGATORIAS, horasAtuais: task.horasDedicadas }, { status: 422 });
      }
    }
  }

  const { customFieldValues, ...rest } = parsed.data;
  const data: any = { ...rest };
  // o dia em que as horas foram informadas (ate ele valem; numa tarefa em andamento os dias seguintes sao estimados)
  if (parsed.data.horasDedicadas !== undefined) data.horasDedicadasEm = parsed.data.horasDedicadas === null ? null : new Date();
  if (parsed.data.dueDate !== undefined) {
    data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  }
  if (parsed.data.startDate !== undefined) {
    data.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  }
  if (parsed.data.status !== undefined && parsed.data.status !== task.status) {
    if (parsed.data.status === "FAZENDO" && !task.actualStartedAt) {
      data.actualStartedAt = new Date();
    }
    if (parsed.data.status === "FEITO") {
      data.actualEndedAt = new Date();
      if (!task.actualStartedAt) data.actualStartedAt = data.actualStartedAt ?? new Date();
    } else if (task.status === "FEITO") {
      data.actualEndedAt = null;
    }
  }
  // valor explícito no corpo sempre vence o auto-preenchimento acima —
  // permite corrigir a data real (ex.: importação de trabalho já feito
  // no passado, que não pode ficar carimbado com o momento do PATCH).
  if (parsed.data.actualStartedAt !== undefined) {
    data.actualStartedAt = parsed.data.actualStartedAt ? new Date(parsed.data.actualStartedAt) : null;
  }
  if (parsed.data.actualEndedAt !== undefined) {
    data.actualEndedAt = parsed.data.actualEndedAt ? new Date(parsed.data.actualEndedAt) : null;
  }

  const affectsSchedule =
    parsed.data.durationDays !== undefined || parsed.data.startDate !== undefined || parsed.data.dueDate !== undefined;

  const updated = await prisma.$transaction(async (tx) => {
    let result = await tx.task.update({ where: { id: params.id }, data });
    // historico de status e de responsavel: o timesheet automatico so' conta os dias em que a tarefa esteve "Fazendo" e na mao de quem era o responsavel
    await registrarMudancas(tx, { taskId: params.id, porUserId: userId, antes: { status: task.status, assigneeId: task.assigneeId, horasDedicadas: task.horasDedicadas }, depois: { status: result.status, assigneeId: result.assigneeId, horasDedicadas: result.horasDedicadas } });
    if (task.assigneeId !== result.assigneeId) result = await tx.task.findUniqueOrThrow({ where: { id: params.id } });
    if (customFieldValues) {
      for (const [customFieldId, value] of Object.entries(customFieldValues)) {
        await tx.taskCustomFieldValue.upsert({
          where: { taskId_customFieldId: { taskId: params.id, customFieldId } },
          update: { value },
          create: { taskId: params.id, customFieldId, value },
        });
      }
    }
    if (affectsSchedule && result.projectId) {
      await rescheduleAndPersist(tx, result.projectId);
      result = await tx.task.findUniqueOrThrow({ where: { id: params.id } });
    }
    return result;
  });

  await reconcileTaskOutlook(
    { assigneeId: task.assigneeId, outlookEventId: task.outlookEventId },
    {
      id: updated.id,
      title: updated.title,
      dueDate: updated.dueDate,
      assigneeId: updated.assigneeId,
      status: updated.status,
      outlookEventId: updated.outlookEventId,
    }
  );

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  { const soConsulta = await negarSeSoConsulta(session.user as any, "tarefas"); if (soConsulta) return soConsulta; }

  const role = (session.user as any).role;
  if (!canDeleteTask(role)) {
    return NextResponse.json({ error: "Só Admin ou Gestor de Projeto pode excluir tarefas" }, { status: 403 });
  }

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (task.locked) {
    return NextResponse.json({ error: "Tarefa travada — destrave antes de excluir" }, { status: 403 });
  }

  await removeTaskFromOutlook({ assigneeId: task.assigneeId, outlookEventId: task.outlookEventId });

  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
