import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { filtroDeTarefasVisiveis } from "@/lib/projetos/visibilidadeTarefas";

// Versao ENXUTA de /api/tasks para o Gantt geral e a Carga da equipe: so' os campos que desenham a barra e contam a carga
// (sem subtarefas aninhadas, campos personalizados, dependencias nem contadores). Mesma regra de visibilidade da lista completa.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const projectId = new URL(req.url).searchParams.get("projectId") ?? undefined;

  const tarefas = await prisma.task.findMany({
    where: { AND: [await filtroDeTarefasVisiveis(userId, role), projectId ? { projectId } : {}] },
    select: {
      id: true, title: true, startDate: true, dueDate: true, status: true, isEntrega: true, parentTaskId: true, order: true,
      assignee: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json(tarefas);
}
