import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { contratosDoUsuario, equipesDosNucleos, podeGerirDemandas } from "@/lib/demandas";
import { nucleoIdsQueGere, visibleProjectWhere } from "@/lib/permissions";

// O que a pessoa pode escolher: contratos para ligar a demanda e (para a gestao) as equipes em que pode abrir projeto.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const alvo = await contratosDoUsuario(u);
  const contratos = await prisma.contrato.findMany({
    where: { acompanharResultados: true, ...(alvo.todos ? {} : { codccu: { in: Array.from(alvo.ccus) } }) },
    select: { codccu: true, nome: true, cliente: true },
    orderBy: { nome: "asc" },
  });
  const gerir = await podeGerirDemandas(u);
  // quem foi indicado para atender alguma demanda aberta tambem aceita: anexa a um projeto ou abre um projeto novo nas equipes dele
  const atendeAlguma = u.role === "CLIENTE" ? false : (await prisma.demandaAtendente.count({ where: { userId: u.id, demanda: { status: { in: ["NOVA", "EM_ANALISE"] } } } })) > 0;
  const meusNucleos = u.role === "CLIENTE" ? [] : await nucleoIdsQueGere(u.id);
  const equipesGestor = gerir
    ? await prisma.team.findMany({ where: u.role === "ADMIN" ? {} : { members: { some: { userId: u.id, role: "GESTOR" } } }, select: { id: true, name: true }, orderBy: { name: "asc" } })
    : [];
  // coordenador/gerente de nucleo abre projeto nas equipes que tem gente do nucleo dele
  const equipesMembro = atendeAlguma ? (await prisma.userTeam.findMany({ where: { userId: u.id }, select: { team: { select: { id: true, name: true } } } })).map((m) => m.team) : [];
  const equipes = Array.from(new Map([...equipesGestor, ...equipesMembro, ...(await equipesDosNucleos(meusNucleos))].map((e) => [e.id, e])).values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  // nucleos que podem ser escolhidos ao abrir uma demanda (o contratante nao escolhe)
  const nucleos = u.role === "CLIENTE" ? [] : await prisma.nucleo.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });
  // pessoas que podem ser escolhidas (quem atende, executa ou acompanha) e projetos que a pessoa ve (para anexar uma demanda a um projeto que ja existe)
  const pessoas = u.role === "CLIENTE" ? [] : await prisma.user.findMany({ where: { active: true, anonymizedAt: null, role: { not: "CLIENTE" } }, select: { id: true, name: true, cargo: true, nucleo: { select: { name: true } } }, orderBy: { name: "asc" } });
  const projetos = u.role === "CLIENTE" || !(gerir || atendeAlguma)
    ? []
    : await prisma.project.findMany({ where: { ...(await visibleProjectWhere(u.id, u.role)), status: { not: "CONCLUIDO" } }, select: { id: true, name: true, team: { select: { name: true } } }, orderBy: { name: "asc" }, take: 300 });
  return NextResponse.json({ contratos, equipes, nucleos, pessoas: pessoas.map((p) => ({ id: p.id, name: p.name, cargo: p.cargo, nucleo: p.nucleo?.name ?? null })), projetos: projetos.map((p) => ({ id: p.id, name: p.name, equipe: p.team?.name ?? null })), podeGerir: gerir || atendeAlguma });
}
