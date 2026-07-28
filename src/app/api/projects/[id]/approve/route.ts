import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/mailer";
import { z } from "zod";

const approveSchema = z.object({
  decision: z.enum(["APROVADO", "REJEITADO"]),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const canApprove = role === "ADMIN" || (role === "APROVADOR" && project.approverId === userId);
  if (!canApprove) {
    return NextResponse.json({ error: "Só o aprovador designado (ou Admin) pode decidir" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = approveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updated = await prisma.project.update({
    where: { id: params.id },
    data: { approvalStatus: parsed.data.decision },
  });

  const owner = await prisma.user.findUnique({
    where: { id: project.ownerId },
    select: { name: true, email: true },
  });
  if (owner) {
    const decisionLabel = parsed.data.decision === "APROVADO" ? "aprovado" : "rejeitado";
    sendNotificationEmail({
      to: [{ email: owner.email, name: owner.name }],
      subject: `Projeto ${decisionLabel}: ${project.name}`,
      text: `Olá ${owner.name},\n\nO projeto "${project.name}" foi ${decisionLabel} no consominas-gestao.\n\nAcesse https://${process.env.APP_DOMAIN}/projetos/${project.id} para detalhes.`,
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}
