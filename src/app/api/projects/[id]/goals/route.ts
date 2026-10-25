import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, canViewProject } from "@/lib/permissions";
import { computeGoalFraction } from "@/lib/goals";
import { z } from "zod";
import { apresentarMetas, contextoMetas, incluirMetaContrato } from "@/lib/contractGoals/server";
import { vincularMetasProjeto } from "@/lib/contractGoals/vinculos";
import { negarSemEdicao } from "@/lib/acesso/servidor";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await canViewProject((session.user as any).id, (session.user as any).role, params.id))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const goals = await prisma.goal.findMany({
    where: { projectId: params.id },
    include: {
      assignedUsers: { select: { id: true, name: true, avatarColor: true } },
      assignedTeam: { select: { id: true, name: true } },
      parentGoal: { select: { id: true, title: true } },
      contractGoal: { include: incluirMetaContrato },
    },
    orderBy: { createdAt: "desc" },
  });

  const usuario = session.user as any;
  const canonicas = await apresentarMetas(goals.flatMap((g) => g.contractGoal ? [g.contractGoal] : []), usuario);
  const porId = new Map(canonicas.map((g) => [g.id, g]));
  const permitidas = goals.filter((g) => !g.contractGoalId || porId.has(g.contractGoalId));
  const withFraction = await Promise.all(permitidas.map(async (g) => {
    const canonical = g.contractGoalId ? porId.get(g.contractGoalId) : null;
    return { ...g, ...(canonical ? { contractGoal: canonical, title: canonical.title, description: canonical.description, targetValue: canonical.targetValue, currentValue: canonical.currentValue, unit: canonical.unit, dueDate: canonical.dueDate } : {}), fraction: canonical ? canonical.fraction : await computeGoalFraction(g.id) };
  }));

  return NextResponse.json(withFraction);
}

const createGoalSchema = z.object({
  contractGoalId: z.string().optional(),
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

  if (parsed.data.contractGoalId) {
    if (["CLIENTE", "VISUALIZADOR"].includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const somenteConsulta = await negarSemEdicao({ id: userId, role }, "projetos"); if (somenteConsulta) return somenteConsulta;
    const contexto = await contextoMetas({ id: userId, role });
    if (!project.codccu || !contexto.podeVer(project.codccu)) return NextResponse.json({ error: "Sem acesso às metas do contrato" }, { status: 403 });
    try {
      await prisma.$transaction((tx) => vincularMetasProjeto(tx, project, [parsed.data.contractGoalId!]));
      return NextResponse.json({ ok: true }, { status: 201 });
    } catch { return NextResponse.json({ error: "A meta deve estar ativa e pertencer ao mesmo contrato deste projeto" }, { status: 422 }); }
  }
  if (parsed.data.parentGoalId && (await prisma.goal.findUnique({ where: { id: parsed.data.parentGoalId }, select: { contractGoalId: true } }))?.contractGoalId) return NextResponse.json({ error: "A meta canônica é vinculada pelo contrato, sem somar outra medição" }, { status: 422 });
  const { assignedUserIds, contractGoalId, ...rest } = parsed.data;
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
