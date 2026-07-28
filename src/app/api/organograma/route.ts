import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const users = await prisma.user.findMany({
    where: { active: true },
    select: {
      id: true,
      name: true,
      avatarColor: true,
      avatarUrl: true,
      cargo: true,
      nivelHierarquico: true,
      gestorImediatoId: true,
      nucleo: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(users);
}
