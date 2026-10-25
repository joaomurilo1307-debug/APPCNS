import { prisma } from "@/lib/prisma";

export async function getUserTeamIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userTeam.findMany({
    where: { userId },
    select: { teamId: true },
  });
  return memberships.map((m) => m.teamId);
}

/** Núcleos que a pessoa gere: ela é gerente (Nucleo.gerentes), coordenadora (Nucleo.coordenadores) ou diretora (Nucleo.diretores) do núcleo. */
export function filtroNucleosQueGere(userId: string) {
  return { OR: [{ gerentes: { some: { id: userId } } }, { coordenadores: { some: { id: userId } } }, { diretores: { some: { id: userId } } }] };
}

/** IDs de pessoas que pertencem a núcleos geridos por este usuário (gerente ou coordenador). */
async function nucleoManagedUserIds(userId: string): Promise<string[]> {
  const nucleos = await prisma.nucleo.findMany({
    where: filtroNucleosQueGere(userId),
    select: { membros: { select: { id: true } } },
  });
  return nucleos.flatMap((n) => n.membros.map((m) => m.id));
}

/** Ids dos núcleos que a pessoa gere (gerente ou coordenadora). */
export async function nucleoIdsQueGere(userId: string): Promise<string[]> {
  return (await prisma.nucleo.findMany({ where: filtroNucleosQueGere(userId), select: { id: true } })).map((n) => n.id);
}

/** A pessoa gere algum núcleo ligado a este projeto? (coordenador/gerente passam tarefas e subtarefas dos projetos do núcleo) */
export async function geroNucleoDoProjeto(userId: string, projectId: string): Promise<boolean> {
  return (await prisma.project.count({ where: { id: projectId, nucleos: { some: filtroNucleosQueGere(userId) } } })) > 0;
}

/**
 * Regra de visibilidade de PROJETOS (decisao do Joao, 19/10/2026): cada pessoa -- inclusive Diretoria e Gerencia --
 * so ve o projeto que CRIOU (ownerId) ou em que PARTICIPA: e' membro da equipe do projeto, foi convidada como
 * diretor/coordenador do projeto ou recebeu convite individual (tela Usuarios > Projetos), gerencia um nucleo vinculado ao projeto, tem tarefa atribuida ou e' o aprovador.
 * So' o ADMIN (administrador do sistema) ve todos. Cliente tem regra propria (ProjectClient) nas rotas.
 * Retorna um filtro Prisma pronto para `Project.findMany({ where })` ou, para outros modelos, `{ project: <isto> }`.
 */
export async function visibleProjectWhere(userId: string, role: string): Promise<any> {
  if (role === "ADMIN") return {};

  // Visao escolhida na tela Usuarios > Acesso (22/10/2026): PROPRIOS (padrao) = regra acima; NUCLEO = tambem o que e' das pessoas dos
  // nucleos que a pessoa gere; TODOS = todos os projetos.
  const eu = await prisma.user.findUnique({ where: { id: userId }, select: { escopoProjetos: true } });
  if (eu?.escopoProjetos === "TODOS") return {};

  const base = filtroProjetosDaPessoa(userId, await getUserTeamIds(userId));
  if (eu?.escopoProjetos !== "NUCLEO") return base;
  const pessoas = await nucleoManagedUserIds(userId);
  return filtroProjetosComNucleo(base, pessoas);
}

/** PURA: acrescenta ao filtro "criei ou participo" os projetos que sao das pessoas do(s) nucleo(s) geridos. Sem pessoas = o mesmo filtro. */
export function filtroProjetosComNucleo(base: { OR: any[] }, pessoasDoNucleo: string[]) {
  const ids = Array.from(new Set(pessoasDoNucleo));
  if (ids.length === 0) return base;
  return {
    OR: [
      ...base.OR,
      { ownerId: { in: ids } },
      { tasks: { some: { assigneeId: { in: ids } } } },
      { team: { members: { some: { userId: { in: ids } } } } },
    ],
  };
}

/** PURA: o filtro "criei ou participo" (separada para teste). */
export function filtroProjetosDaPessoa(userId: string, teamIds: string[]) {
  return {
    OR: [
      { ownerId: userId },
      { teamId: { in: teamIds } },
      { diretores: { some: { id: userId } } },
      { coordenadores: { some: { id: userId } } },
      { nucleos: { some: { gerentes: { some: { id: userId } } } } },
      { nucleos: { some: { coordenadores: { some: { id: userId } } } } },
      { nucleos: { some: { diretores: { some: { id: userId } } } } },
      { tasks: { some: { assigneeId: userId } } },
      { approverId: userId },
      { acessos: { some: { userId } } },
    ],
  };
}

