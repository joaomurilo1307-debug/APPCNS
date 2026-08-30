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
  const q = searchParams.get("q")?.trim();

  const colaboradores = await prisma.epiColaborador.findMany({
    where: {
      ...(contratoId ? { contratoId } : {}),
      ...(q
        ? {
            OR: [
              { nomeCompleto: { contains: q, mode: "insensitive" } },
              { funcao: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: { contrato: { select: { id: true, codigo: true, nome: true } } },
    orderBy: { nomeCompleto: "asc" },
  });
  return NextResponse.json(colaboradores);
}

const createSchema = z.object({
  nomeCompleto: z.string().min(1),
  contratoId: z.string().min(1),
  funcao: z.string().min(1),
  situacao: z.string().optional(),
  tamanhoBota: z.number().int().nullable().optional(),
  tamanhoCamisa: z.string().nullable().optional(),
  tamanhoCalca: z.number().int().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const colaborador = await prisma.epiColaborador.create({ data: parsed.data });
  return NextResponse.json(colaborador, { status: 201 });
}
