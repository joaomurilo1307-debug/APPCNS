import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { CALL_MESSAGE_PREFIX, extractCallUrl } from "@/lib/callMessage";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const since = new Date(Date.now() - 20_000);

  const directCalls = await prisma.directMessage.findMany({
    where: {
      receiverId: userId,
      senderId: { not: userId },
      createdAt: { gt: since },
      body: { startsWith: CALL_MESSAGE_PREFIX },
    },
    include: { sender: { select: { id: true, name: true } } },
    orderBy: { createdAt: "desc" },
  });

  const myTeams = await prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } });
  const teamIds = myTeams.map((t) => t.teamId);

  const teamCalls = teamIds.length
    ? await prisma.teamMessage.findMany({
        where: {
          teamId: { in: teamIds },
          senderId: { not: userId },
          createdAt: { gt: since },
          body: { startsWith: CALL_MESSAGE_PREFIX },
        },
        include: { sender: { select: { id: true, name: true } }, team: { select: { id: true, name: true } } },
        orderBy: { createdAt: "desc" },
      })
    : [];

  const calls = [
    ...directCalls.map((m) => ({
      id: m.id,
      type: "direct" as const,
      fromId: m.sender.id,
      fromName: m.sender.name,
      url: extractCallUrl(m.body),
      createdAt: m.createdAt,
    })),
    ...teamCalls.map((m) => ({
      id: m.id,
      type: "team" as const,
      teamId: m.teamId,
      teamName: m.team.name,
      fromId: m.sender.id,
      fromName: m.sender.name,
      url: extractCallUrl(m.body),
      createdAt: m.createdAt,
    })),
  ];

  return NextResponse.json(calls);
}
