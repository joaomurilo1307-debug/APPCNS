import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canModifyTask } from "@/lib/permissions";
import { z } from "zod";

const moveSchema = z.object({ direction: z.enum(["up", "down"]) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const isAssignee = task.assigneeId === userId;
  if (!canModifyTask(role, isAssignee, task.locked)) {
    return NextResponse.json({ error: "Sem permissão para alterar esta tarefa" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = moveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const siblings = await prisma.task.findMany({
    where: { projectId: task.projectId, parentTaskId: task.parentTaskId },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
    select: { id: true, order: true },
  });

  // Renumera pra valores distintos e sequenciais preservando a ordem atual — auto-corrige
  // tarefas antigas que ainda têm `order` zerado/repetido (de antes desse campo existir),
  // senão a troca vira um no-op quando os dois lados têm o mesmo valor.
  const normalized = siblings.map((s, i) => ({ id: s.id, order: i }));

  const index = normalized.findIndex((s) => s.id === task.id);
  if (index === -1) return NextResponse.json({ error: "Tarefa fora da lista" }, { status: 409 });

  const swapIndex = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (swapIndex < 0 || swapIndex >= normalized.length) {
    await prisma.$transaction(normalized.map((s) => prisma.task.update({ where: { id: s.id }, data: { order: s.order } })));
    return NextResponse.json({ ok: true, moved: false });
  }

  const tmp = normalized[index].order;
  normalized[index].order = normalized[swapIndex].order;
  normalized[swapIndex].order = tmp;

  await prisma.$transaction(normalized.map((s) => prisma.task.update({ where: { id: s.id }, data: { order: s.order } })));

  return NextResponse.json({ ok: true, moved: true });
}
