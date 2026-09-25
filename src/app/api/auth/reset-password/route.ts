import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { z } from "zod";

const schema = z.object({
  token: z.string().min(10),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const user = await prisma.user.findUnique({ where: { resetToken: parsed.data.token } });
  if (!user || !user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
    return NextResponse.json({ error: "Link inválido ou expirado. Peça um novo link." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash, resetToken: null, resetTokenExpiresAt: null },
  });

  await logAudit({ userId: user.id, action: "user.password_reset_self", entityType: "User", entityId: user.id });

  return NextResponse.json({ ok: true });
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");
  if (!token) return NextResponse.json({ valid: false });

  const user = await prisma.user.findUnique({ where: { resetToken: token } });
  const valid = !!user && !!user.resetTokenExpiresAt && user.resetTokenExpiresAt > new Date();
  return NextResponse.json({ valid, name: valid ? user!.name : undefined });
}
