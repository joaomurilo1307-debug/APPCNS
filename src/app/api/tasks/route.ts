import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSeSoConsulta } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { filtroDeTarefasVisiveis } from "@/lib/projetos/visibilidadeTarefas";
import { reconcileTaskOutlook } from "@/lib/taskOutlookSync";
import { rescheduleAndPersist } from "@/lib/reschedule";
import { generateRotinaOccurrences } from "@/lib/rotina";
import crypto from "crypto";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId") ?? undefined;
  const assigneeId = searchParams.get("assigneeId") ?? undefined;
  const onlyTopLevel = searchParams.get("topLevel") === "true";

  const visibility = await filtroDeTarefasVisiveis(userId, role);

  // Regra do Joao (02/11/2026): fora de um projeto (Tarefas, Sprint, Calendario) a pessoa ve so' as tarefas ATRIBUIDAS A ELA, de todos os projetos; as de todos
  // aparecem so' ao abrir o projeto (consulta com projectId, que continua limitada aos projetos que ela enxerga). Vale para qualquer tipo, inclusive Administrador.
  const filtroDeAtribuicao = projectId ? (assigneeId ? { assigneeId } : {}) : { assigneeId: userId };

  const encontradas = await prisma.task.findMany({
    where: {
      AND: [
        visibility,
        projectId ? { projectId } : {},
        filtroDeAtribuicao,
        // com projeto, o quadro traz so' as tarefas-mae; sem projeto, a lista pessoal traz tambem a subtarefa minha cuja tarefa-mae e' de outra pessoa (filtrado abaixo)
        onlyTopLevel && projectId ? { parentTaskId: null } : {},
      ],
    },
    include: {
      assignee: { select: { id: true, name: true, avatarColor: true } },
      project: { select: { id: true, name: true, teamId: true } },
      subtasks: {
        include: { assignee: { select: { id: true, name: true, avatarColor: true } } },
      },
      customFieldValues: true,
      predecessorLinks: {
        include: { predecessor: { select: { id: true, title: true } } },
      },
      _count: { select: { attachments: true, comments: true, subtasks: true } },
    },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });

  // lista pessoal em "so' as de cima": fica a tarefa sem mae e a subtarefa minha cuja mae nao e' minha (a mae aparece com as filhas dentro)
  const meusIds = new Set(encontradas.map((t) => t.id));
  const tasks = onlyTopLevel && !projectId ? encontradas.filter((t) => !t.parentTaskId || !meusIds.has(t.parentTaskId)) : encontradas;

  return NextResponse.json(tasks);
}

const createTaskSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  projectId: z.string().nullable().optional(),
  parentTaskId: z.string().nullable().optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(["BAIXA", "MEDIA", "ALTA", "URGENTE"]).optional(),
  startDate: z.string().datetime().nullable().optional(),
  dueDate: z.string().datetime().nullable().optional(),
  durationDays: z.number().int().min(0).max(3650).nullable().optional(),
  isEntrega: z.boolean().optional(),
  isRotina: z.boolean().optional(),
  rotinaFrequencia: z.enum(["DIARIA", "SEMANAL", "MENSAL"]).nullable().optional(),
  rotinaAteData: z.string().datetime().nullable().optional(),
});

async function nextOrder(projectId: string | null | undefined) {
  const max = await prisma.task.aggregate({
    where: projectId ? { projectId } : { projectId: null },
    _max: { order: true },
  });
  return (max._max.order ?? 0) + 1;
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  { const soConsulta = await negarSeSoConsulta(session.user as any, "tarefas"); if (soConsulta) return soConsulta; }

  const role = (session.user as any).role;
  if (role === "CLIENTE" || role === "VISUALIZADOR") {
    return NextResponse.json({ error: "Seu perfil não pode criar tarefas" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createTaskSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { rotinaAteData, ...rest } = parsed.data;

  if (rest.isRotina && rest.rotinaFrequencia && rotinaAteData) {
    const occurrences = generateRotinaOccurrences({
      startDate: rest.startDate ? new Date(rest.startDate) : new Date(),
      untilDate: new Date(rotinaAteData),
      frequencia: rest.rotinaFrequencia,
    });
    if (occurrences.length === 0) {
      return NextResponse.json({ error: "O período informado não gera nenhuma ocorrência." }, { status: 422 });
    }
    const rotinaGroupId = crypto.randomUUID();
    const baseOrder = await nextOrder(rest.projectId);
    const created = await prisma.$transaction(async (tx) => {
      const rows = [];
      for (let i = 0; i < occurrences.length; i++) {
        const occDate = occurrences[i];
        const dateLabel = occDate.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
        const occEnd = new Date(occDate);
        occEnd.setUTCDate(occEnd.getUTCDate() + (rest.durationDays ?? 0));
        const row = await tx.task.create({
          data: {
            ...rest,
            title: `${rest.title} — ${dateLabel}`,
            startDate: occDate,
            dueDate: occEnd,
            rotinaGroupId,
            order: baseOrder + i,
          },
        });
        rows.push(row);
      }
      return rows;
    });
    return NextResponse.json({ generated: created.length, tasks: created, rotinaGroupId }, { status: 201 });
  }

  const order = await nextOrder(parsed.data.projectId);

  let task = await prisma.task.create({
    data: {
      ...rest,
      order,
      startDate: parsed.data.startDate ? new Date(parsed.data.startDate) : null,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  if (parsed.data.durationDays !== undefined && task.projectId) {
    await prisma.$transaction(async (tx) => {
      await rescheduleAndPersist(tx, task.projectId!);
    });
    task = await prisma.task.findUniqueOrThrow({ where: { id: task.id } });
  }

  await reconcileTaskOutlook(
    { assigneeId: null, outlookEventId: null },
    { id: task.id, title: task.title, dueDate: task.dueDate, assigneeId: task.assigneeId, status: task.status, outlookEventId: null }
  );

  return NextResponse.json(task, { status: 201 });
}
