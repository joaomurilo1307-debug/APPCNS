import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_MESSAGE_PREFIX, extractCallUrl } from "@/lib/callMessage";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;

  const directCalls = await prisma.directMessage.findMany({
    where: {
      OR: [{ senderId: userId }, { receiverId: userId }],
      body: { startsWith: CALL_MESSAGE_PREFIX },
    },
    include: {
      sender: { select: { id: true, name: true } },
      receiver: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const myTeams = await prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } });
  const teamIds = myTeams.map((t) => t.teamId);

  const teamCalls = teamIds.length
    ? await prisma.teamMessage.findMany({
        where: { teamId: { in: teamIds }, body: { startsWith: CALL_MESSAGE_PREFIX } },
        include: { sender: { select: { id: true, name: true } }, team: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      })
    : [];

  const calls = [
    ...directCalls.map((m) => ({
      id: m.id,
      type: "direct" as const,
      outgoing: m.senderId === userId,
      counterpartName: m.senderId === userId ? m.receiver.name : m.sender.name,
      url: extractCallUrl(m.body),
      createdAt: m.createdAt,
    })),
    ...teamCalls.map((m) => ({
      id: m.id,
      type: "team" as const,
      outgoing: m.senderId === userId,
      counterpartName: m.sender.name,
      teamName: m.team.name,
      url: extractCallUrl(m.body),
      createdAt: m.createdAt,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json(calls.slice(0, 100));
}
