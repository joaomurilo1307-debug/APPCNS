import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listaEstoqueComCalculo } from "@/lib/epi";
import { z } from "zod";

// Estoque atual nunca é guardado direto — é sempre estoqueInicial + entradas - saídas,
// calculado em src/lib/epi.ts em cima do histórico real de EpiMovimentacao (mesmo
// princípio da planilha Excel de Controle de Estoque Mínimo, aba Estoque em Campo).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contratoParam = searchParams.get("contratoId"); // "geral" | id | ausente (todos)

  const where =
    contratoParam === "geral" ? { contratoId: null } : contratoParam ? { contratoId: contratoParam } : {};

  const result = await listaEstoqueComCalculo(where);
  return NextResponse.json(result);
}

const createSchema = z.object({
  produtoId: z.string().min(1),
  contratoId: z.string().nullable().optional(),
  estoqueInicial: z.number().int().default(0),
  estoqueMinimo: z.number().default(0),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const estoque = await prisma.epiEstoque.upsert({
    where: { contratoId_produtoId: { contratoId: parsed.data.contratoId ?? null, produtoId: parsed.data.produtoId } },
    update: { estoqueInicial: parsed.data.estoqueInicial, estoqueMinimo: parsed.data.estoqueMinimo },
    create: parsed.data,
  });
  return NextResponse.json(estoque, { status: 201 });
}
