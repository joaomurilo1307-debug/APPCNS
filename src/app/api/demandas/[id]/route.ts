import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { avisarPessoas, ehAtendente, ehCliente, pessoasValidas, podeGerirDemandas, podeVerDemanda, PRIORIDADES, STATUS_DEMANDA } from "@/lib/demandas";
import { z } from "zod";

async function carregar(id: string) {
  return prisma.demanda.findUnique({
    where: { id },
    include: {
      contrato: { select: { codccu: true, nome: true, cliente: true } },
      nucleo: { select: { id: true, name: true } },
      atendentes: { select: { user: { select: { id: true, name: true } } } },
      solicitante: { select: { id: true, name: true, role: true } },
      itens: { orderBy: { ordem: "asc" } },
      comentarios: { orderBy: { createdAt: "asc" }, include: { autor: { select: { id: true, name: true, role: true } } } },
      project: { select: { id: true, name: true, status: true, startDate: true, endDate: true, tasks: { select: { id: true, title: true, status: true, dueDate: true, parentTaskId: true, assignee: { select: { name: true } } }, orderBy: { order: "asc" } } } },
    },
  });
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const d = await carregar(params.id);
  if (!d) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
  if (!(await podeVerDemanda(u, d))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const cliente = ehCliente(u);
  const tarefas = d.project?.tasks ?? [];
  // aceita anexando a um projeto que ja existia: a tarefa (ou subtarefa) criada, com as subtarefas e o andamento
  let anexo: any = null;
  if (d.anexadaProjectId && d.anexadaTaskId) {
    const [proj, tarefa] = await Promise.all([
      prisma.project.findUnique({ where: { id: d.anexadaProjectId }, select: { id: true, name: true, status: true } }),
      prisma.task.findUnique({
        where: { id: d.anexadaTaskId },
        select: { id: true, title: true, status: true, dueDate: true, parentTask: { select: { id: true, title: true } }, assignee: { select: { name: true } }, subtasks: { select: { id: true, title: true, status: true, dueDate: true, assignee: { select: { name: true } } }, orderBy: { order: "asc" } } },
      }),
    ]);
    if (proj && tarefa) {
      const filhas = tarefa.subtasks;
      anexo = {
        projeto: proj, tarefa: { id: tarefa.id, title: tarefa.title, status: tarefa.status, dueDate: tarefa.dueDate, paiTitulo: tarefa.parentTask?.title ?? null, responsavel: cliente ? null : tarefa.assignee?.name ?? null },
        subtarefas: filhas.map((s) => ({ id: s.id, title: s.title, status: s.status, dueDate: s.dueDate, responsavel: cliente ? null : s.assignee?.name ?? null })),
        andamento: filhas.length ? Math.round((filhas.filter((s) => s.status === "FEITO").length / filhas.length) * 100) : tarefa.status === "FEITO" ? 100 : 0,
      };
    }
  }
  return NextResponse.json({
    demanda: {
      ...d,
      atendentes: d.atendentes.map((a) => a.user),
      anexo,
      comentarios: d.comentarios.filter((c) => !cliente || !c.interno),
      project: d.project ? { ...d.project, tasks: tarefas.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, parentTaskId: t.parentTaskId, responsavel: cliente ? null : t.assignee?.name ?? null })), andamento: tarefas.length ? Math.round((tarefas.filter((t) => t.status === "FEITO").length / tarefas.length) * 100) : 0 } : null,
    },
    podeGerir: await podeGerirDemandas(u, d.nucleoId, d.id),
    souSolicitante: d.solicitanteId === u.id,
    souAtendente: await ehAtendente(u, d.id),
  });
}

const patchSchema = z.object({
  titulo: z.string().trim().min(3).max(160).optional(),
  descricao: z.string().trim().max(4000).nullable().optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  prazoDesejado: z.string().nullable().optional(),
  status: z.enum(STATUS_DEMANDA).optional(),
  motivoRecusa: z.string().trim().max(2000).nullable().optional(),
  nucleoId: z.string().nullable().optional(),
  atendentes: z.array(z.string()).max(10).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const d = await carregar(params.id);
  if (!d) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
  if (!(await podeVerDemanda(u, d))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const p = parsed.data;
  const gerir = await podeGerirDemandas(u, d.nucleoId, d.id);
  const dono = d.solicitanteId === u.id;
  // quem pediu pode ajustar titulo/descricao/prioridade/prazo enquanto a demanda esta NOVA; situacao so' a gestao
  if (!gerir && !(dono && d.status === "NOVA")) return NextResponse.json({ error: "Só a gestão altera esta demanda" }, { status: 403 });
  if (!gerir && p.atendentes !== undefined) return NextResponse.json({ error: "Só a gestão (ou quem atende) escolhe quem atende" }, { status: 403 });
  if (!gerir && p.nucleoId !== undefined) return NextResponse.json({ error: "Só a gestão escolhe o núcleo" }, { status: 403 });
  if (p.nucleoId && !(await prisma.nucleo.count({ where: { id: p.nucleoId } }))) return NextResponse.json({ error: "Núcleo não encontrado" }, { status: 404 });
  if (!gerir && (p.status !== undefined || p.motivoRecusa !== undefined)) return NextResponse.json({ error: "Só a gestão muda a situação" }, { status: 403 });
  if (p.status === "EM_PROJETO" && !d.projectId && !d.anexadaProjectId) return NextResponse.json({ error: "Para colocar em projeto, use “Abrir projeto”" }, { status: 422 });
  if (p.status === "RECUSADA" && !(p.motivoRecusa ?? d.motivoRecusa)) return NextResponse.json({ error: "Informe o motivo da recusa" }, { status: 422 });

  let novosAtendentes: string[] = [];
  if (p.atendentes !== undefined) {
    const pedidos = Array.from(new Set(p.atendentes));
    const validos = await pessoasValidas(pedidos);
    if (validos.length !== pedidos.length) return NextResponse.json({ error: "Escolha só pessoas ativas do sistema" }, { status: 422 });
    const antes = new Set(d.atendentes.map((a) => a.user.id));
    novosAtendentes = validos.filter((id) => !antes.has(id));
    await prisma.$transaction([
      prisma.demandaAtendente.deleteMany({ where: { demandaId: params.id, userId: { notIn: validos } } }),
      ...(novosAtendentes.length ? [prisma.demandaAtendente.createMany({ data: novosAtendentes.map((userId) => ({ demandaId: params.id, userId })), skipDuplicates: true })] : []),
    ]);
    await avisarPessoas(novosAtendentes.filter((id) => id !== u.id), { title: "Demanda para você", body: `${d.titulo} · ${d.contrato.nome}`, link: `/projetos/demandas/${params.id}` }).catch(() => {});
  }
  const atual = await prisma.demanda.update({
    where: { id: params.id },
    data: {
      ...(p.titulo !== undefined && { titulo: p.titulo }),
      ...(p.descricao !== undefined && { descricao: p.descricao }),
      ...(p.prioridade !== undefined && { prioridade: p.prioridade }),
      ...(p.prazoDesejado !== undefined && { prazoDesejado: p.prazoDesejado ? new Date(`${p.prazoDesejado.slice(0, 10)}T00:00:00.000Z`) : null }),
      ...(p.status !== undefined && { status: p.status }),
      ...(p.motivoRecusa !== undefined && { motivoRecusa: p.motivoRecusa }),
      ...(p.nucleoId !== undefined && { nucleoId: p.nucleoId || null }),
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(atual);
}
