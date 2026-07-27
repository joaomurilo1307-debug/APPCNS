import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamIds } from "@/lib/permissions";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const systemRole = (session.user as any).systemRole;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const assigneeId = searchParams.get("assigneeId") ?? undefined;

  let visibilityFilter: any = {};
  if (systemRole !== "ADMIN") {
    const teamIds = await getUserTeamIds(userId);
    visibilityFilter = {
      OR: [
        { project: { teamId: { in: teamIds } } },
        { projectId: null, assigneeId: userId },
      ],
    };
  }

  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        visibilityFilter,
        projectId ? { projectId } : {},
        assigneeId ? { assigneeId } : {},
      ],
    },
    include: {
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true, teamId: true } },
      _count: { select: { attachments: true, comments: true } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });

  return NextResponse.json(tasks);
}

const createTaskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
  isRotina: z.boolean().optional(),
  rotinaFrequencia: z.enum(["DIARIA", "SEMANAL", "MENSAL"]).nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const task = await prisma.task.create({
    data: {
      ...parsed.data,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  return NextResponse.json(task, { status: 201 });
}
