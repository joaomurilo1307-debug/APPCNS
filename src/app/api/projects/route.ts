import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleTeamFilter, canManageTeam } from "@/lib/permissions";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const systemRole = (session.user as any).systemRole;
  const teamFilter = await visibleTeamFilter(userId, systemRole);

  const projects = await prisma.project.findMany({
    where: teamFilter,
    include: {
      team: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
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
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const systemRole = (session.user as any).systemRole;

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const allowed = await canManageTeam(userId, systemRole, parsed.data.teamId);
  if (!allowed) {
    return NextResponse.json(
      { error: "Só o gestor da equipe ou um admin pode criar projetos nela" },
      { status: 403 }
    );
  }

  const project = await prisma.project.create({
    data: { ...parsed.data, ownerId: userId },
  });

  return NextResponse.json(project, { status: 201 });
}
