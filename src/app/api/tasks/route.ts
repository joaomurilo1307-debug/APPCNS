import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleProjectWhere } from "@/lib/permissions";
import { reconcileTaskOutlook } from "@/lib/taskOutlookSync";
import { rescheduleAndPersist } from "@/lib/reschedule";
import { generateRotinaOccurrences } from "@/lib/rotina";
import crypto from "crypto";
import { z } from "zod";

async function visibilityFilterFor(userId: string, role: string) {
  if (role === "ADMIN" || role === "DIRETOR") return {};

  if (role === "CLIENTE") {
    return { OR: [{ project: { clients: { some: { userId } } } }, { assigneeId: userId }] };
  }

  if (role === "APROVADOR") {
    const base = await visibleProjectWhere(userId, role);
    if (Object.keys(base).length === 0) return {};
    return {
      OR: [...(base.OR ?? [base]).map((clause: any) => ({ project: clause })), { project: { approverId: userId } }, { assigneeId: userId }],
    };
  }

  const base = await visibleProjectWhere(userId, role);
  if (Object.keys(base).length === 0) return {};
  return {
    OR: [...(base.OR ?? [base]).map((clause: any) => ({ project: clause })), { assigneeId: userId }],
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const assigneeId = searchParams.get("assigneeId") ?? undefined;
  const onlyTopLevel = searchParams.get("topLevel") === "true";

  const visibility = await visibilityFilterFor(userId, role);

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        visibility,
        projectId ? { projectId } : {},
        assigneeId ? { assigneeId } : {},
        onlyTopLevel ? { parentTaskId: null } : {},
      ],
    },
    include: {
      assignee: { select: { id: true, name: true, avatarColor: true } },
      project: { select: { id: true, name: true, teamId: true } },
      subtasks: {
        include: { assignee: { select: { id: true, name: true, avatarColor: true } } },
      },
      customFieldValues: true,
      predecessorLinks: {
        include: { predecessor: { select: { id: true, title: true } } },
      },
      _count: { select: { attachments: true, comments: true, subtasks: true } },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(tasks);
}

const createTaskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  durationDays: z.number().int().min(0).max(3650).nullable().optional(),
  isEntrega: z.boolean().optional(),
  isRotina: z.boolean().optional(),
  rotinaFrequencia: z.enum(["DIARIA", "SEMANAL", "MENSAL"]).nullable().optional(),
  rotinaAteData: z.string().datetime().nullable().optional(),
});

async function nextOrder(projectId: string | null | undefined) {
  if (!projectId) return Date.now();
  const max = await prisma.task.aggregate({ where: { projectId }, _max: { order: true } });
  return (max._max.order ?? 0) + 1;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = (session.user as any).role;
  if (role === "CLIENTE" || role === "VISUALIZADOR") {
    return NextResponse.json({ error: "Seu perfil não pode criar tarefas" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { rotinaAteData, ...rest } = parsed.data;

  if (rest.isRotina && rest.rotinaFrequencia && rotinaAteData) {
    const occurrences = generateRotinaOccurrences({
      startDate: rest.startDate ? new Date(rest.startDate) : new Date(),
      untilDate: new Date(rotinaAteData),
      frequencia: rest.rotinaFrequencia,
    });
    if (occurrences.length === 0) {
      return NextResponse.json({ error: "O período informado não gera nenhuma ocorrência." }, { status: 422 });
    }
    const rotinaGroupId = crypto.randomUUID();
    const baseOrder = await nextOrder(rest.projectId);
    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (let i = 0; i < occurrences.length; i++) {
        const occDate = occurrences[i];
        const dateLabel = occDate.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
        const occEnd = new Date(occDate);
        occEnd.setUTCDate(occEnd.getUTCDate() + (rest.durationDays ?? 0));
        const row = await tx.task.create({
          data: {
            ...rest,
            title: `${rest.title} — ${dateLabel}`,
            startDate: occDate,
            dueDate: occEnd,
            rotinaGroupId,
            order: baseOrder + i,
          },
        });
        rows.push(row);
      }
      return rows;
    });
    return NextResponse.json({ generated: created.length, tasks: created, rotinaGroupId }, { status: 201 });
  }

  const order = await nextOrder(parsed.data.projectId);

  let task = await prisma.task.create({
    data: {
      ...rest,
      order,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  if (parsed.data.durationDays !== undefined && task.projectId) {
    await prisma.$transaction(async (tx) => {
      await rescheduleAndPersist(tx, task.projectId!);
    });
    task = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  }

  await reconcileTaskOutlook(
    { assigneeId: null, outlookEventId: null },
    { id: task.id, title: task.title, dueDate: task.dueDate, assigneeId: task.assigneeId, status: task.status, outlookEventId: null }
  );

  return NextResponse.json(task, { status: 201 });
}
