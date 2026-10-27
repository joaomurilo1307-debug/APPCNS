import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import type { UsuarioDaSessao } from "@/lib/acesso/servidor";

export type ContribuicaoSetor = { id: string; title?: string; codccu?: string | null; weight: number; fraction: number | null; executionFraction?: number | null };
export type ResumoSetor = {
  configuredWeight: number; evaluatedWeight: number; unevaluatedWeight: number; unconfiguredWeight: number;
  weightedFraction: number | null; knownFraction: number; contributionCount: number; hiddenCount: number;
  contributions: (ContribuicaoSetor & { weightedFraction: number | null })[];
};

export class ErroComposicaoSetor extends Error {}

/** Mantém os dois motores de composição separados, inclusive em gravações concorrentes. */
export async function validarPaiLegado(tx: Prisma.TransactionClient, parentGoalId: string | null | undefined) {
  if (!parentGoalId) return;
  await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "sector-goal:" + parentGoalId);
  const parent = await tx.goal.findUnique({ where: { id: parentGoalId }, select: { contractGoalId: true, contractContributions: { select: { id: true }, take: 1 } } });
  if (!parent) throw new ErroComposicaoSetor("Meta superior não encontrada.");
  if (parent.contractGoalId) throw new ErroComposicaoSetor("A meta do contrato é vinculada pela sua fonte canônica, sem outra composição.");
  if (parent.contractContributions.length) throw new ErroComposicaoSetor("Esta meta do setor usa pesos das metas de contrato. Vincule a meta de resultado com seu peso, sem somar uma subMeta antiga novamente.");
}

/** Um peso de 80% representa 80 pontos da meta geral; a parcela restante não é renormalizada. */
export function calcularContribuicoesSetor(contributions: readonly ContribuicaoSetor[], configured: readonly { id: string; weight: number }[] = contributions): ResumoSetor {
  const allocations = [...new Map(configured.map((c) => [c.id, c])).values()];
  const visible = new Map(contributions.map((c) => [c.id, c]));
  const total = allocations.reduce((sum, c) => sum + c.weight, 0);
  let evaluated = 0, known = 0;
  const presented = allocations.flatMap((allocation) => {
    const child = visible.get(allocation.id);
    if (!child) return [];
    const fraction = child.fraction !== null && Number.isFinite(child.fraction) ? Math.min(1, Math.max(0, child.fraction)) : null;
    if (fraction !== null) { evaluated += allocation.weight; known += allocation.weight * fraction / 100; }
    return [{ ...child, weight: allocation.weight, fraction, weightedFraction: fraction === null ? null : allocation.weight * fraction / 100 }];
  });
  const remaining = Math.max(0, total - evaluated);
  return {
    configuredWeight: total, evaluatedWeight: evaluated, unevaluatedWeight: remaining, unconfiguredWeight: Math.max(0, 100 - total),
    weightedFraction: remaining > 1e-7 ? null : Math.min(1, known), knownFraction: Math.min(1, known),
    contributionCount: allocations.length, hiddenCount: allocations.filter((c) => !visible.has(c.id)).length, contributions: presented,
  };
}

export function erroPesoSetor(parentGoalId: string | null | undefined, weight: number | null | undefined, otherWeight = 0, status = "ATIVA"): string | null {
  if (!parentGoalId) return weight !== null && weight !== undefined ? "Escolha a meta do setor antes de definir seu peso." : null;
  if (weight === null || weight === undefined || !Number.isFinite(weight) || weight <= 0 || weight > 100) return "O peso deve ser maior que zero e no máximo 100%.";
  if (status !== "ARQUIVADA" && weight + otherWeight > 100 + 1e-7) return "A soma dos pesos das metas deste setor não pode ultrapassar 100%.";
  return null;
}

/** Somente metas globais, sem vínculo a projeto ou outra meta, podem receber contribuições do contrato. */
export function filtroMetasSetor(usuario: UsuarioDaSessao): Prisma.GoalWhereInput {
  const base = { projectId: null, contractGoalId: null, parentGoalId: null, subGoals: { none: { contractGoalId: null } } };
  if (usuario.role === "CLIENTE") return { ...base, id: { in: [] } };
  if (["ADMIN", "DIRETOR"].includes(usuario.role)) return base;
  return { ...base, OR: [{ assignedUsers: { some: { id: usuario.id } } }, { assignedTeam: { members: { some: { userId: usuario.id } } } }] };
}

