import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      team: true,
      owner: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
      clients: { include: { user: { select: { id: true, name: true } } } },
      tasks: { include: { assignee: { select: { id: true, name: true, avatarColor: true } } } },
    },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json(project);
}

const updateSchema = z.object({
  name: z.string().min(2).max(150).optional(),
  description: z.string().optional(),
  status: z.enum(["PLANEJADO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO"]).optional(),
  ownerId: z.string().optional(),
  approverId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageTeam(userId, role, project.teamId);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const data: any = { ...parsed.data };
  if (parsed.data.startDate !== undefined) data.startDate = parsed.data.startDate ? new Date(parsed.data.startDate) : null;
  if (parsed.data.endDate !== undefined) data.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
  if (parsed.data.approverId !== undefined && parsed.data.approverId !== project.approverId) {
    data.approvalStatus = parsed.data.approverId ? "PENDENTE" : "NAO_REQUER";
  }

  const updated = await prisma.project.update({ where: { id: params.id }, data });
  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageTeam(userId, role, project.teamId);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  await prisma.project.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
