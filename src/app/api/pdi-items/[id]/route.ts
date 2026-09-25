import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePdiFor } from "@/lib/permissions";
import { z } from "zod";

const updateSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  status: z.enum(["A_FAZER", "FAZENDO", "BLOQUEADO", "FEITO"]).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const item = await prisma.pDIItem.findUnique({ where: { id: params.id }, include: { pdi: true } });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const isManager =
    role === "ADMIN" || role === "DIRETOR" || item.pdi.gestorId === userId || (await canManagePdiFor(userId, role, item.pdi.userId));
  const isOwner = item.pdi.userId === userId;

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const onlyStatus = Object.keys(parsed.data).every((k) => k === "status");
  if (!isManager && !(isOwner && onlyStatus)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const data: any = { ...parsed.data };
  if (parsed.data.dueDate !== undefined) data.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;

  const updated = await prisma.pDIItem.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const item = await prisma.pDIItem.findUnique({ where: { id: params.id }, include: { pdi: true } });
  if (!item) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!(role === "ADMIN" || role === "DIRETOR" || item.pdi.gestorId === userId)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.pDIItem.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
