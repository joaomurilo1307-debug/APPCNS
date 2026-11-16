import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam, canViewProject } from "@/lib/permissions";
import { z } from "zod";
import { esforcoPorPessoa } from "@/lib/timesheetAuto/servidor";

// Horas gastas = ESFORCO real, pelo mesmo modelo do Timesheet automatico (src/lib/timesheetAuto/calculo.ts): so' conta tarefa iniciada, so' nos dias
// trabalhados (sem fim de semana, feriado nem ausencia) e enquanto a tarefa esteve em "Fazendo"; quando a pessoa tem varias tarefas ao mesmo tempo o dia
// e' DIVIDIDO entre elas (nao dobra); e se ela informou as "horas dedicadas", valem as horas informadas. Antes era o tempo corrido entre o inicio e a
// conclusao (24 h por dia, fins de semana, e cada tarefa simultanea contava o tempo todo).
const arredondar = (n: number) => Math.round(n * 100) / 100;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if (!(await canViewProject((session.user as any).id, (session.user as any).role, params.id))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: {
      team: { include: { members: { include: { user: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } } } } } },
      resourceRates: true,
      tasks: {
        select: {
          id: true,
          title: true,
          status: true,
          assigneeId: true,
          assignee: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
          horasDedicadas: true,
          responsavelEventos: { select: { deUserId: true, paraUserId: true } },
        },
      },
    },
  });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const rateByUser = new Map(project.resourceRates.map((r) => [r.userId, r.hourlyRate]));

  // quem trabalhou nas tarefas do projeto: o responsavel de hoje e quem foi responsavel antes
  const trabalhadores = new Set<string>();
  for (const t of project.tasks) {
    if (t.assigneeId) trabalhadores.add(t.assigneeId);
    for (const e of t.responsavelEventos) {
      if (e.deUserId) trabalhadores.add(e.deUserId);
      if (e.paraUserId) trabalhadores.add(e.paraUserId);
    }
  }
  const esforco = await esforcoPorPessoa([...trabalhadores]);
  const nomes = new Map((await prisma.user.findMany({ where: { id: { in: [...trabalhadores] } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));

  const activities: { taskId: string; title: string; status: string; assigneeId: string | null; assigneeName: string; hoursSpent: number; daysWorked: number; declared: boolean; hourlyRate: number; cost: number }[] = [];
  for (const t of project.tasks) {
    // uma linha por pessoa que trabalhou na tarefa; a tarefa com responsavel sempre aparece, mesmo sem horas
    const donos = new Set<string>();
    for (const uid of trabalhadores) if ((esforco.get(uid)?.horasPorTarefa.get(t.id) ?? 0) > 0) donos.add(uid);
    if (t.assigneeId) donos.add(t.assigneeId);
    for (const uid of donos) {
      const h = arredondar(esforco.get(uid)?.horasPorTarefa.get(t.id) ?? 0);
      const rate = rateByUser.get(uid) ?? 0;
      activities.push({
        taskId: t.id,
        title: t.title,
        status: t.status,
        assigneeId: uid,
        assigneeName: uid === t.assigneeId ? t.assignee?.name ?? "" : nomes.get(uid) ?? "",
        hoursSpent: h,
        daysWorked: esforco.get(uid)?.diasPorTarefa.get(t.id) ?? 0,
        declared: esforco.get(uid)?.informadas.has(t.id) ?? false,
        hourlyRate: rate,
        cost: arredondar(h * rate),
      });
    }
  }
  activities.sort((a, b) => b.hoursSpent - a.hoursSpent);

  const peopleById = new Map(
    project.team.members.map((m) => [
      m.user.id,
      { id: m.user.id, name: m.user.name, avatarColor: m.user.avatarColor, avatarUrl: m.user.avatarUrl },
    ])
  );
  for (const t of project.tasks) {
    if (t.assigneeId && t.assignee && !peopleById.has(t.assigneeId)) {
      peopleById.set(t.assigneeId, {
        id: t.assignee.id,
        name: `${t.assignee.name} (outro núcleo)`,
        avatarColor: (t.assignee as any).avatarColor,
        avatarUrl: (t.assignee as any).avatarUrl,
      });
    }
  }

  for (const uid of trabalhadores) {
    if (!peopleById.has(uid) && activities.some((a) => a.assigneeId === uid)) {
      const p = await prisma.user.findUnique({ where: { id: uid }, select: { id: true, name: true, avatarColor: true, avatarUrl: true } });
      if (p) peopleById.set(uid, { id: p.id, name: `${p.name} (outro núcleo)`, avatarColor: p.avatarColor, avatarUrl: p.avatarUrl });
    }
  }

  const resources = Array.from(peopleById.values()).map((u) => {
    const rate = rateByUser.get(u.id) ?? 0;
    const mine = activities.filter((a) => a.assigneeId === u.id);
    const totalHours = arredondar(mine.reduce((s, a) => s + a.hoursSpent, 0));
    return {
      userId: u.id,
      name: u.name,
      avatarColor: u.avatarColor,
      avatarUrl: u.avatarUrl,
      hourlyRate: rate,
      hoursSpent: totalHours,
      cost: arredondar(totalHours * rate),
    };
  });

  return NextResponse.json({ resources, activities });
}

const rateSchema = z.object({
  userId: z.string(),
  hourlyRate: z.number().min(0),
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
  const parsed = rateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const rate = await prisma.resourceRate.upsert({
    where: { projectId_userId: { projectId: params.id, userId: parsed.data.userId } },
    update: { hourlyRate: parsed.data.hourlyRate },
    create: { projectId: params.id, userId: parsed.data.userId, hourlyRate: parsed.data.hourlyRate },
  });

  return NextResponse.json(rate);
}
