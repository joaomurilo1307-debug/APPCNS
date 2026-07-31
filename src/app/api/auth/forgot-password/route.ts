import { NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/mailer";
import { z } from "zod";

const WINDOW_MS = 60 * 60 * 1000;
const MAX_ATTEMPTS = 3;
const attempts = new Map<string, { count: number; firstAttempt: number }>();

function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  if (!entry) return false;
  if (Date.now() - entry.firstAttempt > WINDOW_MS) {
    attempts.delete(key);
    return false;
  }
  return entry.count >= MAX_ATTEMPTS;
}

function recordAttempt(key: string) {
  const entry = attempts.get(key);
  if (!entry || Date.now() - entry.firstAttempt > WINDOW_MS) {
    attempts.set(key, { count: 1, firstAttempt: Date.now() });
    return;
  }
  entry.count += 1;
}

const schema = z.object({ email: z.string().email() });

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "E-mail inválido" }, { status: 422 });

  const email = parsed.data.email.toLowerCase();
  const generic = NextResponse.json({
    ok: true,
    message: "Se esse e-mail existir na base, enviamos um link de redefinição de senha.",
  });

  if (isRateLimited(email)) return generic;
  recordAttempt(email);

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.active) return generic;

  const token = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { id: user.id },
    data: { resetToken: token, resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000) },
  });

  const appUrl = process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : "";
  const link = `${appUrl}/reset-senha/${token}`;

  await sendNotificationEmail({
    to: [{ email: user.email, name: user.name }],
    subject: "Redefinição de senha — Consominas Gestão",
    text: [
      `Olá, ${user.name}.`,
      `Recebemos um pedido para redefinir sua senha no Consominas Gestão.`,
      `Acesse o link abaixo para escolher uma nova senha (válido por 1 hora):`,
      link,
      ``,
      `Se você não pediu isso, pode ignorar este e-mail — sua senha continua a mesma.`,
    ].join("\n"),
  });

  return generic;
}
