import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { acharSeniorPorEmail } from "../../../../../prisma/achar-senior";

// Busca de usuarios do Senior (UsuarioSenior) para a tela Usuarios > Acesso: o admin procura pelo login ou pelo codigo e escolhe. Mostra quem
// mais ja usa o mesmo codigo (ex.: uma pessoa que trabalha com o login de outra), porque o mesmo codigo pode valer para mais de uma pessoa.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") return NextResponse.json({ error: "Só administradores" }, { status: 403 });

  const params = new URL(req.url).searchParams;
  // ?email=: o login do Senior igual a parte do e-mail antes do @ (so' quando ha exatamente um)
  const email = (params.get("email") ?? "").trim();
  if (email) {
    const achado = acharSeniorPorEmail(email, await prisma.usuarioSenior.findMany({ select: { codigo: true, nome: true } }));
    if (!achado) return NextResponse.json({ porEmail: null });
    const usados = await prisma.vinculoSenior.findMany({ where: { codigo: achado.codigo }, select: { user: { select: { name: true, email: true } } } });
    return NextResponse.json({ porEmail: { ...achado, usadoPor: usados.filter((v) => v.user.email.toLowerCase() !== email.toLowerCase()).map((v) => v.user.name) } });
  }
  const q = (params.get("q") ?? "").trim();
  const achados = await prisma.usuarioSenior.findMany({
    where: q ? { OR: [{ nome: { contains: q, mode: "insensitive" } }, { codigo: { startsWith: q } }] } : {},
    select: { codigo: true, nome: true },
    orderBy: { nome: "asc" },
    take: 30,
  });
  const vinculos = achados.length
    ? await prisma.vinculoSenior.findMany({ where: { codigo: { in: achados.map((a) => a.codigo) } }, select: { codigo: true, user: { select: { name: true } } } })
    : [];
  return NextResponse.json({
    resultados: achados.map((a) => ({ codigo: a.codigo, nome: a.nome, usadoPor: vinculos.filter((v) => v.codigo === a.codigo).map((v) => v.user.name) })),
  });
}
