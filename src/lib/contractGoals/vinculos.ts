import type { Prisma } from "@prisma/client";

export async function vincularMetasProjeto(tx: Prisma.TransactionClient, projeto: { id: string; codccu: string | null }, ids: string[]) {
  if (!ids.length) return;
  const metas = await tx.contractGoal.findMany({ where: { id: { in: ids } }, include: { contrato: { select: { codccu: true, acompanharResultados: true } } } });
  if (metas.some((meta) => meta.contrato && !meta.contrato.acompanharResultados)) throw new Error("O contrato está fora do acompanhamento para novas associações.");
  const unicos = [...new Set(ids)];
  if (unicos.some((id) => !metas.some((meta) => meta.id === id && meta.status === "ATIVA" && (!projeto.codccu || !meta.contrato || meta.contrato.codccu === projeto.codccu)))) throw new Error("Selecione metas ativas compatíveis com o contexto do projeto.");
  for (const id of unicos) {
    const meta = metas.find((m) => m.id === id)!;
    await tx.goal.upsert({
      where: { projectId_contractGoalId: { projectId: projeto.id, contractGoalId: id } },
      create: { projectId: projeto.id, contractGoalId: id, title: meta.title, targetValue: meta.targetValue, unit: meta.unit, dueDate: meta.dueDate },
      update: {},
    });
  }
}
