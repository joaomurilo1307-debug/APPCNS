import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const contratoId = searchParams.get("contratoId") || undefined;

  const regras = await prisma.epiFuncaoRegra.findMany({
    where: contratoId ? { contratoId } : {},
    include: { contrato: { select: { id: true, codigo: true, nome: true } } },
    orderBy: [{ funcao: "asc" }, { categoria: "asc" }],
  });
  return NextResponse.json(regras);
}

const createSchema = z.object({
  contratoId: z.string().min(1),
  funcao: z.string().min(1),
  categoria: z.string().min(1),
  descricao: z.string().min(1),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const regra = await prisma.epiFuncaoRegra.upsert({
    where: {
      contratoId_funcao_categoria: {
        contratoId: parsed.data.contratoId,
        funcao: parsed.data.funcao.trim(),
        categoria: parsed.data.categoria.trim(),
      },
    },
    update: { descricao: parsed.data.descricao },
    create: {
      contratoId: parsed.data.contratoId,
      funcao: parsed.data.funcao.trim(),
      categoria: parsed.data.categoria.trim(),
      descricao: parsed.data.descricao,
    },
  });
  return NextResponse.json(regra, { status: 201 });
}
