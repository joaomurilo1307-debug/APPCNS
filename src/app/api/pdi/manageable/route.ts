import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { manageablePdiUserIds } from "@/lib/permissions";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;

  const people = await prisma.user.findMany({
    where: { active: true, id: { in: await manageablePdiUserIds(userId) } },
    select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(people);
}
