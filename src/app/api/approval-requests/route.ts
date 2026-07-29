import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/mailer";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;

  const requests = await prisma.approvalRequest.findMany({
    where: { OR: [{ approverId: userId }, { requesterId: userId }] },
    include: {
      requester: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      approver: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(requests);
}

const createSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(4000).optional(),
  approverId: z.string(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = (session.user as any).role;
  if (role === "CLIENTE" || role === "VISUALIZADOR") {
    return NextResponse.json({ error: "Seu perfil não pode criar solicitações de aprovação" }, { status: 403 });
  }

  const userId = (session.user as any).id;
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (parsed.data.approverId === userId) {
    return NextResponse.json({ error: "Escolha outra pessoa para aprovar" }, { status: 422 });
  }

  const approver = await prisma.user.findUnique({ where: { id: parsed.data.approverId }, select: { id: true, name: true, email: true, active: true } });
  if (!approver || !approver.active) {
    return NextResponse.json({ error: "Aprovador inválido" }, { status: 422 });
  }

  const request = await prisma.approvalRequest.create({
    data: {
      title: parsed.data.title,
      description: parsed.data.description,
      requesterId: userId,
      approverId: parsed.data.approverId,
    },
    include: {
      requester: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
      approver: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
    },
  });

  sendNotificationEmail({
    to: [{ email: approver.email, name: approver.name }],
    subject: `Aprovação pendente: ${request.title}`,
    text: `Olá ${approver.name},\n\n${request.requester.name} pediu sua aprovação para "${request.title}".\n\n${
      request.description ? `${request.description}\n\n` : ""
    }Acesse https://${process.env.APP_DOMAIN}/aprovacoes para decidir.`,
  }).catch(() => {});

  return NextResponse.json(request, { status: 201 });
}
