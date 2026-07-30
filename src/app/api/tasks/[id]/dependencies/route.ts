import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { rescheduleAndPersist } from "@/lib/reschedule";
import { z } from "zod";

async function canManageSchedule(userId: string, role: string, task: { projectId: string | null }) {
  if (role === "ADMIN") return true;
  if (!task.projectId) return role === "GESTOR_PROJETO";
  const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { teamId: true } });
  if (!project) return false;
  return canManageTeam(userId, role, project.teamId);
}

/**
 * Verifica se existe caminho de `fromId` até `toId` seguindo predecessor -> sucessor (evita ciclo).
 * Busca todas as dependências de uma vez (não por passo do BFS) pra evitar N+1 numa rede grande.
 */
function hasPath(fromId: string, toId: string, adjacency: Map<string, string[]>): boolean {
  const visited = new Set<string>();
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === toId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    for (const next of adjacency.get(current) ?? []) queue.push(next);
  }
  return false;
}

const createSchema = z.object({
  predecessorId: z.string(),
  type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lagDays: z.number().int().min(-365).max(365).default(0),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const task = await prisma.task.findUnique({ where: { id: params.id } });
  if (!task) return NextResponse.json({ error: "Tarefa não encontrada" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (!(await canManageSchedule(userId, role, task))) {
    return NextResponse.json({ error: "Sem permissão para editar dependências desta tarefa" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (parsed.data.predecessorId === params.id) {
    return NextResponse.json({ error: "Uma tarefa não pode depender dela mesma" }, { status: 422 });
  }

  const predecessor = await prisma.task.findUnique({ where: { id: parsed.data.predecessorId } });
  if (!predecessor) return NextResponse.json({ error: "Tarefa predecessora não encontrada" }, { status: 404 });

  if (task.projectId && predecessor.projectId && task.projectId !== predecessor.projectId) {
    return NextResponse.json({ error: "As duas tarefas precisam ser do mesmo projeto" }, { status: 422 });
  }

  const allLinks = await prisma.taskDependency.findMany({ select: { predecessorId: true, successorId: true } });
  const adjacency = new Map<string, string[]>();
  for (const l of allLinks) {
    if (!adjacency.has(l.predecessorId)) adjacency.set(l.predecessorId, []);
    adjacency.get(l.predecessorId)!.push(l.successorId);
  }

  if (hasPath(params.id, parsed.data.predecessorId, adjacency)) {
    return NextResponse.json({ error: "Isso criaria um ciclo de dependências (a predecessora já depende, direta ou indiretamente, desta tarefa)" }, { status: 422 });
  }

  try {
    const dependency = await prisma.$transaction(async (tx) => {
      const created = await tx.taskDependency.create({
        data: {
          predecessorId: parsed.data.predecessorId,
          successorId: params.id,
          type: parsed.data.type,
          lagDays: parsed.data.lagDays,
        },
        include: { predecessor: { select: { id: true, title: true } } },
      });
      if (task.projectId) await rescheduleAndPersist(tx, task.projectId);
      return created;
    });
    return NextResponse.json(dependency, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Essa dependência já existe" }, { status: 409 });
  }
}
