import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { podeAcessarModulo, podeEditarModulo, type UsuarioDaSessao } from "@/lib/acesso/servidor";
import { canManageTeam, canModifyTaskScoped, visibleProjectWhere } from "@/lib/permissions";
import { lerAcompanhamentoMetas } from "./acompanhamento";
import { podeAlterarMeta } from "./calculo";
import { estadoEfetivoDaAprovacao, execucaoDoPlano, selecionarProjetoParaAprovacao } from "./planApproval";
import { lerVinculoSetor } from "./sectorGoals";
import { dataDoItem, lerDetalhesDoPlano } from "./planDetails";
import type { Prisma } from "@prisma/client";

export const incluirMetaContrato = {
  contrato: { select: { id: true, codccu: true, nome: true } },
  owner: { select: { id: true, name: true } },
  planApprover: { select: { id: true, name: true } },
  measurements: { orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }], include: { createdBy: { select: { id: true, name: true } } } },
  actions: { orderBy: { createdAt: "asc" }, include: { owner: { select: { id: true, name: true } }, task: { select: { id: true } } } },
  projectGoals: { select: { id: true, projectId: true } },
  actionPlan: { select: selecionarProjetoParaAprovacao },
} satisfies Prisma.ContractGoalInclude;
export type MetaCompleta = Prisma.ContractGoalGetPayload<{ include: typeof incluirMetaContrato }>;

export async function contextoMetas(usuario: UsuarioDaSessao) {
  const [escopo, leitura, escrita, projetos, aprovacoes] = await Promise.all([
    escopoDeCustos(prisma, usuario, "PROJETOS"), podeAcessarModulo(usuario, "metas"),
    podeEditarModulo(usuario, "metas"), visibleProjectWhere(usuario.id, usuario.role), podeAcessarModulo(usuario, "aprovacoes_projetos"),
  ]);
  const podeCriar = escrita && !["CLIENTE", "VISUALIZADOR"].includes(usuario.role);
  const podeVer = (codccu: string) => leitura && usuario.role !== "CLIENTE" && podeVerCcu(escopo, codccu);
  const filtroVisivel: Prisma.ContractGoalWhereInput = usuario.role === "CLIENTE" ? { id: { in: [] } } : !leitura ? aprovacoes ? { planApproverId: usuario.id } : { id: { in: [] } } : usuario.role === "ADMIN" ? {} : {
    OR: [
      { creatorId: usuario.id }, { ownerId: usuario.id },
      { actions: { some: { ownerId: usuario.id, migratedAt: null } } },
      { planApproverId: usuario.id },
      { projectGoals: { some: { project: projetos } } }, { actionPlan: projetos },
      ...(escopo.todos ? [{ contratoId: { not: null } }] : [{ contrato: { codccu: { in: [...escopo.ccus] } } }]),
    ],
  };
  return {
    podeVer, filtroVisivel, podeCriar, escrita: podeCriar,
    podeGerir: (codccu: string, ownerId?: string | null) => podeAlterarMeta({ ...usuario, userId: usuario.id, ownerId, hasModuleWrite: escrita, hasCcu: podeVerCcu(escopo, codccu) }),
    async podeVerMeta(meta: { id: string }) {
      return !!(await prisma.contractGoal.count({ where: { AND: [{ id: meta.id }, filtroVisivel] } }));
    },
    podeGerirMeta(meta: { creatorId?: string | null; ownerId?: string | null; contrato?: { codccu: string } | null }) {
      if (!podeCriar) return false;
      if (usuario.role === "ADMIN" || meta.creatorId === usuario.id || meta.ownerId === usuario.id) return true;
      return !!meta.contrato && podeAlterarMeta({ ...usuario, userId: usuario.id, ownerId: meta.ownerId, hasModuleWrite: escrita, hasCcu: podeVerCcu(escopo, meta.contrato.codccu) });
    },
  };
}

/** A associação de uma meta/projeto não concede permissão para consultar sua fonte financeira. */
export async function erroFontePermitida(meta: { source: string; sourceCcu?: string | null }, codccu: string | null, usuario: UsuarioDaSessao) {
  if (meta.source === "MANUAL") return null;
  const ccu = meta.sourceCcu || codccu;
  if (!ccu) return "Selecione o centro de custo da fonte automática.";
  const [modulo, escopo] = await Promise.all([podeAcessarModulo(usuario, meta.source === "CUSTO" ? "custos" : "medicao"), escopoDeCustos(prisma, usuario, "FINANCEIRO")]);
  return modulo && podeVerCcu(escopo, ccu) ? null : "Seu acesso financeiro não permite selecionar esta fonte.";
}

