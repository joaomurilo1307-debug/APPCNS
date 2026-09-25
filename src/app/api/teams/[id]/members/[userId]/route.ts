import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";

export async function DELETE(_req: Request, { params }: { params: { id: string; userId: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const currentUserId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageTeam(currentUserId, role, params.id);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.userTeam.delete({
    where: { userId_teamId: { userId: params.userId, teamId: params.id } },
  });

  return NextResponse.json({ ok: true });
}
