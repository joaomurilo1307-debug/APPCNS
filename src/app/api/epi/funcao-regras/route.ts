import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

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
