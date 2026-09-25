import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { computeGoalFraction } from "@/lib/goals";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const goals = await prisma.goal.findMany({
    where: { projectId: params.id },
    include: {
      assignedUsers: { select: { id: true, name: true, avatarColor: true } },
      assignedTeam: { select: { id: true, name: true } },
      parentGoal: { select: { id: true, title: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const withFraction = await Promise.all(goals.map(async (g) => ({ ...g, fraction: await computeGoalFraction(g.id) })));

  return NextResponse.json(withFraction);
}

const createGoalSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  targetValue: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assignedUserIds: z.array(z.string()).optional(),
  assignedTeamId: z.string().nullable().optional(),
  parentGoalId: z.string().nullable().optional(),
  contributionValue: z.number().nullable().optional(),
  autoFromProjectProgress: z.boolean().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageTeam(userId, role, project.teamId);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { assignedUserIds, ...rest } = parsed.data;
  const goal = await prisma.goal.create({
    data: {
      ...rest,
      projectId: params.id,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assignedUsers: assignedUserIds?.length ? { connect: assignedUserIds.map((id) => ({ id })) } : undefined,
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
