import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { rescheduleAndPersist } from "@/lib/reschedule";

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const dependency = await prisma.taskDependency.findUnique({
    where: { id: params.id },
    include: { successor: { select: { projectId: true } } },
  });
  if (!dependency) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  let allowed = role === "ADMIN";
  if (!allowed && dependency.successor.projectId) {
    const project = await prisma.project.findUnique({ where: { id: dependency.successor.projectId }, select: { teamId: true } });
    if (project) allowed = await canManageTeam(userId, role, project.teamId);
  } else if (!allowed) {
    allowed = role === "GESTOR_PROJETO";
  }
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.$transaction(async (tx) => {
    await tx.taskDependency.delete({ where: { id: params.id } });
    if (dependency.successor.projectId) await rescheduleAndPersist(tx, dependency.successor.projectId);
  });
  return NextResponse.json({ ok: true });
}
