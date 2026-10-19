import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { podeGerirDemandas, podeVerDemanda } from "@/lib/demandas";
import { z } from "zod";

async function carregar(id: string, itemId: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const u = session.user as any;
  const item = await prisma.demandaItem.findUnique({ where: { id: itemId }, include: { demanda: { select: { id: true, status: true, solicitanteId: true, projectId: true, contrato: { select: { codccu: true } } } } } });
  if (!item || item.demandaId !== id) return { erro: NextResponse.json({ error: "Item não encontrado" }, { status: 404 }) };
  if (!(await podeVerDemanda(u, item.demanda))) return { erro: NextResponse.json({ error: "Sem permissão" }, { status: 403 }) };
  const gerir = await podeGerirDemandas(u);
  const dono = item.demanda.solicitanteId === u.id && item.demanda.status === "NOVA";
  return { item, gerir, dono };
}

const schema = z.object({ texto: z.string().trim().min(1).max(300).optional(), concluido: z.boolean().optional() });

export async function PATCH(req: Request, { params }: { params: { id: string; itemId: string } }) {
  const c = await carregar(params.id, params.itemId);
  if (c.erro) return c.erro;
  const parsed = schema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  if (!c.gerir && !c.dono) return NextResponse.json({ error: "Somente a gestão (ou quem pediu, enquanto a demanda é nova) altera a lista" }, { status: 403 });
  const item = await prisma.demandaItem.update({ where: { id: params.itemId }, data: parsed.data });
  // com projeto aberto, concluir o item conclui a tarefa correspondente (e vice-versa e' feito no projeto)
  if (parsed.data.concluido !== undefined && item.taskId) await prisma.task.update({ where: { id: item.taskId }, data: { status: parsed.data.concluido ? "FEITO" : "A_FAZER" } }).catch(() => {});
  return NextResponse.json(item);
}

export async function DELETE(_req: Request, { params }: { params: { id: string; itemId: string } }) {
  const c = await carregar(params.id, params.itemId);
  if (c.erro) return c.erro;
  if (!c.gerir && !c.dono) return NextResponse.json({ error: "Somente a gestão (ou quem pediu, enquanto a demanda é nova) altera a lista" }, { status: 403 });
  if (c.item.taskId) return NextResponse.json({ error: "Este item já virou tarefa do projeto: remova a tarefa no projeto" }, { status: 409 });
  await prisma.demandaItem.delete({ where: { id: params.itemId } });
  return NextResponse.json({ ok: true });
}
