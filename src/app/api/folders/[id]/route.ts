import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTeamMember } from "@/lib/permissions";
import { z } from "zod";

const renameSchema = z.object({ name: z.string().min(1).max(120) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const folder = await prisma.folder.findUnique({ where: { id: params.id }, include: { project: { select: { teamId: true } } } });
  if (!folder) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (!(await isTeamMember(userId, role, folder.project.teamId))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = renameSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updated = await prisma.folder.update({ where: { id: params.id }, data: { name: parsed.data.name.trim() } });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const folder = await prisma.folder.findUnique({ where: { id: params.id }, include: { project: { select: { teamId: true } } } });
  if (!folder) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (!(await isTeamMember(userId, role, folder.project.teamId))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.folder.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
