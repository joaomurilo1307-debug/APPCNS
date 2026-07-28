import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      avatarColor: true,
      avatarUrl: true,
      cargo: true,
      setor: true,
      diretoria: true,
      gestorImediato: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json(user);
}

const updateMeSchema = z.object({
  avatarColor: z.string().max(20).optional(),
  avatarUrl: z.string().max(400_000).nullable().optional(),
});

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const body = await req.json();
  const parsed = updateMeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updated = await prisma.user.update({
    where: { id: userId },
    data: parsed.data,
    select: { id: true, name: true, avatarColor: true, avatarUrl: true },
  });

  return NextResponse.json(updated);
}
