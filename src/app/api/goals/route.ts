import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { computeGoalFraction, computeGoalCurrentValue } from "@/lib/goals";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const goals = await prisma.goal.findMany({
    where: { parentGoalId: null },
    include: {
      project: { select: { id: true, name: true } },
      assignedUsers: { select: { id: true, name: true, avatarColor: true } },
      assignedTeam: { select: { id: true, name: true } },
      subGoals: {
        include: {
          project: { select: { id: true, name: true } },
          assignedUsers: { select: { id: true, name: true, avatarColor: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const withComputed = await Promise.all(
    goals.map(async (g) => ({
      ...g,
      computedCurrentValue: await computeGoalCurrentValue(g.id),
      subGoals: await Promise.all(g.subGoals.map(async (sg) => ({ ...sg, fraction: await computeGoalFraction(sg.id) }))),
    }))
  );

  return NextResponse.json(withComputed);
}

const createGoalSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  targetValue: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assignedUserIds: z.array(z.string()).optional(),
  assignedTeamId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "DIRETOR") {
    return NextResponse.json({ error: "Só Admin ou Diretor podem criar metas gerais" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createGoalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { assignedUserIds, ...rest } = parsed.data;
  const goal = await prisma.goal.create({
    data: {
      ...rest,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      assignedUsers: assignedUserIds?.length ? { connect: assignedUserIds.map((id) => ({ id })) } : undefined,
    },
  });

  return NextResponse.json(goal, { status: 201 });
}