/** Deve ser chamado na mesma transação da criação/edição da meta filha. */
export async function validarVinculoSetor(
  tx: Prisma.TransactionClient,
  data: { id?: string; parentGoalId?: string | null; contributionWeight?: number | null; status?: string; kind?: string },
  usuario: UsuarioDaSessao,
) {
  const previous = data.id ? await tx.contractGoal.findUnique({ where: { id: data.id }, select: { parentGoalId: true, contributionWeight: true, status: true, kind: true } }) : null;
  // Clientes anteriores podem omitir os campos novos ao editar nome/situação. A omissão não remove nem ignora o vínculo atual.
  const parentGoalId = data.parentGoalId === undefined ? previous?.parentGoalId : data.parentGoalId;
  const weight = data.contributionWeight === undefined ? previous?.contributionWeight : data.contributionWeight;
  const status = data.status ?? previous?.status ?? "ATIVA";
  const error = erroPesoSetor(parentGoalId, weight, 0, status);
  if (error) throw new ErroComposicaoSetor(error);
  const parents = [...new Set([previous?.parentGoalId, parentGoalId].filter((id): id is string => !!id))].sort();
  for (const id of parents) await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "sector-goal:" + id);
  if (!parentGoalId) return;
  if ((data.kind ?? previous?.kind) === "PLANO") throw new ErroComposicaoSetor("Associe a meta de resultado ao setor; o plano acompanha a execução dessa meta.");
  const parent = await tx.goal.findFirst({ where: { AND: [{ id: parentGoalId }, filtroMetasSetor(usuario)] }, select: { id: true } });
  if (!parent) throw new ErroComposicaoSetor("Escolha uma meta global do setor autorizada e sem composição antiga de subMetas.");
  const others = await tx.contractGoal.aggregate({ where: { parentGoalId: parent.id, status: { not: "ARQUIVADA" }, ...(data.id ? { id: { not: data.id } } : {}) }, _sum: { contributionWeight: true } });
  const allocationError = erroPesoSetor(parent.id, weight, others._sum.contributionWeight ?? 0, status);
  if (allocationError) throw new ErroComposicaoSetor(allocationError);
}

export async function lerVinculoSetor(parentGoalId: string | null | undefined, weight: number | null | undefined, usuario: UsuarioDaSessao) {
  if (!parentGoalId) return null;
  const parent = await prisma.goal.findFirst({ where: { AND: [{ id: parentGoalId }, filtroMetasSetor(usuario)] }, select: { id: true, title: true } });
  return parent ? { ...parent, weight: weight ?? 0 } : null;
}

/** O vínculo não concede acesso à fonte financeira; frações indisponíveis mantêm a avaliação global pendente. */
export async function resumirMetasSetor(ids: readonly string[], usuario: UsuarioDaSessao): Promise<Map<string, ResumoSetor>> {
  const unique = [...new Set(ids)];
  if (!unique.length) return new Map();
  const { contextoMetas, apresentarMetas, incluirMetaContrato } = await import("./server");
  const context = await contextoMetas(usuario);
  const [allocations, visible] = await Promise.all([
    prisma.contractGoal.findMany({ where: { parentGoalId: { in: unique }, status: { not: "ARQUIVADA" } }, select: { id: true, parentGoalId: true, contributionWeight: true } }),
    prisma.contractGoal.findMany({ where: { AND: [{ parentGoalId: { in: unique }, status: { not: "ARQUIVADA" } }, context.filtroVisivel] }, include: incluirMetaContrato }),
  ]);
  const presented = await apresentarMetas(visible, usuario);
  const canonical = new Map(presented.map((goal) => [goal.id, goal]));
  return new Map(unique.map((id) => {
    const all = allocations.filter((c) => c.parentGoalId === id).map((c) => ({ id: c.id, weight: c.contributionWeight ?? 0 }));
    const contributions = all.flatMap((c) => {
      const child = canonical.get(c.id);
      return child ? [{ ...c, title: child.title, codccu: child.contrato?.codccu ?? null, fraction: child.fraction, executionFraction: child.executionFraction }] : [];
    });
    return [id, calcularContribuicoesSetor(contributions, all)];
  }));
}
