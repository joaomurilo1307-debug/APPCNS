import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, isTeamManager } from "@/lib/permissions";
import { computeGoalFraction, computeGoalCurrentValue } from "@/lib/goals";
import { z } from "zod";

async function canManageGoal(userId: string, role: string, goal: { projectId: string | null; project: { teamId: string } | null }) {
  if (role === "ADMIN" || role === "DIRETOR") return true;
  if (!goal.projectId || !goal.project) return false;
  return canManageTeam(userId, role, goal.project.teamId);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const goal = await prisma.goal.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, name: true } },
      assignedUser: { select: { id: true, name: true, avatarColor: true } },
      assignedTeam: { select: { id: true, name: true } },
      subGoals: {
        include: {
          project: { select: { id: true, name: true } },
          assignedUser: { select: { id: true, name: true, avatarColor: true } },
          assignedTeam: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!goal) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const computedCurrentValue = await computeGoalCurrentValue(goal.id);
  const subGoalsWithFraction = await Promise.all(
    goal.subGoals.map(async (sg) => ({ ...sg, fraction: await computeGoalFraction(sg.id) }))
  );

  return NextResponse.json({ ...goal, computedCurrentValue, subGoals: subGoalsWithFraction });
}

const updateGoalSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().optional(),
  unit: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assignedUserId: z.string().nullable().optional(),
  assignedTeamId: z.string().nullable().optional(),
  parentGoalId: z.string().nullable().optional(),
  contributionValue: z.number().nullable().optional(),
  autoFromProjectProgress: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const goal = await prisma.goal.findUnique({ where: { id: params.id }, include: { project: true } });
  if (!goal) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const body = await req.json();
  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const canManage = await canManageGoal(userId, role, goal);
  const isAssignedUser = goal.assignedUserId === userId;
  const isAssignedTeamMember = goal.assignedTeamId
    ? await isTeamManager(userId, goal.assignedTeamId).then(async (isMgr) => {
        if (isMgr) return true;
        const membership = await prisma.userTeam.findUnique({
          where: { userId_teamId: { userId, teamId: goal.assignedTeamId! } },
        });
        return !!membership;
      })
    : false;

  const onlyUpdatingProgress = Object.keys(parsed.data).every((k) => k === "currentValue");

  if (!canManage && !((isAssignedUser || isAssignedTeamMember) && onlyUpdatingProgress)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  if (parsed.data.parentGoalId === params.id) {
    return NextResponse.json({ error: "Uma meta não pode ser subMeta dela mesma" }, { status: 422 });
  }

  const data: any = { ...parsed.data };
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;

  const updated = await prisma.goal.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const goal = await prisma.goal.findUnique({ where: { id: params.id }, include: { project: true } });
  if (!goal) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageGoal(userId, role, goal);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.goal.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
