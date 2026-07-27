import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  let where: any = {};
  if (role === "CLIENTE") {
    where = { clients: { some: { userId } } };
  } else if (role === "APROVADOR") {
    const teamIds = (
      await prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } })
    ).map((t) => t.teamId);
    where = { OR: [{ teamId: { in: teamIds } }, { approverId: userId }] };
  } else if (role !== "ADMIN") {
    const teamIds = (
      await prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } })
    ).map((t) => t.teamId);
    where = { teamId: { in: teamIds } };
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      team: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(projects);
}

const createProjectSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().optional(),
  teamId: z.string(),
  status: z.enum(["PLANEJADO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO"]).optional(),
  approverId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const allowed = await canManageTeam(userId, role, parsed.data.teamId);
  if (!allowed) {
    return NextResponse.json(
      { error: "Só o gestor da equipe ou um admin pode criar projetos nela" },
      { status: 403 }
    );
  }

  const project = await prisma.project.create({
    data: {
      ...parsed.data,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
      approvalStatus: parsed.data.approverId ? "PENDENTE" : "NAO_REQUER",
      ownerId: userId,
    },
  });

  return NextResponse.json(project, { status: 201 });
}
