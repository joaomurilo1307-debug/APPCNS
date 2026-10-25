import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { podeAcessarModulo, podeEditarModulo, type UsuarioDaSessao } from "@/lib/acesso/servidor";
import { visibleProjectWhere } from "@/lib/permissions";
import { lerIndicadoresFinanceiros } from "./financial";
import { podeAlterarMeta, progressoIndicador } from "./calculo";
import type { Prisma } from "@prisma/client";

export const incluirMetaContrato = {
  contrato: { select: { id: true, codccu: true, nome: true } },
  owner: { select: { id: true, name: true } },
  measurements: { orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }], take: 1, include: { createdBy: { select: { id: true, name: true } } } },
  actions: { orderBy: { createdAt: "asc" }, include: { owner: { select: { id: true, name: true } } } },
  projectGoals: { select: { id: true, projectId: true } },
} satisfies Prisma.ContractGoalInclude;
export type MetaCompleta = Prisma.ContractGoalGetPayload<{ include: typeof incluirMetaContrato }>;

export async function contextoMetas(usuario: UsuarioDaSessao) {
  const [escopo, leitura, escrita] = await Promise.all([escopoDeCustos(prisma, usuario, "PROJETOS"), podeAcessarModulo(usuario, "metas"), podeEditarModulo(usuario, "metas")]);
  return {
    podeVer: (codccu: string) => leitura && usuario.role !== "CLIENTE" && podeVerCcu(escopo, codccu),
    podeGerir: (codccu: string, ownerId?: string | null) => podeAlterarMeta({ ...usuario, userId: usuario.id, ownerId, hasModuleWrite: escrita, hasCcu: podeVerCcu(escopo, codccu) }),
    escrita: escrita && !["CLIENTE", "VISUALIZADOR"].includes(usuario.role),
  };
}

export async function apresentarMetas(metas: MetaCompleta[], usuario: UsuarioDaSessao) {
  if (!metas.length) return [];
  const contexto = await contextoMetas(usuario);
  const permitidas = metas.filter((meta) => contexto.podeVer(meta.contrato.codccu));
  if (!permitidas.length) return [];
  const projectIds = [...new Set(permitidas.flatMap((meta) => meta.projectGoals.flatMap((goal) => goal.projectId ? [goal.projectId] : [])))];
  const [automaticos, projetos] = await Promise.all([
    lerIndicadoresFinanceiros(permitidas, usuario),
    projectIds.length ? prisma.project.findMany({ where: { AND: [{ id: { in: projectIds } }, await visibleProjectWhere(usuario.id, usuario.role)] }, select: { id: true, name: true } }) : Promise.resolve([]),
  ]);
  const visiveis = new Map(projetos.map((projeto) => [projeto.id, projeto]));
  return permitidas.map((meta) => {
    const leitura = automaticos.get(meta.id);
    const valor = meta.kind === "PLANO" ? null : meta.source === "MANUAL" ? meta.measurements[0]?.value ?? null : leitura?.valor ?? null;
    const { projectGoals, ...resto } = meta;
    return {
      ...resto,
      currentValue: valor,
      fraction: meta.kind === "PLANO" ? null : progressoIndicador(meta.baselineValue, meta.targetValue, valor, meta.direction),
      executionFraction: meta.actions.length ? meta.actions.filter((a) => a.status === "CONCLUIDA").length / meta.actions.length : null,
      canManage: contexto.podeGerir(meta.contrato.codccu, meta.ownerId),
      canRecord: meta.kind === "INDICADOR" && meta.source === "MANUAL" && contexto.podeGerir(meta.contrato.codccu, meta.ownerId),
      sourceUpdatedAt: meta.source === "MANUAL" ? meta.measurements[0]?.measuredAt ?? null : leitura?.atualizadoEm ?? null,
      sourceError: meta.source === "MANUAL" ? null : leitura?.erro ?? (valor === null ? "Fonte indisponível para este indicador ou acesso." : null),
      actions: meta.actions.map((action) => ({ ...action, canUpdate: contexto.podeGerir(meta.contrato.codccu, meta.ownerId) || (contexto.escrita && action.ownerId === usuario.id) })),
      projects: projectGoals.flatMap((goal) => goal.projectId && visiveis.has(goal.projectId) ? [{ goalId: goal.id, ...visiveis.get(goal.projectId)! }] : []),
    };
  });
}
