import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canModifyTask, canDeleteTask } from "@/lib/permissions";
import { reconcileTaskOutlook, removeTaskFromOutlook } from "@/lib/taskOutlookSync";
import { z } from "zod";

const updateTaskSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(["A_FAZER", "FAZENDO", "BLOQUEADO", "FEITO"]).optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
  assigneeId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
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
  return NextResponse.json(task);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const isAssignee = task.assigneeId === userId;

  if (!canModifyTask(role, isAssignee, task.locked)) {
    return NextResponse.json({ error: "Sem permissão para alterar esta tarefa" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (parsed.data.locked !== undefined && role !== "ADMIN" && role !== "GESTOR_PROJETO") {
    return NextResponse.json({ error: "Só Admin ou Gestor de Projeto pode travar/destravar tarefa" }, { status: 403 });
  }

  const { customFieldValues, ...rest } = parsed.data;
  const data: any = { ...rest };
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

  const updated = await prisma.task.update({ where: { id: params.id }, data });

  if (customFieldValues) {
    for (const [customFieldId, value] of Object.entries(customFieldValues)) {
      await prisma.taskCustomFieldValue.upsert({
        where: { taskId_customFieldId: { taskId: params.id, customFieldId } },
        update: { value },
        create: { taskId: params.id, customFieldId, value },
      });
    }
  }

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
