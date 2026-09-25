import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

/**
 * Encerra o vínculo de um funcionário e anonimiza seus dados pessoais (LGPD, direito ao
 * esquecimento), mantendo o registro histórico (tarefas, projetos, PDI) intacto para não
 * quebrar relatórios. Ação distinta e irreversível do toggle "Ativo/Inativo" reversível.
 */
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const currentUserId = (session.user as any).id;
  const currentRole = (session.user as any).role;
  if (currentRole !== "ADMIN") {
    return NextResponse.json({ error: "Só administradores podem encerrar vínculo" }, { status: 403 });
  }
  if (currentUserId === params.id) {
    return NextResponse.json({ error: "Você não pode encerrar seu próprio vínculo" }, { status: 422 });
  }

  const user = await prisma.user.findUnique({ where: { id: params.id } });
  if (!user) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (user.anonymizedAt) {
    return NextResponse.json({ error: "Essa pessoa já teve os dados anonimizados" }, { status: 422 });
  }

  const anonId = user.id.slice(-8);
  const updated = await prisma.user.update({
    where: { id: params.id },
    data: {
      name: `Ex-funcionário (${anonId})`,
      email: `ex-${anonId}@anonimizado.consominas.local`,
      whatsapp: null,
      ramal: null,
      avatarUrl: null,
      active: false,
      anonymizedAt: new Date(),
    },
    select: { id: true, name: true, anonymizedAt: true },
  });

  await logAudit({
    userId: currentUserId,
    action: "user.offboard_anonymize",
    entityType: "User",
    entityId: params.id,
    metadata: { originalName: user.name, originalEmail: user.email },
  });

  return NextResponse.json(updated);
}
