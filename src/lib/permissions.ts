import { prisma } from "@/lib/prisma";

export async function getUserTeamIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

export async function isTeamManager(userId: string, teamId: string): Promise<boolean> {
  const membership = await prisma.userTeam.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  return membership?.role === "GESTOR";
}

/** Admin e Diretor veem tudo (Diretor tem visão ampla de setor/diretoria, sem direitos de gestão de usuários/sistema). Gestor/Aprovador/Colaborador só veem equipes das quais participam. Cliente/Visualizador tratados à parte (escopo por projeto). */
export async function visibleTeamFilter(userId: string, role: string) {
  if (role === "ADMIN" || role === "DIRETOR") return {};
  const teamIds = await getUserTeamIds(userId);
  return { teamId: { in: teamIds } };
}

export async function canManageTeam(userId: string, role: string, teamId: string) {
  if (role === "ADMIN") return true;
  return isTeamManager(userId, teamId);
}

/** Quem pode excluir/mover uma tarefa: Admin e Gestor de Projeto sempre (se não travada); Colaborador só se não travada e for responsável; Cliente/Visualizador/Aprovador nunca. */
export function canModifyTask(role: string, isAssignee: boolean, locked: boolean) {
  if (locked) return role === "ADMIN" || role === "GESTOR_PROJETO";
  if (role === "ADMIN" || role === "GESTOR_PROJETO") return true;
  if (role === "COLABORADOR") return isAssignee;
  return false;
}

export function canDeleteTask(role: string) {
  return role === "ADMIN" || role === "GESTOR_PROJETO";
}

export function isReadOnlyRole(role: string) {
  return role === "CLIENTE" || role === "VISUALIZADOR";
}

/** Rota inicial recomendada por papel, após login. */
export function landingPathForRole(role: string) {
  switch (role) {
    case "APROVADOR":
      return "/aprovacoes";
    case "CLIENTE":
      return "/portal-cliente";
    case "VISUALIZADOR":
      return "/dashboard";
    default:
      return "/dashboard";
  }
}
