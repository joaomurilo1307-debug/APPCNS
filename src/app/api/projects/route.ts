import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSeSoConsulta } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { canManageTeam, nucleoIdsQueGere, visibleProjectWhere } from "@/lib/permissions";
import { contratosDoUsuario } from "@/lib/demandas";
import { nomeLivreDeEquipe, pessoasValidas } from "@/lib/pessoas";
import { computePercentComplete } from "@/lib/progress";
import { saudeDoProjeto } from "@/lib/projetos/saude";
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
      nucleos: { select: { id: true, name: true } },
      tasks: { select: { status: true, dueDate: true } },
      _count: { select: { tasks: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  // contrato de cada projeto (nome), para o cartao mostrar "CCU 280 · SVPM CT 072/2024"
  const ccus = Array.from(new Set(projects.map((p) => p.codccu).filter((c): c is string => !!c)));
  const contratos = ccus.length ? await prisma.contrato.findMany({ where: { codccu: { in: ccus } }, select: { codccu: true, nome: true } }) : [];

  const now = new Date();
  const result = projects.map(({ tasks, ...p }) => {
    const overdueCount = tasks.filter((t) => t.dueDate && t.status !== "FEITO" && new Date(t.dueDate) < now).length;
    const blockedCount = tasks.filter((t) => t.status === "BLOQUEADO").length;
    return {
      ...p,
      contrato: p.codccu ? { codccu: p.codccu, nome: contratos.find((c) => c.codccu === p.codccu)?.nome ?? null } : null,
      percentComplete: computePercentComplete(tasks),
      overdueCount,
      blockedCount,
      // semaforo calculado (src/lib/projetos/saude.ts): o mesmo na lista, no Gantt geral, nos Relatorios e no contrato
      saude: saudeDoProjeto({ status: p.status, startDate: p.startDate, endDate: p.endDate, total: tasks.length, feitas: tasks.filter((t) => t.status === "FEITO").length, atrasadas: overdueCount, bloqueadas: blockedCount }, now),
    };
  });

  return NextResponse.json(result);
}

const createProjectSchema = z.object({
  name: z.string().min(2).max(150),
  description: z.string().optional(),
  // uma equipe que ja existe; sem ela, o projeto nasce com uma equipe nova feita das pessoas escolhidas (voce entra como responsavel)
  teamId: z.string().optional(),
  pessoas: z.array(z.string()).max(60).optional(),
  codccu: z.string().regex(/^\d+$/).nullable().optional(), // contrato (centro de custo) do projeto
  nucleoId: z.string().nullable().optional(), // associa o projeto a um nucleo que a pessoa gere
  status: z.enum(["PLANEJADO", "EM_ANDAMENTO", "PAUSADO", "CONCLUIDO"]).optional(),
  approverId: z.string().nullable().optional(),
  startDate: z.string().datetime().nullable().optional(),
  endDate: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  { const soConsulta = await negarSeSoConsulta(session.user as any, "projetos"); if (soConsulta) return soConsulta; }

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  if (role === "CLIENTE" || role === "VISUALIZADOR") return NextResponse.json({ error: "Seu perfil não pode criar projetos" }, { status: 403 });

  const body = await req.json();
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { pessoas, codccu, nucleoId, teamId: teamIdPedido, ...resto } = parsed.data;

  if (teamIdPedido && !(await canManageTeam(userId, role, teamIdPedido))) {
    return NextResponse.json({ error: "Só o gestor da equipe ou um admin pode criar projetos nela" }, { status: 403 });
  }
  if (codccu) {
    const contrato = await prisma.contrato.findUnique({ where: { codccu }, select: { codccu: true } });
    if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
    const alvo = await contratosDoUsuario({ id: userId, role });
    if (!alvo.todos && !alvo.ccus.has(codccu)) return NextResponse.json({ error: "Você não tem acesso a este contrato" }, { status: 403 });
  }
  if (nucleoId && role !== "ADMIN" && !(await nucleoIdsQueGere(userId)).includes(nucleoId)) {
    return NextResponse.json({ error: "Só quem gere o núcleo associa projetos a ele" }, { status: 403 });
  }
  const membros = (await pessoasValidas(pessoas ?? [])).filter((id) => id !== userId);

  const project = await prisma.$transaction(async (tx) => {
    let teamId = teamIdPedido;
    if (!teamId) {
      const nome = await nomeLivreDeEquipe(`${resto.name} · equipe`, async (n) => !!(await tx.team.findUnique({ where: { name: n }, select: { id: true } })));
      const equipe = await tx.team.create({
        data: {
          name: nome, description: "Equipe criada junto com o projeto",
          members: { create: [{ userId, role: "GESTOR" as const }, ...membros.map((id) => ({ userId: id, role: "MEMBRO" as const }))] },
        },
      });
      teamId = equipe.id;
    }
    return tx.project.create({
      data: {
        name: resto.name, description: resto.description, status: resto.status, approverId: resto.approverId,
        teamId, codccu: codccu ?? null,
        startDate: resto.startDate ? new Date(resto.startDate) : null,
        endDate: resto.endDate ? new Date(resto.endDate) : null,
        approvalStatus: resto.approverId ? "PENDENTE" : "NAO_REQUER",
        ownerId: userId,
        ...(nucleoId ? { nucleos: { connect: { id: nucleoId } } } : {}),
      },
    });
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
