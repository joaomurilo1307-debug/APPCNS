import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Só administradores acessam a auditoria" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const cursor = searchParams.get("cursor");

  const logs = await prisma.auditLog.findMany({
    take: 50,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { createdAt: "desc" },
    include: { user: { select: { id: true, name: true, email: true } } },
  });

  return NextResponse.json({
    logs,
    nextCursor: logs.length === 50 ? logs[logs.length - 1].id : null,
  });
}
