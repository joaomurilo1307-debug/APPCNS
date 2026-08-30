import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const contratos = await prisma.epiContrato.findMany({
    orderBy: { codigo: "asc" },
    include: { _count: { select: { colaboradores: true } } },
  });
  return NextResponse.json(contratos);
}
