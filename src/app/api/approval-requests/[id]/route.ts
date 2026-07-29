import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/mailer";
import { z } from "zod";

const decisionSchema = z.object({ status: z.enum(["APROVADO", "REJEITADO"]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;

  const existing = await prisma.approvalRequest.findUnique({
    where: { id: params.id },
    include: { requester: { select: { name: true, email: true } } },
  });
  if (!existing) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });
  if (existing.approverId !== userId) {
    return NextResponse.json({ error: "Só o aprovador designado pode decidir" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updated = await prisma.approvalRequest.update({
    where: { id: params.id },
    data: { status: parsed.data.status, decidedAt: new Date() },
  });

  const decisionLabel = parsed.data.status === "APROVADO" ? "aprovou" : "rejeitou";
  sendNotificationEmail({
    to: [{ email: existing.requester.email, name: existing.requester.name }],
    subject: `${decisionLabel === "aprovou" ? "Aprovado" : "Rejeitado"}: ${existing.title}`,
    text: `Olá ${existing.requester.name},\n\nSua solicitação "${existing.title}" foi ${decisionLabel === "aprovou" ? "aprovada" : "rejeitada"} no consominas-gestao.`,
  }).catch(() => {});

  return NextResponse.json(updated);
}
