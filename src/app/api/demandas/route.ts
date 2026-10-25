import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { avisarPessoas, contratosDoUsuario, ehCliente, pessoasValidas, PRIORIDADES, STATUS_DEMANDA } from "@/lib/demandas";
import { nucleoIdsQueGere } from "@/lib/permissions";
import { z } from "zod";

const resumo = {
  id: true, titulo: true, status: true, prioridade: true, prazoDesejado: true, createdAt: true, updatedAt: true, projectId: true, anexadaProjectId: true, anexadaTaskId: true,
  atendentes: { select: { user: { select: { id: true, name: true } } } },
  contrato: { select: { codccu: true, nome: true } },
  nucleo: { select: { id: true, name: true } },
  solicitante: { select: { id: true, name: true, role: true } },
  itens: { select: { concluido: true } },
  project: { select: { id: true, status: true, tasks: { select: { status: true } } } },
} as const;

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const codccu = searchParams.get("contrato");
  const nucleo = searchParams.get("nucleo");

  const alvo = await contratosDoUsuario(u);
  const where: any = { AND: [] };
  const meusNucleos = ehCliente(u) ? [] : await nucleoIdsQueGere(u.id);
  where.AND.push(alvo.todos ? {} : { OR: [{ contrato: { codccu: { in: Array.from(alvo.ccus) } } }, { solicitanteId: u.id }, ...(meusNucleos.length ? [{ nucleoId: { in: meusNucleos } }] : []), ...(ehCliente(u) ? [] : [{ atendentes: { some: { userId: u.id } } }])] });
  if (status && (STATUS_DEMANDA as readonly string[]).includes(status)) where.AND.push({ status });
  if (codccu) where.AND.push({ contrato: { codccu } });
  if (nucleo) where.AND.push({ nucleoId: nucleo });

  const lista = await prisma.demanda.findMany({ where, select: resumo, orderBy: { createdAt: "desc" }, take: 300 });
  // demandas anexadas a uma tarefa de projeto que ja existia: o andamento e' o das subtarefas (ou da propria tarefa, se nao houver)
  const idsAnexadas = lista.map((d) => d.anexadaTaskId).filter((x): x is string => !!x);
  const tarefasAnexadas = idsAnexadas.length ? await prisma.task.findMany({ where: { OR: [{ id: { in: idsAnexadas } }, { parentTaskId: { in: idsAnexadas } }] }, select: { id: true, parentTaskId: true, status: true } }) : [];
  const andamentoAnexada = (taskId: string) => {
    const filhas = tarefasAnexadas.filter((t) => t.parentTaskId === taskId);
    if (filhas.length) return Math.round((filhas.filter((x) => x.status === "FEITO").length / filhas.length) * 100);
    const propria = tarefasAnexadas.find((t) => t.id === taskId);
    return propria ? (propria.status === "FEITO" ? 100 : 0) : null;
  };
  return NextResponse.json({
    demandas: lista.map(({ itens, project, atendentes, ...d }) => {
      const t = project?.tasks ?? [];
      const andamento = t.length ? Math.round((t.filter((x) => x.status === "FEITO").length / t.length) * 100) : d.anexadaTaskId ? andamentoAnexada(d.anexadaTaskId) : null;
      return { ...d, atendentes: atendentes.map((a) => a.user), paraMim: atendentes.some((a) => a.user.id === u.id), itensTotal: itens.length, itensFeitos: itens.filter((i) => i.concluido).length, andamento, projetoStatus: project?.status ?? null };
    }),
  });
}

const criarSchema = z.object({
  titulo: z.string().trim().min(3).max(160),
  descricao: z.string().trim().max(4000).optional(),
  contrato: z.string().min(1), // codccu
  prioridade: z.enum(PRIORIDADES).optional(),
  prazoDesejado: z.string().nullable().optional(),
  nucleoId: z.string().nullable().optional(),
  atendentes: z.array(z.string()).max(10).optional(), // pessoas a quem o pedido e' dirigido ("quem vai atender")
  itens: z.array(z.string().trim().min(1).max(300)).max(60).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role === "VISUALIZADOR") return NextResponse.json({ error: "Perfil somente leitura" }, { status: 403 });
  const parsed = criarSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;

  const contrato = await prisma.contrato.findUnique({ where: { codccu: d.contrato }, select: { id: true, codccu: true, nome: true, acompanharResultados: true } });
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const alvo = await contratosDoUsuario(u);
  if (!alvo.todos && !alvo.ccus.has(contrato.codccu)) return NextResponse.json({ error: ehCliente(u) ? "Você não está ligado a este contrato" : "Sem acesso a este contrato" }, { status: 403 });
  if (!contrato.acompanharResultados) return NextResponse.json({ error: "Este contrato está fora dos resultados. Um administrador pode incluí-lo novamente antes de abrir uma nova demanda." }, { status: 422 });

  if (d.nucleoId) {
    if (ehCliente(u)) return NextResponse.json({ error: "O contratante não escolhe o núcleo" }, { status: 403 });
    if (!(await prisma.nucleo.count({ where: { id: d.nucleoId } }))) return NextResponse.json({ error: "Núcleo não encontrado" }, { status: 404 });
  }

  const pedidas = Array.from(new Set(d.atendentes ?? []));
  if (pedidas.length && ehCliente(u)) return NextResponse.json({ error: "O contratante não escolhe quem atende" }, { status: 403 });
  const atendentes = await pessoasValidas(pedidas);
  if (atendentes.length !== pedidas.length) return NextResponse.json({ error: "Escolha só pessoas ativas do sistema" }, { status: 422 });

  const demanda = await prisma.demanda.create({
    data: {
      nucleoId: d.nucleoId || null,
      atendentes: { create: atendentes.map((userId) => ({ userId })) },
      titulo: d.titulo, descricao: d.descricao || null, contratoId: contrato.id, solicitanteId: u.id, prioridade: d.prioridade ?? "NORMAL",
      prazoDesejado: d.prazoDesejado ? new Date(`${d.prazoDesejado.slice(0, 10)}T00:00:00.000Z`) : null,
      itens: { create: (d.itens ?? []).map((texto, i) => ({ texto, ordem: i })) },
    },
    select: { id: true },
  });
  await avisarPessoas(atendentes.filter((id) => id !== u.id), { title: "Demanda para você", body: `${d.titulo} · ${contrato.nome}`, link: `/projetos/demandas/${demanda.id}` }).catch(() => {});
  return NextResponse.json({ id: demanda.id }, { status: 201 });
}
