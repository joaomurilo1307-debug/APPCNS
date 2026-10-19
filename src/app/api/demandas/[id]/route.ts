import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { ehCliente, podeGerirDemandas, podeVerDemanda, PRIORIDADES, STATUS_DEMANDA } from "@/lib/demandas";
import { z } from "zod";

async function carregar(id: string) {
  return prisma.demanda.findUnique({
    where: { id },
    include: {
      contrato: { select: { codccu: true, nome: true, cliente: true } },
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
  return NextResponse.json({
    demanda: {
      ...d,
      comentarios: d.comentarios.filter((c) => !cliente || !c.interno),
      project: d.project ? { ...d.project, tasks: tarefas.map((t) => ({ id: t.id, title: t.title, status: t.status, dueDate: t.dueDate, parentTaskId: t.parentTaskId, responsavel: cliente ? null : t.assignee?.name ?? null })), andamento: tarefas.length ? Math.round((tarefas.filter((t) => t.status === "FEITO").length / tarefas.length) * 100) : 0 } : null,
    },
    podeGerir: await podeGerirDemandas(u),
    souSolicitante: d.solicitanteId === u.id,
  });
}

const patchSchema = z.object({
  titulo: z.string().trim().min(3).max(160).optional(),
  descricao: z.string().trim().max(4000).nullable().optional(),
  prioridade: z.enum(PRIORIDADES).optional(),
  prazoDesejado: z.string().nullable().optional(),
  status: z.enum(STATUS_DEMANDA).optional(),
  motivoRecusa: z.string().trim().max(2000).nullable().optional(),
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
  const gerir = await podeGerirDemandas(u);
  const dono = d.solicitanteId === u.id;
  // quem pediu pode ajustar titulo/descricao/prioridade/prazo enquanto a demanda esta NOVA; situacao so' a gestao
  if (!gerir && !(dono && d.status === "NOVA")) return NextResponse.json({ error: "Só a gestão altera esta demanda" }, { status: 403 });
  if (!gerir && (p.status !== undefined || p.motivoRecusa !== undefined)) return NextResponse.json({ error: "Só a gestão muda a situação" }, { status: 403 });
  if (p.status === "EM_PROJETO" && !d.projectId) return NextResponse.json({ error: "Para colocar em projeto, use “Abrir projeto”" }, { status: 422 });
  if (p.status === "RECUSADA" && !(p.motivoRecusa ?? d.motivoRecusa)) return NextResponse.json({ error: "Informe o motivo da recusa" }, { status: 422 });

  const atual = await prisma.demanda.update({
    where: { id: params.id },
    data: {
      ...(p.titulo !== undefined && { titulo: p.titulo }),
      ...(p.descricao !== undefined && { descricao: p.descricao }),
      ...(p.prioridade !== undefined && { prioridade: p.prioridade }),
      ...(p.prazoDesejado !== undefined && { prazoDesejado: p.prazoDesejado ? new Date(`${p.prazoDesejado.slice(0, 10)}T00:00:00.000Z`) : null }),
      ...(p.status !== undefined && { status: p.status }),
      ...(p.motivoRecusa !== undefined && { motivoRecusa: p.motivoRecusa }),
    },
    select: { id: true, status: true },
  });
  return NextResponse.json(atual);
}
