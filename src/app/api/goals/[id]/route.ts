import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, isTeamManager } from "@/lib/permissions";
import { negarSemEdicao } from "@/lib/acesso/servidor";
import { computeGoalFraction, computeGoalCurrentValue, computeContractGoalForProject, computeSectorGoalForUser } from "@/lib/goals";
import { z } from "zod";
import { ErroComposicaoSetor, validarPaiLegado } from "@/lib/contractGoals/sectorGoals";

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
      assignedUsers: { select: { id: true, name: true, avatarColor: true } },
      assignedTeam: { select: { id: true, name: true } },
      subGoals: {
        include: {
          project: { select: { id: true, name: true } },
          assignedUsers: { select: { id: true, name: true, avatarColor: true } },
          assignedTeam: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!goal) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  if (goal.contractGoalId) {
    const usuario = session.user as any;
    const canonical = await computeContractGoalForProject(goal, usuario);
    if (!canonical) return NextResponse.json({ error: "Sem acesso à meta deste contrato" }, { status: 403 });
    return NextResponse.json({ ...goal, title: canonical.title, description: canonical.description, targetValue: canonical.targetValue, currentValue: canonical.currentValue, unit: canonical.unit, dueDate: canonical.dueDate, contractGoal: canonical, fraction: canonical.fraction, computedCurrentValue: canonical.currentValue });
  }

  const usuario = session.user as any;
  if (!goal.projectId && !["ADMIN", "DIRETOR"].includes(usuario.role) && !(await prisma.goal.count({ where: { id: goal.id, OR: [{ assignedUsers: { some: { id: usuario.id } } }, { assignedTeam: { members: { some: { userId: usuario.id } } } }] } }))) return NextResponse.json({ error: "Sem acesso à meta do setor" }, { status: 403 });
  const sectorSummary = !goal.projectId ? await computeSectorGoalForUser(goal.id, usuario) : null;
  const computedCurrentValue = sectorSummary ? sectorSummary.weightedFraction === null ? null : (goal.targetValue ?? 100) * sectorSummary.weightedFraction : await computeGoalCurrentValue(goal.id);
  const subGoalsWithFraction = await Promise.all(
    goal.subGoals.map(async (sg) => ({ ...sg, fraction: await computeGoalFraction(sg.id) }))
  );

  return NextResponse.json({ ...goal, computedCurrentValue, fraction: sectorSummary?.weightedFraction ?? (sectorSummary ? null : await computeGoalFraction(goal.id)), sectorSummary, subGoals: subGoalsWithFraction });
}

const updateGoalSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().nullable().optional(),
  targetValue: z.number().nullable().optional(),
  currentValue: z.number().optional(),
  unit: z.string().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  assignedUserIds: z.array(z.string()).optional(),
  assignedTeamId: z.string().nullable().optional(),
  parentGoalId: z.string().nullable().optional(),
  contributionValue: z.number().nullable().optional(),
  autoFromProjectProgress: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const goal = await prisma.goal.findUnique({
    where: { id: params.id },
    include: { project: true, assignedUsers: { select: { id: true } } },
  });
  if (!goal) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const body = await req.json();
  const parsed = updateGoalSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const canManage = await canManageGoal(userId, role, goal);
  if (goal.contractGoalId) {
    if (!(await computeContractGoalForProject(goal, session.user as any))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    return NextResponse.json({ error: "Edite a meta e as medições no contrato; o projeto acompanha a mesma fonte." }, { status: 422 });
  }
  if (parsed.data.parentGoalId && (await prisma.goal.findUnique({ where: { id: parsed.data.parentGoalId }, select: { contractGoalId: true } }))?.contractGoalId) return NextResponse.json({ error: "A meta canônica é vinculada pelo contrato, sem somar outra medição" }, { status: 422 });
  const isAssignedUser = goal.assignedUsers.some((u) => u.id === userId);
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

  const { assignedUserIds, ...rest } = parsed.data;
  const data: any = { ...rest };
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
  if (assignedUserIds !== undefined) data.assignedUsers = { set: assignedUserIds.map((id) => ({ id })) };

  try {
    const updated = await prisma.$transaction(async (tx) => {
      for (const id of [...new Set([params.id, data.parentGoalId].filter((value): value is string => typeof value === "string" && !!value))].sort()) await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "sector-goal:" + id);
      if (data.parentGoalId) await validarPaiLegado(tx, data.parentGoalId);
      const composed = await tx.contractGoal.count({ where: { parentGoalId: params.id } });
      if (composed && (data.parentGoalId || data.currentValue !== undefined || data.autoFromProjectProgress)) throw new ErroComposicaoSetor("O resultado desta meta global vem da composição ponderada. Edite as metas vinculadas, preservando sua posição global.");
      return tx.goal.update({ where: { id: params.id }, data });
    });
    return NextResponse.json(updated);
  } catch (error) {
    if (error instanceof ErroComposicaoSetor) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
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
  if (goal.contractGoalId) {
    if (!(await computeContractGoalForProject(goal, session.user as any)) || !(await canManageTeam(userId, role, goal.project!.teamId))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    const somenteConsulta = await negarSemEdicao({ id: userId, role }, "projetos"); if (somenteConsulta) return somenteConsulta;
  }

  if (goal.contractGoalId) {
    const removed = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "project-plan:" + goal.projectId);
      const current = await tx.goal.findUnique({ where: { id: params.id }, include: { project: { select: { actionPlanGoalId: true } } } });
      if (!current) return true;
      if (current.project?.actionPlanGoalId === current.contractGoalId) return false;
      await tx.goal.delete({ where: { id: params.id } });
      return true;
    });
    if (!removed) return NextResponse.json({ error: "Esta meta é o vínculo principal do plano de ação. Gerencie o plano pela meta; este vínculo não pode ser removido isoladamente." }, { status: 409 });
  } else {
    const removed = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "sector-goal:" + params.id);
      if (await tx.contractGoal.count({ where: { parentGoalId: params.id } })) return false;
      await tx.goal.delete({ where: { id: params.id } });
      return true;
    });
    if (!removed) return NextResponse.json({ error: "Esta meta global possui metas vinculadas com pesos. Desvincule essas contribuições antes de excluir a meta do setor." }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
