import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
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
      nivelHierarquico: true,
      nucleo: { select: { id: true, name: true } },
      gestorImediato: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true } },
    },
  });
  if (!user) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json(user);
}

const updateMeSchema = z.object({
  avatarColor: z.string().max(20).optional(),
  avatarUrl: z.string().max(400_000).nullable().optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(8).optional(),
});

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const body = await req.json();
  const parsed = updateMeSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { currentPassword, newPassword, ...rest } = parsed.data;

  let passwordHash: string | undefined;
  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json({ error: "Informe a senha atual" }, { status: 422 });
    }
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    const valid = user && (await bcrypt.compare(currentPassword, user.passwordHash));
    if (!valid) {
      return NextResponse.json({ error: "Senha atual incorreta" }, { status: 403 });
    }
    passwordHash = await bcrypt.hash(newPassword, 10);
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { ...rest, ...(passwordHash ? { passwordHash } : {}) },
    select: { id: true, name: true, avatarColor: true, avatarUrl: true },
  });

  return NextResponse.json(updated);
}
