import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();

  const produtos = await prisma.epiProduto.findMany({
    where: q ? { nome: { contains: q, mode: "insensitive" } } : {},
    orderBy: { nome: "asc" },
  });
  return NextResponse.json(produtos);
}

const createSchema = z.object({
  nome: z.string().min(1),
  tipo: z.enum(["EPI", "EPC", "FARDAMENTO"]).default("EPI"),
  categoria: z.string().nullable().optional(),
  ca: z.string().nullable().optional(),
  tamanho: z.string().nullable().optional(),
  unidade: z.string().default("UNID"),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const produto = await prisma.epiProduto.create({ data: { ...parsed.data, tamanho: parsed.data.tamanho ?? null } });
  return NextResponse.json(produto, { status: 201 });
}
