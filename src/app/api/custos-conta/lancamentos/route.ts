import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { codigoPeloNome } from "@/lib/custos/planoContas";

// Lancamentos (titulo a titulo) de um centro de custo num periodo, no mesmo layout do Rel114 do Senior, para conferir contra a
// planilha da area (Denise): Numero do Titulo, Codigo e Descricao do Fornecedor, Data de Vencimento, Conta Financeira, Centro de
// Custo e Valor Rateio. Mesma regra de visibilidade da tela. `codccu=todos` so' para quem ve tudo (ADMIN/DIRETOR/verTodosCustos).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;

  const { searchParams } = new URL(req.url);
  const codccu = searchParams.get("codccu");
  const de = searchParams.get("de"); // aaaa-mm
  const ate = searchParams.get("ate"); // aaaa-mm
  if (!codccu || !de || !ate || !/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(ate)) {
    return NextResponse.json({ error: "codccu, de e ate (aaaa-mm) são obrigatórios" }, { status: 422 });
  }

  let vePodeTudo = ["ADMIN", "DIRETOR"].includes(user.role);
  if (!vePodeTudo) {
    const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { verTodosCustos: true } });
    vePodeTudo = !!eu?.verTodosCustos;
  }
  if (codccu === "todos") {
    if (!vePodeTudo) return NextResponse.json({ error: "Sem permissão para exportar todos os centros de custo" }, { status: 403 });
  } else if (!vePodeTudo) {
    const time = await prisma.team.findFirst({ where: { codccu }, select: { id: true } });
    const souMembro = time && (await prisma.userTeam.findUnique({ where: { userId_teamId: { userId: user.id, teamId: time.id } } }));
    if (!souMembro) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  }

  const linhas = await prisma.custoFinanceiroDetalhe.findMany({
    where: { ...(codccu === "todos" ? {} : { codccu }), competencia: { gte: new Date(`${de}-01T00:00:00.000Z`), lte: new Date(`${ate}-01T00:00:00.000Z`) } },
    orderBy: [{ codccu: "asc" }, { competencia: "asc" }, { contaFinanceira: "asc" }, { valorRateado: "desc" }],
  });
  const nomes = await prisma.custoContaFinanceira.findMany({ distinct: ["codccu"], select: { codccu: true, contrato: true } });
  const nomePorCcu = new Map(nomes.map((n) => [n.codccu, n.contrato]));

  return NextResponse.json({
    total: linhas.reduce((s, l) => s + l.valorRateado, 0),
    linhas: linhas.map((l) => ({
      codccu: l.codccu,
      centroDeCusto: nomePorCcu.get(l.codccu) ?? `CCU ${l.codccu}`,
      competencia: l.competencia.toISOString().slice(0, 7),
      contaCodigo: codigoPeloNome(l.contaFinanceira),
      contaFinanceira: l.contaFinanceira,
      numTit: l.numTit,
      codFor: l.codFor,
      fornecedor: l.fornecedorNome,
      dataEntrada: l.dataEntrada?.toISOString().slice(0, 10) ?? null,
      dataVencimento: l.dataVencimento?.toISOString().slice(0, 10) ?? null,
      valorRateado: l.valorRateado,
    })),
  });
}
