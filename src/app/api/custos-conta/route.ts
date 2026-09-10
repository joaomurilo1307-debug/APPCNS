import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Custo por plano de contas (conta_financeira), por contrato/CCU e mes.
// Visibilidade: ADMIN/DIRETOR veem todos os contratos; qualquer outro
// usuario ve so os contratos (equipes) das quais participa -- membro ou
// gestor, tanto faz, o que importa e estar na equipe daquele CCU.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const user = session.user as any;
  const vePodeTudo = ["ADMIN", "DIRETOR"].includes(user.role);

  let teamIdsPermitidos: string[] | null = null; // null = sem restricao
  if (!vePodeTudo) {
    const minhasEquipes = await prisma.userTeam.findMany({ where: { userId: user.id }, select: { teamId: true } });
    teamIdsPermitidos = minhasEquipes.map((e) => e.teamId);
    if (teamIdsPermitidos.length === 0) {
      return NextResponse.json({ contratos: [] });
    }
  }

  const registros = await prisma.custoContaFinanceira.findMany({
    where: teamIdsPermitidos ? { teamId: { in: teamIdsPermitidos } } : undefined,
    include: { team: { select: { id: true, name: true, projects: { select: { id: true, name: true }, take: 1 } } } },
    orderBy: [{ competencia: "desc" }],
  });

  // agrupa por CCU -> conta financeira, com serie mensal
  type Grupo = {
    codccu: string;
    contrato: string;
    teamId: string | null;
    teamName: string | null;
    projectName: string | null;
    totalGeral: number;
    ultimaCompetencia: string | null;
    contas: Map<string, { contaFinanceira: string; total: number; meses: { competencia: string; valor: number }[] }>;
  };
  const porContrato = new Map<string, Grupo>();

  for (const r of registros) {
    let g = porContrato.get(r.codccu);
    if (!g) {
      g = {
        codccu: r.codccu,
        contrato: r.contrato,
        teamId: r.team?.id ?? null,
        teamName: r.team?.name ?? null,
        projectName: r.team?.projects?.[0]?.name ?? null,
        totalGeral: 0,
        ultimaCompetencia: null,
        contas: new Map(),
      };
      porContrato.set(r.codccu, g);
    }
    g.totalGeral += r.valor;
    const compIso = r.competencia.toISOString();
    if (!g.ultimaCompetencia || compIso > g.ultimaCompetencia) g.ultimaCompetencia = compIso;

    let c = g.contas.get(r.contaFinanceira);
    if (!c) {
      c = { contaFinanceira: r.contaFinanceira, total: 0, meses: [] };
      g.contas.set(r.contaFinanceira, c);
    }
    c.total += r.valor;
    c.meses.push({ competencia: compIso, valor: r.valor });
  }

  const contratos = Array.from(porContrato.values())
    .map((g) => ({
      codccu: g.codccu,
      contrato: g.contrato,
      teamId: g.teamId,
      teamName: g.teamName,
      projectName: g.projectName,
      totalGeral: g.totalGeral,
      ultimaCompetencia: g.ultimaCompetencia,
      contas: Array.from(g.contas.values())
        .sort((a, b) => b.total - a.total)
        .map((c) => ({ ...c, meses: c.meses.sort((a, b) => a.competencia.localeCompare(b.competencia)) })),
    }))
    .sort((a, b) => b.totalGeral - a.totalGeral);

  return NextResponse.json({ contratos });
}
