import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;

  const invites = await prisma.calendarEventAttendee.findMany({
    where: { userId },
    include: {
      event: {
        include: {
          creator: { select: { id: true, name: true, avatarColor: true } },
          project: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { event: { startAt: "desc" } },
    take: 50,
  });

  return NextResponse.json(invites);
}
