import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const produtoId = searchParams.get("produtoId") || undefined;
  const contratoId = searchParams.get("contratoId") || undefined;
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10) || 50, 200);

  const movimentacoes = await prisma.epiMovimentacao.findMany({
    where: { ...(produtoId ? { produtoId } : {}), ...(contratoId ? { contratoId } : {}) },
    include: {
      produto: { select: { id: true, nome: true, unidade: true } },
      contrato: { select: { id: true, codigo: true, nome: true } },
      colaborador: { select: { id: true, nomeCompleto: true } },
      registradoPor: { select: { id: true, name: true } },
    },
    orderBy: { data: "desc" },
    take: limit,
  });
  return NextResponse.json(movimentacoes);
}

const createSchema = z.object({
  tipo: z.enum(["ENTRADA", "SAIDA"]),
  produtoId: z.string().min(1),
  contratoId: z.string().min(1),
  colaboradorId: z.string().nullable().optional(),
  quantidade: z.number().int().positive(),
  observacao: z.string().nullable().optional(),
  data: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const movimentacao = await prisma.epiMovimentacao.create({
    data: {
      ...parsed.data,
      data: parsed.data.data ? new Date(parsed.data.data) : undefined,
      registradoPorId: userId,
    },
    include: {
      produto: { select: { id: true, nome: true, unidade: true } },
      contrato: { select: { id: true, codigo: true } },
      colaborador: { select: { id: true, nomeCompleto: true } },
    },
  });
  return NextResponse.json(movimentacao, { status: 201 });
}
