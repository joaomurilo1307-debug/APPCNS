import type { Prisma } from "@prisma/client";
import { validarVinculosMetas } from "./calculo";

export async function vincularMetasProjeto(tx: Prisma.TransactionClient, projeto: { id: string; codccu: string | null }, ids: string[]) {
  if (!ids.length) return;
  const metas = await tx.contractGoal.findMany({ where: { id: { in: ids } }, include: { contrato: { select: { codccu: true, acompanharResultados: true } } } });
  if (metas.some((meta) => !meta.contrato.acompanharResultados)) throw new Error("O contrato está fora do acompanhamento para novas associações.");
  const unicos = validarVinculosMetas(ids, metas.map((m) => ({ ...m, codccu: m.contrato.codccu })), projeto.codccu);
  for (const id of unicos) {
    const meta = metas.find((m) => m.id === id)!;
    await tx.goal.upsert({
      where: { projectId_contractGoalId: { projectId: projeto.id, contractGoalId: id } },
      create: { projectId: projeto.id, contractGoalId: id, title: meta.title, targetValue: meta.targetValue, unit: meta.unit, dueDate: meta.dueDate },
      update: {},
    });
  }
}
