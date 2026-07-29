import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const where = role === "ADMIN" || role === "DIRETOR" ? {} : { OR: [{ userId }, { gestorId: userId }] };

  const pdis = await prisma.pDI.findMany({
    where,
    include: {
      user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true } },
      gestor: { select: { id: true, name: true } },
      items: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(pdis);
}

const createSchema = z.object({
  userId: z.string(),
  period: z.string().max(50).optional(),
  notes: z.string().max(4000).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const gestorId = (session.user as any).id;
  const role = (session.user as any).role;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const target = await prisma.user.findUnique({ where: { id: parsed.data.userId }, select: { id: true, gestorImediatoId: true } });
  if (!target) return NextResponse.json({ error: "Pessoa não encontrada" }, { status: 404 });

  const isAdmin = role === "ADMIN" || role === "DIRETOR";
  const isDirectManager = target.gestorImediatoId === gestorId;
  if (!isAdmin && !isDirectManager) {
    return NextResponse.json({ error: "Só o gestor imediato dessa pessoa (ou Admin/Diretor) pode criar um PDI" }, { status: 403 });
  }

  const pdi = await prisma.pDI.create({
    data: {
      userId: parsed.data.userId,
      gestorId,
      period: parsed.data.period,
      notes: parsed.data.notes,
    },
    include: {
      user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true } },
      gestor: { select: { id: true, name: true } },
      items: true,
    },
  });

  return NextResponse.json(pdi, { status: 201 });
}
