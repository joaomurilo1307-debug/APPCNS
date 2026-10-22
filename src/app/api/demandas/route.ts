import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contratosDoUsuario, ehCliente, PRIORIDADES, STATUS_DEMANDA } from "@/lib/demandas";
import { nucleoIdsQueGere } from "@/lib/permissions";
import { z } from "zod";

const resumo = {
  id: true, titulo: true, status: true, prioridade: true, prazoDesejado: true, createdAt: true, updatedAt: true, projectId: true,
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
  where.AND.push(alvo.todos ? {} : { OR: [{ contrato: { codccu: { in: Array.from(alvo.ccus) } } }, { solicitanteId: u.id }, ...(meusNucleos.length ? [{ nucleoId: { in: meusNucleos } }] : [])] });
  if (status && (STATUS_DEMANDA as readonly string[]).includes(status)) where.AND.push({ status });
  if (codccu) where.AND.push({ contrato: { codccu } });
  if (nucleo) where.AND.push({ nucleoId: nucleo });

  const lista = await prisma.demanda.findMany({ where, select: resumo, orderBy: { createdAt: "desc" }, take: 300 });
  return NextResponse.json({
    demandas: lista.map(({ itens, project, ...d }) => {
      const t = project?.tasks ?? [];
      return { ...d, itensTotal: itens.length, itensFeitos: itens.filter((i) => i.concluido).length, andamento: t.length ? Math.round((t.filter((x) => x.status === "FEITO").length / t.length) * 100) : null, projetoStatus: project?.status ?? null };
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

  const contrato = await prisma.contrato.findUnique({ where: { codccu: d.contrato }, select: { id: true, codccu: true } });
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const alvo = await contratosDoUsuario(u);
  if (!alvo.todos && !alvo.ccus.has(contrato.codccu)) return NextResponse.json({ error: ehCliente(u) ? "Você não está ligado a este contrato" : "Sem acesso a este contrato" }, { status: 403 });

  if (d.nucleoId) {
    if (ehCliente(u)) return NextResponse.json({ error: "O contratante não escolhe o núcleo" }, { status: 403 });
    if (!(await prisma.nucleo.count({ where: { id: d.nucleoId } }))) return NextResponse.json({ error: "Núcleo não encontrado" }, { status: 404 });
  }

  const demanda = await prisma.demanda.create({
    data: {
      nucleoId: d.nucleoId || null,
      titulo: d.titulo, descricao: d.descricao || null, contratoId: contrato.id, solicitanteId: u.id, prioridade: d.prioridade ?? "NORMAL",
      prazoDesejado: d.prazoDesejado ? new Date(`${d.prazoDesejado.slice(0, 10)}T00:00:00.000Z`) : null,
      itens: { create: (d.itens ?? []).map((texto, i) => ({ texto, ordem: i })) },
    },
    select: { id: true },
  });
  return NextResponse.json({ id: demanda.id }, { status: 201 });
}
