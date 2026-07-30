import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";

async function canManageSchedule(userId: string, role: string, task: { projectId: string | null }) {
  if (role === "ADMIN") return true;
  if (!task.projectId) return role === "GESTOR_PROJETO";
  const project = await prisma.project.findUnique({ where: { id: task.projectId }, select: { teamId: true } });
  if (!project) return false;
  return canManageTeam(userId, role, project.teamId);
}

/** Verifica se existe caminho de `fromId` até `toId` seguindo predecessor -> sucessor (evita ciclo). */
async function hasPath(fromId: string, toId: string): Promise<boolean> {
  const visited = new Set<string>();
  const queue = [fromId];
  while (queue.length) {
    const current = queue.shift()!;
    if (current === toId) return true;
    if (visited.has(current)) continue;
    visited.add(current);
    const links = await prisma.taskDependency.findMany({ where: { predecessorId: current }, select: { successorId: true } });
    for (const l of links) queue.push(l.successorId);
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

  if (await hasPath(params.id, parsed.data.predecessorId)) {
    return NextResponse.json({ error: "Isso criaria um ciclo de dependências (a predecessora já depende, direta ou indiretamente, desta tarefa)" }, { status: 422 });
  }

  try {
    const dependency = await prisma.taskDependency.create({
      data: {
        predecessorId: parsed.data.predecessorId,
        successorId: params.id,
        type: parsed.data.type,
        lagDays: parsed.data.lagDays,
      },
      include: { predecessor: { select: { id: true, title: true } } },
    });
    return NextResponse.json(dependency, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Essa dependência já existe" }, { status: 409 });
  }
}
