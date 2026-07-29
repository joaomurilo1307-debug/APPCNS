import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

async function canManagePdi(userId: string, role: string, pdi: { gestorId: string }) {
  return role === "ADMIN" || role === "DIRETOR" || pdi.gestorId === userId;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const pdi = await prisma.pDI.findUnique({
    where: { id: params.id },
    include: {
      user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true } },
      gestor: { select: { id: true, name: true } },
      items: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!pdi) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const isAdmin = role === "ADMIN" || role === "DIRETOR";
  if (!isAdmin && pdi.userId !== userId && pdi.gestorId !== userId) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  return NextResponse.json(pdi);
}

const updateSchema = z.object({
  period: z.string().max(50).nullable().optional(),
  notes: z.string().max(4000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const pdi = await prisma.pDI.findUnique({ where: { id: params.id } });
  if (!pdi) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!(await canManagePdi(userId, role, pdi))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updated = await prisma.pDI.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const pdi = await prisma.pDI.findUnique({ where: { id: params.id } });
  if (!pdi) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!(await canManagePdi(userId, role, pdi))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.pDI.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
