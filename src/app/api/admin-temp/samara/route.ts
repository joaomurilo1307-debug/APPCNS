import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ROTA TEMPORARIA (19/10/2026), protegida por x-sync-key. GET = busca usuarios por nome (somente leitura). Sera removida apos o uso.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const usuarios = await prisma.user.findMany({
    where: { name: { contains: q, mode: "insensitive" } },
    select: { id: true, name: true, email: true, role: true, active: true, nivelHierarquico: true, cargo: true, verTodosCustos: true, nucleo: { select: { name: true } }, teams: { select: { role: true, team: { select: { name: true } } } }, acessosCentroCusto: { select: { codccu: true } }, passwordHash: false },
    take: 15,
  });
  return NextResponse.json({ q, usuarios: usuarios.map((u) => ({ ...u, nucleo: u.nucleo?.name ?? null, teams: u.teams.map((t) => `${t.team.name} (${t.role})`), acessosCentroCusto: u.acessosCentroCusto.map((a) => a.codccu) })) });
}
