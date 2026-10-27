import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeAcessarModulo, podeEditarModulo } from "@/lib/acesso/servidor";
import { atividadesDoPlano, estadoEfetivoDaAprovacao, execucaoDoPlano, selecionarProjetoParaAprovacao } from "@/lib/contractGoals/planApproval";

// Caixa do responsável designado: nenhum valor financeiro faz parte desta resposta.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  if (usuario.role === "CLIENTE" || !(await podeAcessarModulo(usuario, "aprovacoes_projetos"))) return NextResponse.json({ error: "Sem acesso às aprovações" }, { status: 403 });
  const [editaMetas, editaAprovacoes] = await Promise.all([podeEditarModulo(usuario, "metas"), podeEditarModulo(usuario, "aprovacoes_projetos")]);
  const podeDecidir = !["CLIENTE", "VISUALIZADOR"].includes(usuario.role) && (editaMetas || editaAprovacoes);
  const planos = await prisma.contractGoal.findMany({
    where: { planApproverId: usuario.id, planApprovalStatus: { in: ["PENDENTE", "APROVADO", "REJEITADO"] } },
    select: {
      id: true, title: true, description: true, planTitle: true, planDescription: true, planApprovalStatus: true, planApprovalFingerprint: true,
      planSubmittedAt: true, planApprovedAt: true, planDecidedAt: true, planApprovalNote: true,
      owner: { select: { name: true } }, creator: { select: { name: true } },
      actions: { select: { id: true, title: true, description: true, ownerId: true, owner: { select: { name: true } }, dueDate: true, status: true, migratedAt: true, task: { select: { id: true } } } },
      actionPlan: { select: selecionarProjetoParaAprovacao },
    },
    orderBy: { planSubmittedAt: "desc" }, take: 100,
  });
  return NextResponse.json({ plans: planos.map((plano) => {
    const status = estadoEfetivoDaAprovacao(plano);
    const responsaveis = new Map([...plano.actions.flatMap((a) => a.ownerId && a.owner ? [[a.ownerId, a.owner.name] as const] : []), ...(plano.actionPlan?.tasks ?? []).flatMap((t) => t.assigneeId && t.assignee ? [[t.assigneeId, t.assignee.name] as const] : [])]);
    return { id: plano.id, title: plano.title, planName: plano.planTitle || plano.actionPlan?.name || plano.title, description: plano.planDescription || plano.actionPlan?.description || plano.description, activities: atividadesDoPlano(plano).map((a) => ({ id: a.id, title: a.title, description: a.description, ownerName: a.ownerId ? responsaveis.get(a.ownerId) || "Responsável designado" : "Sem responsável", dueDate: a.dueDate, status: a.status })), status, submittedAt: plano.planSubmittedAt, decidedAt: plano.planDecidedAt, note: plano.planApprovalNote, requestedBy: plano.owner?.name || plano.creator?.name || "Responsável da meta", execution: execucaoDoPlano(plano), canDecide: podeDecidir && status === "PENDENTE" };
  }) });
}
