import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";

function hoursSpent(actualStartedAt: Date | null, actualEndedAt: Date | null): number {
  if (!actualStartedAt) return 0;
  const end = actualEndedAt ?? new Date();
  return Math.max(0, (end.getTime() - actualStartedAt.getTime()) / 3_600_000);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      team: { include: { members: { include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } } } } },
      resourceRates: true,
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          assigneeId: true,
          assignee: { select: { id: true, name: true } },
          actualStartedAt: true,
          actualEndedAt: true,
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const rateByUser = new Map(project.resourceRates.map((r) => [r.userId, r.hourlyRate]));

  const activities = project.tasks
    .filter((t) => t.assigneeId)
    .map((t) => {
      const h = hoursSpent(t.actualStartedAt, t.actualEndedAt);
      const rate = rateByUser.get(t.assigneeId!) ?? 0;
      return {
        taskId: t.id,
        title: t.title,
        status: t.status,
        assigneeId: t.assigneeId,
        assigneeName: t.assignee?.name ?? "",
        hoursSpent: h,
        hourlyRate: rate,
        cost: h * rate,
      };
    })
    .sort((a, b) => b.hoursSpent - a.hoursSpent);

  const resources = project.team.members.map((m) => {
    const rate = rateByUser.get(m.user.id) ?? 0;
    const mine = activities.filter((a) => a.assigneeId === m.user.id);
    const totalHours = mine.reduce((s, a) => s + a.hoursSpent, 0);
    return {
      userId: m.user.id,
      name: m.user.name,
      avatarColor: m.user.avatarColor,
      avatarUrl: m.user.avatarUrl,
      hourlyRate: rate,
      hoursSpent: totalHours,
      cost: totalHours * rate,
    };
  });

  return NextResponse.json({ resources, activities });
}

const rateSchema = z.object({
  userId: z.string(),
  hourlyRate: z.number().min(0),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageTeam(userId, role, project.teamId);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = rateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const rate = await prisma.resourceRate.upsert({
    where: { projectId_userId: { projectId: params.id, userId: parsed.data.userId } },
    update: { hourlyRate: parsed.data.hourlyRate },
    create: { projectId: params.id, userId: parsed.data.userId, hourlyRate: parsed.data.hourlyRate },
  });

  return NextResponse.json(rate);
}
