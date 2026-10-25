import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPETENCIA_FISCAL_ATIVA } from "@/lib/custos/competenciaDaPlanilha";
import { aplicarSelecaoAoEscopo, escopoDeCustos, escopoDeVisao, podeVerCcu } from "@/lib/custos/acesso";
import { estadoAtualizacao } from "@/lib/custos/atualizacaoCusto";
import { COMPETENCIA_PISO } from "@/lib/custos/motorCustoContrato";
import { codigoPeloNome, contaInativa, eReembolsavel, grupoDaConta } from "@/lib/custos/planoContas";

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

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const user = session.user as any;
  const { meses: mesesDoPeriodo, mesCorrente } = mesesDoPisoAteHoje();
  const atualizacao = await estadoAtualizacao();

  // quem ve o que: ADMIN/DIRETOR/verTodosCustos veem todos; os demais, os centros de custo que o admin liberou + os das equipes deles
  const escopo = await escopoDeCustos(prisma, user);
  const sp = new URL(req.url).searchParams;
  const ccu = sp.get("ccu");
  if (ccu && !podeVerCcu(escopo, ccu)) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  // Consulta explicita de um contrato preserva seu historico, mesmo fora do consolidado.
  const visao = ccu ? aplicarSelecaoAoEscopo(escopo, [ccu]) : await escopoDeVisao(escopo, { incluirForaDosResultados: sp.get("acompanhamento") === "todos" });
  const ccusPermitidos: string[] | null = visao.todos ? null : Array.from(visao.ccus);
  // quem ve todos tambem nao recebe os contratos ENCERRADOS (so' o administrador os ve)
  const filtroCcu = ccusPermitidos ? { in: ccusPermitidos } : visao.ocultos.size > 0 ? { notIn: Array.from(visao.ocultos) } : undefined;
  const infoEscopo = { tipo: escopo.tipo, quantidade: escopo.quantidade, podeGerenciarAcessos: user.role === "ADMIN" };
  if (ccusPermitidos && ccusPermitidos.length === 0) {
    return NextResponse.json({ contratos: [], meses: mesesDoPeriodo, mesesCompetencia: mesesDoPeriodo, temCompetencia: false, mesCorrente, atualizacao, escopo: infoEscopo });
  }

  const registros = await prisma.custoContaFinanceira.findMany({
    where: filtroCcu ? { codccu: filtroCcu } : undefined,
    include: { team: { select: { id: true, name: true, projects: { select: { id: true, name: true }, take: 1 } } } },
    orderBy: [{ competencia: "desc" }],
  });

  // Serie por COMPETENCIA (mes da nota): o mesmo custo pago, so' que no mes em que a compra foi lancada, e nao no mes em que cada
  // parcela foi paga. Sai do detalhe titulo a titulo (CustoFinanceiroDetalhe.competenciaNota); linha sem competencia da nota
  // (gravada antes da regra v2) usa o mes do pagamento. Mesma permissao: so' os CCUs que a pessoa ve.
  const ccusVisiveis = ccusPermitidos;
  const porCompetencia = new Map<string, Map<string, number>>(); // "ccu|conta" -> (mes -> valor)
  let temCompetencia = false;
  const grupos = await prisma.custoFinanceiroDetalhe.groupBy({
    by: ["codccu", "contaFinanceira", "competencia", "competenciaNota"],
    where: filtroCcu ? { codccu: filtroCcu } : undefined,
    _sum: { valorRateado: true },
  });
  for (const g of grupos) {
    if (COMPETENCIA_FISCAL_ATIVA && g.competenciaNota) temCompetencia = true;
    const mes = (COMPETENCIA_FISCAL_ATIVA ? g.competenciaNota ?? g.competencia : g.competencia).toISOString().slice(0, 7) + "-01T00:00:00.000Z";
    const k = `${g.codccu}|${g.contaFinanceira}`;
    const m = porCompetencia.get(k) ?? new Map<string, number>();
    m.set(mes, Math.round(((m.get(mes) ?? 0) + (g._sum.valorRateado ?? 0)) * 100) / 100);
    porCompetencia.set(k, m);
  }

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
          const comp = porCompetencia.get(`${g.codccu}|${c.contaFinanceira}`);
          return {
            ...c,
            mesesCompetencia: comp ? Array.from(comp.entries()).map(([competencia, valor]) => ({ competencia, valor })).sort((a, b) => a.competencia.localeCompare(b.competencia)) : undefined,
            codigo,
            grupoCodigo: grupo.codigo,
            grupoNome: grupo.nome,
            reembolsavel: codigo !== null && eReembolsavel(codigo),
            inativa: codigo !== null && contaInativa(codigo),
            meses: c.meses.sort((a, b) => a.competencia.localeCompare(b.competencia)),
          };
        }),
    }))
    .sort((a, b) => b.totalGeral - a.totalGeral);

  // meses disponiveis pro seletor: do piso ate o mes corrente (mesmo que ainda nao tenha custo), do mais novo ao mais antigo
  const comCusto = registros.map((r) => r.competencia.toISOString());
  const meses = Array.from(new Set([...mesesDoPeriodo, ...comCusto])).sort((a, b) => b.localeCompare(a));
  // meses da visao por competencia: podem comecar antes do piso (nota de dez/25 paga em jan/26)
  const mesesCompetencia = Array.from(new Set([...mesesDoPeriodo, ...Array.from(porCompetencia.values()).flatMap((m) => Array.from(m.keys()))])).sort((a, b) => b.localeCompare(a));

  return NextResponse.json({ contratos, meses, mesesCompetencia, temCompetencia, mesCorrente, atualizacao, escopo: infoEscopo });
}
