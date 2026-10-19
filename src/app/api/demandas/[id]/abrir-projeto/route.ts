import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { podeGerirDemandas } from "@/lib/demandas";
import { z } from "zod";

// A gestao abre um PROJETO a partir da demanda: o projeto nasce com o titulo/descricao dela, cada item da lista vira uma tarefa (para delegar,
// dividir em subtarefas e executar) e o contratante (e quem pediu) passa a acompanhar o andamento no portal, em leitura.
const schema = z.object({ teamId: z.string().min(1), nome: z.string().trim().min(2).max(150).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (!(await podeGerirDemandas(u))) return NextResponse.json({ error: "Só a gestão abre projeto a partir de uma demanda" }, { status: 403 });
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const d = await prisma.demanda.findUnique({
    where: { id: params.id },
    include: { itens: { orderBy: { ordem: "asc" } }, contrato: { select: { id: true, codccu: true, nome: true } }, solicitante: { select: { id: true, role: true } } },
  });
  if (!d) return NextResponse.json({ error: "Demanda não encontrada" }, { status: 404 });
  if (d.projectId) return NextResponse.json({ error: "Esta demanda já virou projeto" }, { status: 409 });
  if (d.status === "RECUSADA" || d.status === "CONCLUIDA") return NextResponse.json({ error: "Reabra a demanda (Nova ou Em análise) antes de abrir o projeto" }, { status: 409 });
  if (!(await canManageTeam(u.id, u.role, parsed.data.teamId))) return NextResponse.json({ error: "Só o gestor da equipe (ou um admin) abre projeto nela" }, { status: 403 });

  const clientes = await prisma.contratoUsuario.findMany({ where: { contratoId: d.contrato.id }, select: { userId: true } });
  const donosCliente = new Set(clientes.map((c) => c.userId));
  if (d.solicitante.role === "CLIENTE") donosCliente.add(d.solicitanteId);

  const projeto = await prisma.$transaction(async (tx) => {
    const p = await tx.project.create({
      data: {
        name: parsed.data.nome ?? d.titulo,
        description: [d.descricao, `Origem: demanda para o contrato ${d.contrato.nome} (CCU ${d.contrato.codccu}).`].filter(Boolean).join("\n\n"),
        teamId: parsed.data.teamId, ownerId: u.id, status: "PLANEJADO",
        endDate: d.prazoDesejado ?? undefined,
      },
    });
    if (donosCliente.size) await tx.projectClient.createMany({ data: Array.from(donosCliente).map((userId) => ({ projectId: p.id, userId })), skipDuplicates: true });
    for (const [i, item] of d.itens.entries()) {
      const t = await tx.task.create({ data: { title: item.texto, projectId: p.id, order: i, status: item.concluido ? "FEITO" : "A_FAZER" } });
      await tx.demandaItem.update({ where: { id: item.id }, data: { taskId: t.id } });
    }
    await tx.demanda.update({ where: { id: d.id }, data: { projectId: p.id, status: "EM_PROJETO" } });
    await tx.demandaComentario.create({ data: { demandaId: d.id, autorId: u.id, texto: `Projeto “${p.name}” aberto a partir desta demanda.`, interno: false } });
    return p;
  });
  return NextResponse.json({ projectId: projeto.id }, { status: 201 });
}
