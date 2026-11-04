import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filtroDeTarefasVisiveis } from "@/lib/projetos/visibilidadeTarefas";
import { z } from "zod";

/** Comentario de tarefa so' para quem ve a tarefa (a mesma regra da lista de Tarefas): projeto dela ou tarefa dela. Ninguem ve o que nao e' seu, nem pelo id (Joao, 04/11/2026). */
async function veATarefa(userId: string, role: string, taskId: string): Promise<boolean> {
  return (await prisma.task.count({ where: { AND: [{ id: taskId }, await filtroDeTarefasVisiveis(userId, role)] } })) > 0;
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await veATarefa((session.user as any).id, (session.user as any).role, params.id))) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const comments = await prisma.taskComment.findMany({
    where: { taskId: params.id },
    include: { author: { select: { id: true, name: true } } },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(comments);
}

const createCommentSchema = z.object({
  body: z.string().min(1).max(4000),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = (session.user as any).role;
  if (role === "VISUALIZADOR") {
    return NextResponse.json({ error: "Seu perfil é só leitura" }, { status: 403 });
  }
  if (!(await veATarefa((session.user as any).id, role, params.id))) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const body = await req.json();
  const parsed = createCommentSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const comment = await prisma.taskComment.create({
    data: {
      taskId: params.id,
      authorId: (session.user as any).id,
      body: parsed.data.body,
    },
    include: { author: { select: { id: true, name: true } } },
  });

  return NextResponse.json(comment, { status: 201 });
}
