// Quais tarefas a pessoa enxerga: as dos projetos que ela enxerga (regra em permissions.ts) mais as que sao dela.
// Usado por /api/tasks (completa) e /api/tarefas/resumo (enxuta), para as duas mostrarem exatamente o mesmo conjunto.
import { visibleProjectWhere } from "@/lib/permissions";

export async function filtroDeTarefasVisiveis(userId: string, role: string) {
  if (role === "ADMIN") return {};

  if (role === "CLIENTE") {
    return { OR: [{ project: { clients: { some: { userId } } } }, { assigneeId: userId }] };
  }

  if (role === "APROVADOR") {
    const base = await visibleProjectWhere(userId, role);
    if (Object.keys(base).length === 0) return {};
    return {
      OR: [...(base.OR ?? [base]).map((clause: any) => ({ project: clause })), { project: { approverId: userId } }, { assigneeId: userId }],
    };
  }

  const base = await visibleProjectWhere(userId, role);
  if (Object.keys(base).length === 0) return {};
  return {
    OR: [...(base.OR ?? [base]).map((clause: any) => ({ project: clause })), { assigneeId: userId }],
  };
}
