import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/permissions";

// Tarefas de um projeto que a pessoa ve, para escolher a tarefa-mae ao anexar uma demanda como subtarefa.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role === "CLIENTE") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const projectId = new URL(req.url).searchParams.get("projectId") ?? "";
  if (!projectId) return NextResponse.json({ error: "Informe o projeto" }, { status: 422 });
  if (!(await canViewProject(u.id, u.role, projectId))) return NextResponse.json({ error: "Você não vê este projeto" }, { status: 403 });
  const tarefas = await prisma.task.findMany({ where: { projectId }, select: { id: true, title: true, parentTaskId: true, status: true }, orderBy: { order: "asc" }, take: 500 });
  return NextResponse.json({ tarefas });
}
