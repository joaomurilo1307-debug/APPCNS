import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ONLINE_THRESHOLD_MS = 60_000;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { active: true },
    select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true, role: true, lastSeenAt: true, statusManual: true },
    orderBy: { name: "asc" },
  });

  const now = Date.now();
  const result = users.map((u) => ({
    id: u.id,
    name: u.name,
    avatarColor: u.avatarColor,
    avatarUrl: u.avatarUrl,
    cargo: u.cargo,
    role: u.role,
    online: !!u.lastSeenAt && now - new Date(u.lastSeenAt).getTime() < ONLINE_THRESHOLD_MS,
    statusManual: u.statusManual,
  }));

  return NextResponse.json(result);
}