export const statusAcaoDaTarefa = (status: string) => ({ A_FAZER: "A_FAZER", FAZENDO: "EM_ANDAMENTO", BLOQUEADO: "BLOQUEADA", FEITO: "CONCLUIDA" }[status] ?? "A_FAZER");
export const statusTarefaDaAcao = (status: string) => ({ A_FAZER: "A_FAZER", EM_ANDAMENTO: "FAZENDO", BLOQUEADA: "BLOQUEADO", CONCLUIDA: "FEITO" }[status] ?? null);

/** O plano existe antes de sua execução opcional em Projetos; ações anteriores continuam reconhecidas. */
export function temPlanoDeAcao(meta: { planCreatedAt?: Date | null; kind?: string; actionPlan?: unknown; actions?: readonly { migratedAt?: Date | null }[] }): boolean {
  return !!meta.planCreatedAt || meta.kind === "PLANO" || !!meta.actionPlan || !!meta.actions?.some((action) => !action.migratedAt);
}

export async function apresentarMetas(metas: MetaCompleta[], usuario: UsuarioDaSessao) {
  if (!metas.length) return [];
  const contexto = await contextoMetas(usuario);
  const ids = metas.map((meta) => meta.id);
  const permitidasIds = new Set((await prisma.contractGoal.findMany({ where: { AND: [{ id: { in: ids } }, contexto.filtroVisivel] }, select: { id: true } })).map((meta) => meta.id));
  const permitidas = metas.filter((meta) => permitidasIds.has(meta.id));
  if (!permitidas.length) return [];
  const projectIds = [...new Set(permitidas.flatMap((meta) => [...meta.projectGoals.flatMap((goal) => goal.projectId ? [goal.projectId] : []), ...(meta.actionPlan ? [meta.actionPlan.id] : [])]))];
  const [acompanhamentos, projetos, editaTarefas, editaProjetos, escopoFinanceiro, acessoCustos, acessoMedicao, editaAprovacoes] = await Promise.all([
    lerAcompanhamentoMetas(permitidas, usuario),
    projectIds.length ? prisma.project.findMany({ where: { AND: [{ id: { in: projectIds } }, await visibleProjectWhere(usuario.id, usuario.role)] }, select: { id: true, name: true } }) : Promise.resolve([]),
    podeEditarModulo(usuario, "tarefas"), podeEditarModulo(usuario, "projetos"),
    escopoDeCustos(prisma, usuario, "FINANCEIRO"), podeAcessarModulo(usuario, "custos"), podeAcessarModulo(usuario, "medicao"),
    podeEditarModulo(usuario, "aprovacoes_projetos"),
  ]);
  const visiveis = new Map(projetos.map((projeto) => [projeto.id, projeto]));
  return Promise.all(permitidas.map(async (meta) => {
    const acompanhamento = acompanhamentos.get(meta.id)!;
    const ccuFonte = meta.sourceCcu || meta.contrato?.codccu;
    const fontePermitida = meta.source === "MANUAL" || !!ccuFonte && podeVerCcu(escopoFinanceiro, ccuFonte) && (meta.source === "CUSTO" ? acessoCustos : acessoMedicao);
    const evaluation = fontePermitida ? acompanhamento : { ...acompanhamento, currentValue: null, baselineValue: null, targetValue: null, fraction: null, sourceUpdatedAt: null, sourceError: "Seu acesso financeiro não permite consultar este indicador.", periods: acompanhamento.periods.map((period) => ({ ...period, value: null, target: null, progress: null, changePercent: null, updatedAt: null, error: "Seu acesso financeiro não permite consultar este indicador." })) };
    const { projectGoals, actionPlan, actions: legadas, ...resto } = meta;
    const podeGerir = contexto.podeGerirMeta(meta);
    const hasPlan = temPlanoDeAcao(meta);
    const execution = execucaoDoPlano(meta);
    const effectivePlanApprovalStatus = estadoEfetivoDaAprovacao(meta);
    const planoVisivel = actionPlan && visiveis.has(actionPlan.id) ? actionPlan : null;
    const gerePlano = !!planoVisivel && editaProjetos && contexto.escrita && await canManageTeam(usuario.id, usuario.role, planoVisivel.teamId);
    const planoParaRevisao = planoVisivel ?? (meta.planApproverId === usuario.id ? actionPlan : null);
    const tarefas = planoParaRevisao ? await Promise.all(planoParaRevisao.tasks.map(async (task) => ({
      id: task.id, taskId: task.id, projectId: planoParaRevisao.id, title: task.title, description: task.description,
      planDetails: lerDetalhesDoPlano(legadas.find((action) => action.id === task.sourceGoalActionId)?.planDetails),
      startDate: task.startDate, actualEndedAt: task.actualEndedAt,
      ownerId: task.assigneeId, owner: task.assignee, dueDate: task.dueDate, status: statusAcaoDaTarefa(task.status),
      canUpdate: !!planoVisivel && editaTarefas && contexto.escrita && await canModifyTaskScoped(usuario.id, usuario.role, task.assigneeId === usuario.id, task.locked, planoVisivel.teamId, planoVisivel.id),
    }))) : [];
    const actions = [
      ...legadas.filter((action) => !action.task && !action.migratedAt).map(({ task, ...action }) => ({ ...action, planDetails: lerDetalhesDoPlano(action.planDetails), startDate: dataDoItem(lerDetalhesDoPlano(action.planDetails)?.plannedStart), actualEndedAt: dataDoItem(lerDetalhesDoPlano(action.planDetails)?.actualCompletion), taskId: null, projectId: null, canUpdate: podeGerir || contexto.escrita && action.ownerId === usuario.id })),
      ...tarefas,
    ];
    return {
      ...resto, baselineValue: evaluation.baselineValue, targetValue: evaluation.targetValue, targetChange: fontePermitida ? meta.targetChange : null, tolerance: fontePermitida ? meta.tolerance : null,
      measurements: fontePermitida ? resto.measurements : [],
      currentValue: evaluation.currentValue, fraction: evaluation.fraction, evaluation,
      executionFraction: actionPlan && !planoParaRevisao ? null : execution.fraction,
      canManage: podeGerir,
      hasPlan,
      standalonePlan: hasPlan ? { name: meta.planTitle || meta.title, description: meta.planDescription ?? meta.description, createdAt: meta.planCreatedAt ?? meta.createdAt } : null,
      effectivePlanApprovalStatus,
      canSubmitPlan: hasPlan && podeGerir && execution.fraction === 1 && !["PENDENTE", "APROVADO"].includes(effectivePlanApprovalStatus),
      canApprovePlan: meta.planApproverId === usuario.id && !["CLIENTE", "VISUALIZADOR"].includes(usuario.role) && (contexto.escrita || editaAprovacoes) && execution.fraction === 1 && effectivePlanApprovalStatus === "PENDENTE",
      canRejectPlan: meta.planApproverId === usuario.id && !["CLIENTE", "VISUALIZADOR"].includes(usuario.role) && (contexto.escrita || editaAprovacoes) && meta.planApprovalStatus === "PENDENTE",
      sectorGoal: await lerVinculoSetor(meta.parentGoalId, meta.contributionWeight, usuario),
      canCreatePlan: podeGerir && contexto.escrita && !hasPlan,
      canConvertPlan: podeGerir && hasPlan && editaProjetos && contexto.escrita && !actionPlan,
      canAddAction: planoVisivel ? podeGerir && gerePlano && editaTarefas : !actionPlan && hasPlan && podeGerir,
      canRecord: meta.kind === "INDICADOR" && meta.source === "MANUAL" && podeGerir,
      sourceUpdatedAt: evaluation.sourceUpdatedAt, sourceError: evaluation.sourceError,
      actions,
      actionPlan: planoVisivel ? { id: planoVisivel.id, name: planoVisivel.name, canManage: gerePlano, taskCount: planoVisivel.tasks.length, completedCount: planoVisivel.tasks.filter((task) => task.status === "FEITO").length } : null,
      projects: projectGoals.flatMap((goal) => goal.projectId && visiveis.has(goal.projectId) ? [{ goalId: goal.id, ...visiveis.get(goal.projectId)! }] : []),
    };
  }));
}

