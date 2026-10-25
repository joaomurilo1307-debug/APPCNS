import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";

// Apaga uma atualizacao: quem escreveu, quem gerencia a equipe do projeto ou o admin.
export async function DELETE(_req: Request, { params }: { params: { id: string; uid: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const a = await prisma.atualizacaoProjeto.findFirst({ where: { id: params.uid, projectId: params.id }, select: { id: true, autorId: true, project: { select: { teamId: true } } } });
  if (!a) return NextResponse.json({ error: "Atualização não encontrada" }, { status: 404 });
  const pode = a.autorId === u.id || u.role === "ADMIN" || (await canManageTeam(u.id, u.role, a.project.teamId));
  if (!pode) return NextResponse.json({ error: "Só quem escreveu ou quem gerencia o projeto apaga" }, { status: 403 });
  await prisma.atualizacaoProjeto.delete({ where: { id: a.id } });
  return NextResponse.json({ ok: true });
}
