import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "E-mail ou senha inválidos (senha precisa ter 8+ caracteres)" }, { status: 422 });
  }

  const userId = (session.user as any).id as string;
  const novoEmail = parsed.data.email.toLowerCase();

  const emailEmUso = await prisma.user.findUnique({ where: { email: novoEmail } });
  if (emailEmUso && emailEmUso.id !== userId) {
    return NextResponse.json({ error: "Esse e-mail já está em uso por outra conta." }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: userId },
    data: { email: novoEmail, passwordHash, primeiroAcesso: false },
  });

  await logAudit({ userId, action: "user.completou_cadastro_senior", entityType: "User", entityId: userId });

  return NextResponse.json({ ok: true });
}
