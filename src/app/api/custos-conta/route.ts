import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { estadoAtualizacao } from "@/lib/custos/atualizacaoCusto";
import { COMPETENCIA_PISO } from "@/lib/custos/motorCustoContrato";
import { codigoPeloNome, eReembolsavel, grupoDaConta } from "@/lib/custos/planoContas";

// Custo por plano de contas (conta_financeira), por contrato/CCU e mes.
// Visibilidade: ADMIN/DIRETOR veem todos os contratos; qualquer outro
// usuario ve so os contratos (equipes) das quais participa -- membro ou
// gestor, tanto faz, o que importa e estar na equipe daquele CCU. Excecao:
// `verTodosCustos` (ligado pelo ADMIN na tela de Usuarios) da a mesma
// visao total pra alguem sem precisar virar DIRETOR (ex: gerente que
// precisa ver o custo de toda a empresa, mas continua com o resto do
// acesso do papel dela) -- checado sempre fresco no banco, nao no JWT da
// sessao, pra o ADMIN poder ligar/desligar sem a pessoa ter que logar de novo.

/** Todos os meses do piso (2026-01) ate o mes corrente (fuso de Sao Paulo), em ISO dia 1, do mais novo ao mais antigo. */
function mesesDoPisoAteHoje(): { meses: string[]; mesCorrente: string } {
  const partes = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(new Date()).split("-");
  const mesCorrente = `${partes[0]}-${partes[1]}`;
  const meses: string[] = [];
  let [a, m] = COMPETENCIA_PISO.split("-").map(Number);
  while (`${a}-${String(m).padStart(2, "0")}` <= mesCorrente) {
    meses.push(`${a}-${String(m).padStart(2, "0")}-01T00:00:00.000Z`);
    m++;
    if (m > 12) {
      m = 1;
      a++;
    }
  }
  return { meses: meses.reverse(), mesCorrente: `${mesCorrente}-01T00:00:00.000Z` };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const user = session.user as any;
  let vePodeTudo = ["ADMIN", "DIRETOR"].includes(user.role);
  if (!vePodeTudo) {
    const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { verTodosCustos: true } });
    vePodeTudo = !!eu?.verTodosCustos;
  }

  const { meses: mesesDoPeriodo, mesCorrente } = mesesDoPisoAteHoje();
  const atualizacao = await estadoAtualizacao();

  let teamIdsPermitidos: string[] | null = null; // null = sem restricao
  if (!vePodeTudo) {
    const minhasEquipes = await prisma.userTeam.findMany({ where: { userId: user.id }, select: { teamId: true } });
    teamIdsPermitidos = minhasEquipes.map((e) => e.teamId);
    if (teamIdsPermitidos.length === 0) {
      return NextResponse.json({ contratos: [], meses: mesesDoPeriodo, mesCorrente, atualizacao });
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
      // o nome vem como "190 - NOME": a tela mostra o CCU a parte, entao tira o prefixo repetido
      nome: g.contrato.replace(new RegExp(`^${g.codccu}\\s*-\\s*`), "").trim() || g.contrato,
      teamId: g.teamId,
      teamName: g.teamName,
      projectName: g.projectName,
      totalGeral: g.totalGeral,
      ultimaCompetencia: g.ultimaCompetencia,
      contas: Array.from(g.contas.values())
        .sort((a, b) => b.total - a.total)
        .map((c) => {
          const codigo = codigoPeloNome(c.contaFinanceira);
          const grupo = codigo !== null ? grupoDaConta(codigo) : { codigo: "outros", nome: "Outras contas" };
          return {
            ...c,
            codigo,
            grupoCodigo: grupo.codigo,
            grupoNome: grupo.nome,
            reembolsavel: codigo !== null && eReembolsavel(codigo),
            meses: c.meses.sort((a, b) => a.competencia.localeCompare(b.competencia)),
          };
        }),
    }))
    .sort((a, b) => b.totalGeral - a.totalGeral);

  // meses disponiveis pro seletor: do piso ate o mes corrente (mesmo que ainda nao tenha custo), do mais novo ao mais antigo
  const comCusto = registros.map((r) => r.competencia.toISOString());
  const meses = Array.from(new Set([...mesesDoPeriodo, ...comCusto])).sort((a, b) => b.localeCompare(a));

  return NextResponse.json({ contratos, meses, mesCorrente, atualizacao });
}
