import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamIds } from "@/lib/permissions";
import { z } from "zod";

async function visibilityFilterFor(userId: string, role: string) {
  if (role === "ADMIN") return {};

  if (role === "CLIENTE") {
    return { project: { clients: { some: { userId } } } };
  }

  if (role === "APROVADOR") {
    const teamIds = await getUserTeamIds(userId);
    return {
      OR: [
        { project: { teamId: { in: teamIds } } },
        { project: { approverId: userId } },
        { projectId: null, assigneeId: userId },
      ],
    };
  }

  const teamIds = await getUserTeamIds(userId);
  return {
    OR: [
      { project: { teamId: { in: teamIds } } },
      { projectId: null, assigneeId: userId },
    ],
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
      _count: { select: { attachments: true, comments: true, subtasks: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
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
  isRotina: z.boolean().optional(),
  rotinaFrequencia: z.enum(["DIARIA", "SEMANAL", "MENSAL"]).nullable().optional(),
});

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

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
