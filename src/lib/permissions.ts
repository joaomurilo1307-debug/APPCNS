import { prisma } from "@/lib/prisma";

export async function getUserTeamIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

/** IDs de pessoas que pertencem a núcleos gerenciados/visualizados por este usuário (relação Nucleo.gerentes). */
async function nucleoManagedUserIds(userId: string): Promise<string[]> {
  const nucleos = await prisma.nucleo.findMany({
    where: { gerentes: { some: { id: userId } } },
    select: { membros: { select: { id: true } } },
  });
  return nucleos.flatMap((n) => n.membros.map((m) => m.id));
}

/**
 * Regra de governança de visibilidade (independente do `role` de permissão):
 * - ADMIN/DIRETOR: veem tudo.
 * - Nível hierárquico GERENCIA: vê tudo (todos os setores/núcleos e projetos), igual DIRETOR.
 * - Gerente/visualizador de núcleo (Nucleo.gerentes): vê também as equipes/projetos que
 *   incluem pessoas dos núcleos que ele gerencia, além das equipes das quais participa.
 * - Demais (ex.: coordenador): só as equipes das quais participa (comportamento padrão).
 * Retorna um filtro Prisma pronto para o campo `teamId` de Project (usar direto em
 * `Project.findMany({ where })`) ou, para outros modelos, envolver em `{ project: <isto> }`.
 */
export async function visibleProjectWhere(userId: string, role: string): Promise<any> {
  if (role === "ADMIN" || role === "DIRETOR") return {};

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nivelHierarquico: true } });
  if (user?.nivelHierarquico === "GERENCIA") return {};

  const teamIds = await getUserTeamIds(userId);
  const nucleoUserIds = await nucleoManagedUserIds(userId);

  if (nucleoUserIds.length === 0) return { teamId: { in: teamIds } };

  return {
    OR: [{ teamId: { in: teamIds } }, { team: { members: { some: { userId: { in: nucleoUserIds } } } } }],
  };
}

/** Mesma regra de `visibleProjectWhere`, mas retorna um filtro para o modelo Team diretamente. */
export async function visibleTeamWhere(userId: string, role: string): Promise<any> {
  if (role === "ADMIN" || role === "DIRETOR") return {};

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { nivelHierarquico: true } });
  if (user?.nivelHierarquico === "GERENCIA") return {};

  const teamIds = await getUserTeamIds(userId);
  const nucleoUserIds = await nucleoManagedUserIds(userId);

  if (nucleoUserIds.length === 0) return { id: { in: teamIds } };

  return {
    OR: [{ id: { in: teamIds } }, { members: { some: { userId: { in: nucleoUserIds } } } }],
  };
}

export async function isTeamManager(userId: string, teamId: string): Promise<boolean> {
  const membership = await prisma.userTeam.findUnique({
    where: { userId_teamId: { userId, teamId } },
  });
  return membership?.role === "GESTOR";
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
