import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  nome: z.string().min(1).optional(),
  tipo: z.enum(["EPI", "EPC", "FARDAMENTO"]).optional(),
  categoria: z.string().nullable().optional(),
  ca: z.string().nullable().optional(),
  tamanho: z.string().nullable().optional(),
  unidade: z.string().optional(),
  valorUnitario: z.number().nullable().optional(),
  ativo: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const produto = await prisma.epiProduto.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(produto);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  // Se ja tem movimentacao/estoque vinculado, marca inativo em vez de apagar
  // (preserva o historico real de entrada/saida).
  const usado = await prisma.epiMovimentacao.count({ where: { produtoId: params.id } });
  if (usado > 0) {
    const produto = await prisma.epiProduto.update({ where: { id: params.id }, data: { ativo: false } });
    return NextResponse.json({ ...produto, desativadoEmVezDeApagar: true });
  }

  await prisma.epiEstoque.deleteMany({ where: { produtoId: params.id } });
  await prisma.epiProduto.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
