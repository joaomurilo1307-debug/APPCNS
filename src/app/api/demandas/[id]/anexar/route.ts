import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/permissions";
import { avisarPessoas, montarTarefaAnexada, pessoasValidas, podeGerirDemandas } from "@/lib/demandas";
import { z } from "zod";

// A gestao (ou quem foi indicado para atender) ACEITA a demanda anexando-a a um projeto que ja existe: ela vira uma tarefa do projeto, ou uma
// SUBTAREFA de uma tarefa que ja existe, e cada item da lista vira subtarefa dela. Quem pediu acompanha o andamento pela propria demanda.
const schema = z.object({ projectId: z.string().min(1), parentTaskId: z.string().nullable().optional(), executorId: z.string().nullable().optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { projectId, parentTaskId, executorId } = parsed.data;

  const d = await prisma.demanda.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: { ordem: "asc" } }, contrato: { select: { nome: true, codccu: true } }, solicitante: { select: { name: true } } },
  });
  if (!d) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
  if (!(await podeGerirDemandas(u, d.nucleoId, d.id))) return NextResponse.json({ error: "Só a gestão (ou quem atende a demanda) anexa a um projeto" }, { status: 403 });
  if (d.projectId || d.anexadaProjectId) return NextResponse.json({ error: "Esta demanda já está ligada a um projeto" }, { status: 409 });
  if (d.status === "RECUSADA" || d.status === "CONCLUIDA") return NextResponse.json({ error: "Reabra a demanda (Nova ou Em análise) antes de anexar" }, { status: 409 });

  const projeto = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  if (!(await canViewProject(u.id, u.role, projeto.id))) return NextResponse.json({ error: "Você não vê este projeto" }, { status: 403 });
  const pai = parentTaskId ? await prisma.task.findFirst({ where: { id: parentTaskId, projectId: projeto.id }, select: { id: true, title: true } }) : null;
  if (parentTaskId && !pai) return NextResponse.json({ error: "A tarefa escolhida não é deste projeto" }, { status: 422 });
  let executor: string | null = null;
  if (executorId) {
    executor = (await pessoasValidas([executorId]))[0] ?? null;
    if (!executor) return NextResponse.json({ error: "Escolha um executor ativo do sistema" }, { status: 422 });
  }

  const modelo = montarTarefaAnexada(d);
  const resultado = await prisma.$transaction(async (tx) => {
    const max = await tx.task.aggregate({ where: { projectId: projeto.id }, _max: { order: true } });
    const tarefa = await tx.task.create({
      data: { title: modelo.title, description: modelo.description, priority: modelo.priority, dueDate: modelo.dueDate, projectId: projeto.id, parentTaskId: pai?.id ?? null, assigneeId: executor, order: (max._max.order ?? 0) + 1 },
    });
    for (const [i, item] of d.itens.entries()) {
      const s = modelo.subtarefas[i];
      const filha = await tx.task.create({ data: { title: s.title, projectId: projeto.id, parentTaskId: tarefa.id, order: s.ordem, status: s.status, assigneeId: executor } });
      await tx.demandaItem.update({ where: { id: item.id }, data: { taskId: filha.id } });
    }
    await tx.demanda.update({ where: { id: d.id }, data: { anexadaProjectId: projeto.id, anexadaTaskId: tarefa.id, status: "EM_PROJETO" } });
    await tx.demandaComentario.create({
      data: { demandaId: d.id, autorId: u.id, interno: false, texto: `Demanda aceita e anexada ao projeto “${projeto.name}” como ${pai ? `subtarefa de “${pai.title}”` : "tarefa"}.` },
    });
    return { taskId: tarefa.id };
  });
  if (executor && executor !== u.id) await avisarPessoas([executor], { title: "Tarefa para você (demanda)", body: `${d.titulo} · projeto ${projeto.name}`, link: `/projetos/${projeto.id}` }).catch(() => {});
  return NextResponse.json({ projectId: projeto.id, taskId: resultado.taskId }, { status: 201 });
}