/** Pode ver este projeto? (mesma regra da lista, para as rotas que buscam por id) */
export async function canViewProject(userId: string, role: string, projectId: string): Promise<boolean> {
  if (role === "ADMIN") return true;
  if (role === "CLIENTE") {
    return (await prisma.project.count({ where: { id: projectId, clients: { some: { userId } } } })) > 0;
  }
  const where = await visibleProjectWhere(userId, role);
  return (await prisma.project.count({ where: { id: projectId, ...where } })) > 0;
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

/**
 * IDs de pessoas para quem `userId` pode criar/gerenciar PDI, além de ADMIN/DIRETOR (que veem todo mundo):
 * - Liderados diretos (gestorImediatoId === userId).
 * - Se `userId` é coordenador (nivelHierarquico=COORDENACAO), todo mundo do mesmo núcleo.
 * - Se `userId` é gerente/diretor de um ou mais núcleos (Nucleo.gerentes), todo mundo desses núcleos.
 */
export async function manageablePdiUserIds(userId: string): Promise<string[]> {
  const me = await prisma.user.findUnique({
    where: { id: userId },
    select: { nivelHierarquico: true, nucleoId: true },
  });

  const idSet = new Set<string>();

  const directs = await prisma.user.findMany({ where: { gestorImediatoId: userId }, select: { id: true } });
  directs.forEach((d) => idSet.add(d.id));

  if (me?.nivelHierarquico === "COORDENACAO" && me.nucleoId) {
    const membros = await prisma.user.findMany({ where: { nucleoId: me.nucleoId }, select: { id: true } });
    membros.forEach((m) => idSet.add(m.id));
  }

  const nucleosGeridos = await prisma.nucleo.findMany({
    where: { OR: [{ gerentes: { some: { id: userId } } }, { diretores: { some: { id: userId } } }] },
    select: { membros: { select: { id: true } } },
  });
  nucleosGeridos.forEach((n) => n.membros.forEach((m) => idSet.add(m.id)));

  idSet.delete(userId);
  return Array.from(idSet);
}

export async function canManagePdiFor(userId: string, role: string, targetUserId: string): Promise<boolean> {
  if (role === "ADMIN" || role === "DIRETOR") return true;
  const ids = await manageablePdiUserIds(userId);
  return ids.includes(targetUserId);
}

export async function isTeamMember(userId: string, role: string, teamId: string): Promise<boolean> {
  if (role === "ADMIN") return true;
  const membership = await prisma.userTeam.findUnique({ where: { userId_teamId: { userId, teamId } } });
  return !!membership;
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

/** Quem pode excluir/mover uma tarefa: Admin e Gestor de Projeto sempre (se não travada); Colaborador só se não travada e for responsável; Cliente/Visualizador/Aprovador nunca -- SALVO se for Gestor da equipe dona do projeto (ver canModifyTaskScoped). */
export function canModifyTask(role: string, isAssignee: boolean, locked: boolean) {
  if (locked) return role === "ADMIN" || role === "GESTOR_PROJETO";
  if (role === "ADMIN" || role === "GESTOR_PROJETO") return true;
  if (role === "COLABORADOR") return isAssignee;
  return false;
}

/**
 * Mesma regra de `canModifyTask`, mais uma exceção por equipe: quem é Gestor
 * (UserTeam.role="GESTOR") da equipe dona do projeto da tarefa também pode
 * mover/editar/atribuir -- pra gente como um Aprovador que também gerencia um
 * núcleo/equipe (ex: Claudia Moreira), sem abrir isso pra qualquer Aprovador
 * em qualquer tarefa do sistema (achado 14/09/2026: ela não conseguia trocar
 * status nem atribuir responsável em nenhuma tarefa, porque APROVADOR nunca
 * passava em `canModifyTask`, mesmo sendo gerente da equipe do projeto).
 * Tarefa travada continua só pra Admin/Gestor de Projeto, igual antes.
 */
export async function canModifyTaskScoped(
  userId: string,
  role: string,
  isAssignee: boolean,
  locked: boolean,
  teamId: string | null | undefined,
  projectId?: string | null
): Promise<boolean> {
  if (canModifyTask(role, isAssignee, locked)) return true;
  if (locked) return false;
  if (teamId && (await isTeamManager(userId, teamId))) return true;
  // coordenador/gerente de um nucleo ligado ao projeto passa tarefas e subtarefas para o pessoal do nucleo (22/10/2026)
  if (projectId && (await geroNucleoDoProjeto(userId, projectId))) return true;
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
  return role === "CLIENTE" ? "/portal-cliente" : "/inicio";
}
