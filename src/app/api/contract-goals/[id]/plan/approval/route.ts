import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeEditarModulo } from "@/lib/acesso/servidor";
import { canViewProject } from "@/lib/permissions";
import { contextoMetas, incluirMetaContrato, temPlanoDeAcao } from "@/lib/contractGoals/server";
import { assinaturaDoPlano, estadoEfetivoDaAprovacao, execucaoDoPlano } from "@/lib/contractGoals/planApproval";

const payload = z.discriminatedUnion("operation", [
  z.object({ operation: z.literal("submit"), approverId: z.string().min(1) }),
  z.object({ operation: z.enum(["approve", "reject"]), note: z.string().trim().max(4000).nullable().optional() }),
]);

async function podeDecidir(usuario: { id: string; role: string }) {
  if (["CLIENTE", "VISUALIZADOR"].includes(usuario.role)) return false;
  const [metas, aprovacoes] = await Promise.all([podeEditarModulo(usuario, "metas"), podeEditarModulo(usuario, "aprovacoes_projetos")]);
  return metas || aprovacoes;
}

async function acesso(id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const usuario = session.user as { id: string; role: string };
  const meta = await prisma.contractGoal.findUnique({ where: { id }, include: incluirMetaContrato });
  const contexto = await contextoMetas(usuario);
  if (!meta || !(await contexto.podeVerMeta(meta))) return { error: NextResponse.json({ error: "Meta não encontrada ou sem acesso" }, { status: 404 }) };
  return { usuario, meta, contexto };
}

async function aprovadoresElegiveis(ownerId: string | null, solicitante: string) {
  const candidates = await prisma.user.findMany({ where: {
    id: { not: solicitante }, active: true, anonymizedAt: null, role: { notIn: ["CLIENTE", "VISUALIZADOR"] },
    OR: [{ role: { in: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"] } }, { teams: { some: { role: "GESTOR" } } }, ...(ownerId ? [{ id: ownerId }] : [])],
  }, select: { id: true, name: true, role: true }, orderBy: { name: "asc" } });
  const eligible = await Promise.all(candidates.map(async (candidate) => await podeDecidir(candidate) ? { id: candidate.id, name: candidate.name } : null));
  return eligible.filter((candidate): candidate is { id: string; name: string } => candidate !== null);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const { usuario, meta, contexto } = ctx;
  const status = estadoEfetivoDaAprovacao(meta);
  const execution = execucaoDoPlano(meta);
  const manager = contexto.podeGerirMeta(meta);
  const decision = meta.planApproverId === usuario.id && await podeDecidir(usuario);
  return NextResponse.json({
    approvers: manager ? await aprovadoresElegiveis(meta.ownerId, usuario.id) : [],
    planApprovalStatus: meta.planApprovalStatus, effectivePlanApprovalStatus: status,
    planApprover: meta.planApprover, planSubmittedAt: meta.planSubmittedAt, planApprovedAt: meta.planApprovedAt, planDecidedAt: meta.planDecidedAt, planApprovalNote: meta.planApprovalNote,
    executionFraction: execution.fraction,
    canSubmitPlan: manager && temPlanoDeAcao(meta) && execution.fraction === 1 && !["PENDENTE", "APROVADO"].includes(status),
    canApprovePlan: decision && status === "PENDENTE" && execution.fraction === 1,
    canRejectPlan: decision && meta.planApprovalStatus === "PENDENTE",
  });
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const { usuario, meta, contexto } = ctx;
  const parsed = payload.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise a solicitação de aprovação do plano." }, { status: 422 });
  const body = parsed.data;
  if (body.operation === "submit") {
    if (!contexto.podeGerirMeta(meta)) return NextResponse.json({ error: "Só quem gerencia a meta pode enviar o plano para aprovação." }, { status: 403 });
    if (body.approverId === usuario.id) return NextResponse.json({ error: "Escolha outra pessoa para aprovar; não é permitido aprovar a própria solicitação." }, { status: 422 });
    if (!(await aprovadoresElegiveis(meta.ownerId, usuario.id)).some((candidate) => candidate.id === body.approverId)) return NextResponse.json({ error: "Escolha um gestor ou responsável ativo com permissão para aprovar." }, { status: 422 });
    if (meta.actionPlan && !(await canViewProject(usuario.id, usuario.role, meta.actionPlan.id))) return NextResponse.json({ error: "É necessário ter acesso ao projeto para enviar sua execução à aprovação." }, { status: 403 });
  } else if (meta.planApproverId !== usuario.id || !(await podeDecidir(usuario))) {
    return NextResponse.json({ error: "Somente o aprovador designado pode decidir este plano." }, { status: 403 });
  }
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-plan:" + meta.id);
      const current = await tx.contractGoal.findUniqueOrThrow({ where: { id: meta.id }, include: incluirMetaContrato });
      const effective = estadoEfetivoDaAprovacao(current);
      const execution = execucaoDoPlano(current);
      const now = new Date();
      if (body.operation === "submit") {
        if (!contexto.podeGerirMeta(current)) throw new Error("A responsabilidade da meta mudou. Recarregue a tela.");
        if (!temPlanoDeAcao(current) || execution.total === 0 || execution.fraction !== 1) throw new Error("Conclua todas as atividades do plano antes de enviá-lo para aprovação.");
        if (["PENDENTE", "APROVADO"].includes(effective)) throw new Error("Esta versão do plano já foi enviada ou aprovada.");
        await tx.contractGoal.update({ where: { id: current.id }, data: { planApproverId: body.approverId, planApprovalStatus: "PENDENTE", planSubmittedAt: now, planApprovedAt: null, planDecidedAt: null, planApprovalNote: null, planApprovalFingerprint: assinaturaDoPlano(current) } });
      } else {
        if (current.planApproverId !== usuario.id) throw new Error("O aprovador designado foi alterado. Recarregue a tela.");
        if (current.planApprovalStatus !== "PENDENTE") throw new Error("Este plano não possui aprovação pendente.");
        if (body.operation === "approve" && (effective !== "PENDENTE" || execution.total === 0 || execution.fraction !== 1)) throw new Error("O plano foi alterado ou reaberto após o envio. Solicite uma nova submissão antes de aprovar.");
        await tx.contractGoal.update({ where: { id: current.id }, data: { planApprovalStatus: body.operation === "approve" ? "APROVADO" : "REJEITADO", planApprovedAt: body.operation === "approve" ? now : null, planDecidedAt: now, planApprovalNote: body.note || null } });
      }
      await tx.auditLog.create({ data: { userId: usuario.id, action: body.operation === "submit" ? "PLANO_ENVIADO_APROVACAO" : body.operation === "approve" ? "PLANO_APROVADO" : "PLANO_REJEITADO", entityType: "ContractGoal", entityId: current.id, metadata: JSON.stringify({ before: { status: current.planApprovalStatus, effectiveStatus: effective, approverId: current.planApproverId, fingerprint: current.planApprovalFingerprint }, after: { status: body.operation === "submit" ? "PENDENTE" : body.operation === "approve" ? "APROVADO" : "REJEITADO", approverId: body.operation === "submit" ? body.approverId : current.planApproverId }, execution }) } });
      return { ok: true, planApprovalStatus: body.operation === "submit" ? "PENDENTE" : body.operation === "approve" ? "APROVADO" : "REJEITADO" };
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && !("code" in error) ? error.message : "Não foi possível registrar a decisão do plano. Recarregue antes de tentar novamente." }, { status: 409 });
  }
}
