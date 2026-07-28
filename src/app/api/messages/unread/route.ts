import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;

  const directUnread = await prisma.directMessage.groupBy({
    by: ["senderId"],
    where: { receiverId: userId, readAt: null },
    _count: { _all: true },
  });
  const direct: Record<string, number> = {};
  let directTotal = 0;
  for (const row of directUnread) {
    direct[row.senderId] = row._count._all;
    directTotal += row._count._all;
  }

  const myTeams = await prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } });
  const reads = await prisma.teamMessageRead.findMany({ where: { userId }, select: { teamId: true, lastReadAt: true } });
  const readByTeam = new Map(reads.map((r) => [r.teamId, r.lastReadAt]));

  const team: Record<string, number> = {};
  let teamTotal = 0;
  for (const { teamId } of myTeams) {
    const since = readByTeam.get(teamId) ?? new Date(0);
    const count = await prisma.teamMessage.count({
      where: { teamId, createdAt: { gt: since }, senderId: { not: userId } },
    });
    if (count > 0) {
      team[teamId] = count;
      teamTotal += count;
    }
  }

  return NextResponse.json({ direct, direct_total: directTotal, team, team_total: teamTotal, total: directTotal + teamTotal });
}
