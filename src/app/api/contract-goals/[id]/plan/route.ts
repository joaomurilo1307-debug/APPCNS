import { NextResponse } from "next/server";
import { dataDoItem, lerDetalhesDoPlano } from "@/lib/contractGoals/planDetails";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/acesso/servidor";
import { canManageTeam, canViewProject, visibleProjectWhere } from "@/lib/permissions";
import { nomeLivreDeEquipe, pessoasValidas } from "@/lib/pessoas";
import { contextoMetas, incluirMetaContrato, statusTarefaDaAcao } from "@/lib/contractGoals/server";
import { vincularMetasProjeto } from "@/lib/contractGoals/vinculos";
import { z } from "zod";

const bodySchema = z.object({
  mode: z.enum(["prepare", "create", "link"]), name: z.string().trim().min(2).max(150).optional(),
  description: z.string().max(4000).nullable().optional(),
  projectId: z.string().min(1).optional(), peopleIds: z.array(z.string()).max(60).default([]),
  dueDate: z.string().datetime().nullable().optional(),
});

async function acesso(id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const usuario = session.user as any;
  const contexto = await contextoMetas(usuario);
  const meta = await prisma.contractGoal.findUnique({ where: { id }, include: incluirMetaContrato });
  if (!meta || !(await contexto.podeVerMeta(meta))) return { error: NextResponse.json({ error: "Meta não encontrada ou sem acesso" }, { status: 404 }) };
  if (!contexto.podeGerirMeta(meta)) return { error: NextResponse.json({ error: "Você precisa gerenciar a meta para organizar seu plano de ação." }, { status: 403 }) };
  return { usuario, meta, contexto };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const { usuario, meta } = ctx;
  if (!(await podeEditarModulo(usuario, "projetos"))) return NextResponse.json({ projects: [], actionPlanId: null, canConvert: false });
  const projects = await prisma.project.findMany({
    where: { AND: [await visibleProjectWhere(usuario.id, usuario.role), { actionPlanGoalId: null }, ...(meta.contrato ? [{ OR: [{ codccu: null }, { codccu: meta.contrato.codccu }] }] : [])] },
    select: { id: true, name: true, teamId: true }, orderBy: { name: "asc" },
  });
  const gerenciaveis = [];
  for (const project of projects) if (await canManageTeam(usuario.id, usuario.role, project.teamId)) gerenciaveis.push({ id: project.id, name: project.name });
  return NextResponse.json({ projects: gerenciaveis, actionPlanId: meta.actionPlan && await canViewProject(usuario.id, usuario.role, meta.actionPlan.id) ? meta.actionPlan.id : null, canConvert: true });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os dados do plano de ação." }, { status: 422 });
  const { usuario, meta } = ctx, body = parsed.data;
  if (meta.status !== "ATIVA") return NextResponse.json({ error: "Ative a meta antes de criar ou associar um plano." }, { status: 422 });
  if (meta.contrato && !(await prisma.contrato.findUnique({ where: { id: meta.contrato.id }, select: { acompanharResultados: true } }))?.acompanharResultados) return NextResponse.json({ error: "O contrato está fora do acompanhamento para novas iniciativas." }, { status: 422 });
  if (body.mode === "prepare") {
    try {
      const plan = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-plan:" + meta.id);
        const atual = await tx.contractGoal.findUniqueOrThrow({ where: { id: meta.id } });
        if (atual.status !== "ATIVA") throw new Error("Ative a meta antes de organizar o plano.");
        if (atual.planCreatedAt) return atual;
        const created = await tx.contractGoal.update({ where: { id: meta.id }, data: {
          planTitle: body.name ?? atual.planTitle ?? atual.title.slice(0, 150),
          planDescription: body.description !== undefined ? body.description : atual.planDescription ?? atual.description,
          planCreatedAt: new Date(),
        } });
        await tx.auditLog.create({ data: { userId: usuario.id, action: "META_PLANO_PREPARADO", entityType: "ContractGoal", entityId: meta.id, metadata: JSON.stringify({ projectId: null, title: created.planTitle }) } });
        return created;
      });
      return NextResponse.json({ goalId: plan.id, projectId: null, hasPlan: true, standalonePlan: { name: plan.planTitle, description: plan.planDescription, createdAt: plan.planCreatedAt } });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error && !("code" in error) ? error.message : "Não foi possível preparar o plano." }, { status: 409 });
    }
  }
  if (!(await podeEditarModulo(usuario, "projetos"))) return NextResponse.json({ error: "O plano pode ser acompanhado aqui. Para transformá-lo em projeto, é necessário editar Projetos." }, { status: 403 });
  if (body.mode === "link" && !body.projectId) return NextResponse.json({ error: "Escolha o projeto que executará o plano." }, { status: 422 });
  const people = [...new Set(body.peopleIds)];
  if ((await pessoasValidas(people)).length !== people.length) return NextResponse.json({ error: "Escolha somente pessoas ativas válidas." }, { status: 422 });
  let existente = body.mode === "link" ? await prisma.project.findUnique({ where: { id: body.projectId }, include: { team: { select: { members: { select: { userId: true } } } } } }) : null;
  if (body.mode === "link") {
    if (!existente || !(await canViewProject(usuario.id, usuario.role, existente.id)) || !(await canManageTeam(usuario.id, usuario.role, existente.teamId))) return NextResponse.json({ error: "Você não pode gerenciar o projeto escolhido." }, { status: 403 });
    if (existente.actionPlanGoalId && existente.actionPlanGoalId !== meta.id) return NextResponse.json({ error: "Este projeto já é plano principal de outra meta. Use o vínculo adicional de metas." }, { status: 409 });
    if (meta.contrato && existente.codccu && existente.codccu !== meta.contrato.codccu) return NextResponse.json({ error: "O projeto pertence a outro contexto de contrato." }, { status: 422 });
    for (const action of meta.actions.filter((a) => a.status !== "CANCELADA" && a.ownerId && !a.task && !a.migratedAt)) {
      if (!(await canViewProject(action.ownerId!, "COLABORADOR", existente.id))) return NextResponse.json({ error: "Inclua os responsáveis das ações na equipe do projeto antes de associar o plano. O vínculo não concede acesso automaticamente." }, { status: 422 });
    }
  }
  try {
    const project = await prisma.$transaction(async (tx) => {
      // Bloqueio por meta + restrição unique tornam o comando seguro em cliques/requisições concorrentes.
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-plan:" + meta.id);
      const atual = await tx.contractGoal.findUniqueOrThrow({ where: { id: meta.id }, include: { actionPlan: true, actions: { include: { task: { select: { id: true } } } } } });
      if (atual.actionPlan) {
        if (body.mode === "link" && atual.actionPlan.id !== body.projectId) throw new Error("A meta já possui um plano principal. Abra o projeto associado.");
        return atual.actionPlan;
      }
      if (atual.status !== "ATIVA") throw new Error("Ative a meta antes de associar um plano.");
      let project;
      if (existente) {
        // Metas diferentes podem disputar o mesmo projeto; o lock da meta, sozinho, não protege esse vínculo.
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "project-plan:" + existente.id);
        const livre = await tx.project.findUniqueOrThrow({ where: { id: existente.id } });
        if (livre.actionPlanGoalId && livre.actionPlanGoalId !== meta.id) throw new Error("O projeto já é o plano principal de outra meta.");
        project = await tx.project.update({ where: { id: livre.id }, data: { actionPlanGoalId: meta.id } });
      } else {
        const name = body.name ?? atual.planTitle ?? atual.title.slice(0, 150);
        const ativos = await tx.user.findMany({ where: { id: { in: [...new Set([...people, ...atual.actions.flatMap((a) => a.ownerId && a.status !== "CANCELADA" ? [a.ownerId] : [])])] }, active: true, anonymizedAt: null, role: { not: "CLIENTE" } }, select: { id: true } });
        const team = await tx.team.create({ data: {
          name: await nomeLivreDeEquipe(name + " · equipe", async (n) => !!await tx.team.findUnique({ where: { name: n }, select: { id: true } })),
          description: "Equipe do plano de ação associado à meta",
          members: { create: [{ userId: usuario.id, role: "GESTOR" }, ...ativos.filter((p) => p.id !== usuario.id).map((p) => ({ userId: p.id, role: "MEMBRO" as const }))] },
        } });
        project = await tx.project.create({ data: { name, description: atual.planDescription ?? atual.description, teamId: team.id, ownerId: usuario.id, codccu: meta.contrato?.codccu ?? null, actionPlanGoalId: meta.id, endDate: body.dueDate ? new Date(body.dueDate) : atual.dueDate } });
      }
      if (!atual.planCreatedAt) await tx.contractGoal.update({ where: { id: atual.id }, data: { planTitle: atual.planTitle ?? body.name ?? atual.title.slice(0, 150), planDescription: atual.planDescription ?? atual.description, planCreatedAt: new Date() } });
      await vincularMetasProjeto(tx, project, [meta.id]);
      for (const [order, action] of atual.actions.entries()) {
        const status = statusTarefaDaAcao(action.status);
        if (!status || action.task || action.migratedAt) continue;
        const details = lerDetalhesDoPlano(action.planDetails);
        await tx.task.upsert({
          where: { sourceGoalActionId: action.id }, update: {},
          create: { sourceGoalActionId: action.id, projectId: project.id, title: action.title, description: action.description, assigneeId: action.ownerId, dueDate: action.dueDate, startDate: dataDoItem(details?.plannedStart), actualEndedAt: status === "FEITO" ? dataDoItem(details?.actualCompletion) : null, status: status as "A_FAZER" | "FAZENDO" | "BLOQUEADO" | "FEITO", order },
        });
        await tx.contractGoalAction.update({ where: { id: action.id }, data: { migratedAt: new Date() } });
      }
      await tx.auditLog.create({ data: { userId: usuario.id, action: body.mode === "create" ? "META_PLANO_CRIADO" : "META_PLANO_ASSOCIADO", entityType: "ContractGoal", entityId: meta.id, metadata: JSON.stringify({ projectId: project.id }) } });
      return project;
    });
    // Não expor nome/ID de plano que deixou de ser visível, mesmo numa repetição idempotente.
    if (!(await canViewProject(usuario.id, usuario.role, project.id)) || !(await canManageTeam(usuario.id, usuario.role, project.teamId))) return NextResponse.json({ error: "O plano já existe, mas você não pode gerenciar seu projeto." }, { status: 403 });
    return NextResponse.json({ id: project.id, name: project.name, projectId: project.id }, { status: 200 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && !("code" in error) ? error.message : "Não foi possível associar o plano. Recarregue antes de tentar novamente." }, { status: 409 });
  }
}

