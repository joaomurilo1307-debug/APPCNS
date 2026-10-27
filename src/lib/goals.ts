import { prisma } from "@/lib/prisma";
import { computePercentComplete } from "@/lib/progress";
import { canViewProject } from "@/lib/permissions";
import { apresentarMetas, incluirMetaContrato } from "@/lib/contractGoals/server";
import type { UsuarioDaSessao } from "@/lib/acesso/servidor";
import { filtroMetasSetor, resumirMetasSetor } from "@/lib/contractGoals/sectorGoals";

/** A meta global recebe uma única contribuição por meta canônica, independente de quantos projetos a referenciam. */
export async function computeSectorGoalForUser(goalId: string, usuario: UsuarioDaSessao) {
  const eligible = await prisma.goal.findFirst({ where: { AND: [{ id: goalId }, filtroMetasSetor(usuario)] }, select: { id: true } });
  if (!eligible) return null;
  const summary = (await resumirMetasSetor([goalId], usuario)).get(goalId);
  return summary && summary.contributionCount > 0 ? summary : null;
}

/** Metas vinculadas sao lidas da fonte canonica, com acesso ao projeto E ao contrato. Nao entram no roll-up legado. */
export async function computeContractGoalForProject(goal: { projectId: string | null; contractGoalId: string | null }, usuario: UsuarioDaSessao) {
  if (!goal.projectId || !goal.contractGoalId || !(await canViewProject(usuario.id, usuario.role, goal.projectId))) return null;
  const meta = await prisma.contractGoal.findUnique({ where: { id: goal.contractGoalId }, include: incluirMetaContrato });
  if (!meta) return null;
  const [permitida] = await apresentarMetas([meta], usuario);
  return permitida ?? null;
}

/** Fração (0-1) de conclusão de uma meta, considerando progresso automático do projeto ou subMetas. */
export async function computeGoalFraction(goalId: string): Promise<number> {
  const goal = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!goal) return 0;

  if (goal.autoFromProjectProgress && goal.projectId) {
    const tasks = await prisma.task.findMany({ where: { projectId: goal.projectId }, select: { status: true } });
    return computePercentComplete(tasks) / 100;
  }

  const subGoals = await prisma.goal.findMany({ where: { parentGoalId: goalId } });
  if (subGoals.length > 0) {
    const rolledUp = await computeGoalCurrentValue(goalId, subGoals);
    return goal.targetValue ? Math.min(1, rolledUp / goal.targetValue) : rolledUp > 0 ? 1 : 0;
  }

  return goal.targetValue ? Math.min(1, goal.currentValue / goal.targetValue) : 0;
}

/** Valor atual (currentValue) de uma meta que tem subMetas, somando a contribuição de cada uma. */
export async function computeGoalCurrentValue(
  goalId: string,
  preloadedSubGoals?: { id: string }[]
): Promise<number> {
  const subGoals = preloadedSubGoals ?? (await prisma.goal.findMany({ where: { parentGoalId: goalId } }));
  if (subGoals.length === 0) {
    const goal = await prisma.goal.findUnique({ where: { id: goalId } });
    return goal?.currentValue ?? 0;
  }

  let total = 0;
  for (const sg of subGoals) {
    const fraction = await computeGoalFraction(sg.id);
    const full = await prisma.goal.findUnique({ where: { id: sg.id } });
    const contribution = full?.contributionValue ?? full?.targetValue ?? 1;
    total += fraction * contribution;
  }
  return total;
}
