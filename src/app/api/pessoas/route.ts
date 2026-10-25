import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Pessoas que podem ser escolhidas para um projeto, equipe ou demanda: ativas, que nao sejam contratante, de TODOS os nucleos
// (nome, cargo e nucleo -- nada de e-mail, ramal ou dado de RH). O contratante nao ve a lista.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role === "CLIENTE") return NextResponse.json([]);
  const pessoas = await prisma.user.findMany({
    where: { active: true, anonymizedAt: null, role: { not: "CLIENTE" } },
    select: { id: true, name: true, cargo: true, nucleo: { select: { name: true } } },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(pessoas.map((p) => ({ id: p.id, name: p.name, cargo: p.cargo, nucleo: p.nucleo?.name ?? null })));
}
