import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTeamMember } from "@/lib/permissions";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!(await isTeamMember(userId, role, params.teamId))) {
    return NextResponse.json({ error: "Você não faz parte desta equipe" }, { status: 403 });
  }

  const recent = await prisma.teamMessage.findMany({
    where: { teamId: params.teamId },
    include: {
      sender: { select: { id: true, name: true, avatarColor: true } },
      attachments: { select: { id: true, fileName: true, fileSize: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const messages = recent.reverse();

  await prisma.teamMessageRead.upsert({
    where: { userId_teamId: { userId, teamId: params.teamId } },
    update: { lastReadAt: new Date() },
    create: { userId, teamId: params.teamId, lastReadAt: new Date() },
  });

  return NextResponse.json(messages);
}

const sendSchema = z.object({ body: z.string().min(1).max(4000) });

export async function POST(req: Request, { params }: { params: { teamId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!(await isTeamMember(userId, role, params.teamId))) {
    return NextResponse.json({ error: "Você não faz parte desta equipe" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = sendSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const message = await prisma.teamMessage.create({
    data: { teamId: params.teamId, senderId: userId, body: parsed.data.body },
    include: { sender: { select: { id: true, name: true, avatarColor: true } } },
  });

  return NextResponse.json(message, { status: 201 });
}
