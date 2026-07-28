import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const otherId = params.userId;

  const messages = await prisma.directMessage.findMany({
    where: {
      OR: [
        { senderId: userId, receiverId: otherId },
        { senderId: otherId, receiverId: userId },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: 200,
  });

  await prisma.directMessage.updateMany({
    where: { senderId: otherId, receiverId: userId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json(messages);
}

const sendSchema = z.object({ body: z.string().min(1).max(4000) });

export async function POST(req: Request, { params }: { params: { userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const otherId = params.userId;
  if (otherId === userId) return NextResponse.json({ error: "Não é possível enviar mensagem para si mesmo" }, { status: 422 });

  const target = await prisma.user.findUnique({ where: { id: otherId }, select: { id: true, active: true } });
  if (!target || !target.active) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const message = await prisma.directMessage.create({
    data: { senderId: userId, receiverId: otherId, body: parsed.data.body },
  });

  return NextResponse.json(message, { status: 201 });
}
