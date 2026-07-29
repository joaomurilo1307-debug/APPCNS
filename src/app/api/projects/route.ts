import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, visibleProjectWhere } from "@/lib/permissions";
import { computePercentComplete } from "@/lib/progress";
import { sendNotificationEmail } from "@/lib/mailer";
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
    const base = await visibleProjectWhere(userId, role);
    where = Object.keys(base).length === 0 ? {} : { OR: [...(base.OR ?? [base]), { approverId: userId }] };
  } else if (role !== "ADMIN") {
    where = await visibleProjectWhere(userId, role);
  }

  const projects = await prisma.project.findMany({
    where,
    include: {
      team: { select: { id: true, name: true } },
      owner: { select: { id: true, name: true } },
      approver: { select: { id: true, name: true } },
      tasks: { select: { status: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const result = projects.map(({ tasks, ...p }) => ({
    ...p,
    percentComplete: computePercentComplete(tasks),
  }));

  return NextResponse.json(result);
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

  if (parsed.data.approverId) {
    const approver = await prisma.user.findUnique({
      where: { id: parsed.data.approverId },
      select: { name: true, email: true },
    });
    if (approver) {
      sendNotificationEmail({
        to: [{ email: approver.email, name: approver.name }],
        subject: `Aprovação pendente: ${project.name}`,
        text: `Olá ${approver.name},\n\nO projeto "${project.name}" está aguardando sua aprovação no consominas-gestao.\n\nAcesse https://${process.env.APP_DOMAIN}/aprovacoes para decidir.`,
      }).catch(() => {});
    }
  }

  return NextResponse.json(project, { status: 201 });
}
