import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contratosDoUsuario, equipesDosNucleos, podeGerirDemandas } from "@/lib/demandas";
import { nucleoIdsQueGere } from "@/lib/permissions";

// O que a pessoa pode escolher: contratos para ligar a demanda e (para a gestao) as equipes em que pode abrir projeto.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const alvo = await contratosDoUsuario(u);
  const contratos = await prisma.contrato.findMany({
    where: { status: "ATIVO", ...(alvo.todos ? {} : { codccu: { in: Array.from(alvo.ccus) } }) },
    select: { codccu: true, nome: true, cliente: true },
    orderBy: { nome: "asc" },
  });
  const gerir = await podeGerirDemandas(u);
  const meusNucleos = u.role === "CLIENTE" ? [] : await nucleoIdsQueGere(u.id);
  const equipesGestor = gerir
    ? await prisma.team.findMany({ where: u.role === "ADMIN" ? {} : { members: { some: { userId: u.id, role: "GESTOR" } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  // coordenador/gerente de nucleo abre projeto nas equipes que tem gente do nucleo dele
  const equipes = Array.from(new Map([...equipesGestor, ...(await equipesDosNucleos(meusNucleos))].map((e) => [e.id, e])).values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // nucleos que podem ser escolhidos ao abrir uma demanda (o contratante nao escolhe)
  const nucleos = u.role === "CLIENTE" ? [] : await prisma.nucleo.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  return NextResponse.json({ contratos, equipes, nucleos, podeGerir: gerir });
}
