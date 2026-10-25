import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { COMPETENCIA_FISCAL_ATIVA } from "@/lib/custos/competenciaDaPlanilha";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
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
  const porCompetencia = COMPETENCIA_FISCAL_ATIVA && searchParams.get("base") === "competencia"; // periodo pelo mes da nota em vez do mes do pagamento
  if (!codccu || !de || !ate || !/^\d{4}-\d{2}$/.test(de) || !/^\d{4}-\d{2}$/.test(ate)) {
    return NextResponse.json({ error: "codccu, de e ate (aaaa-mm) são obrigatórios" }, { status: 422 });
  }

  const escopo = await escopoDeCustos(prisma, user);
  // `codccu` pode ser um CCU, uma lista separada por virgula (os centros de custo que a pessoa esta vendo) ou "todos"
  const lista = codccu === "todos" ? null : codccu.split(",").map((c) => c.trim()).filter(Boolean);
  if (lista && (lista.length === 0 || lista.length > 300 || lista.some((c) => !/^\d+$/.test(c)))) {
    return NextResponse.json({ error: "Lista de centros de custo inválida" }, { status: 422 });
  }
  if (!lista) {
    if (!escopo.todos) return NextResponse.json({ error: "Sem permissão para exportar todos os centros de custo" }, { status: 403 });
  } else if (!lista.every((c) => podeVerCcu(escopo, c))) {
    return NextResponse.json({ error: "Sem permissão para algum destes centros de custo" }, { status: 403 });
  }

  const faixa = { gte: new Date(`${de}-01T00:00:00.000Z`), lte: new Date(`${ate}-01T00:00:00.000Z`) };
  const linhas = await prisma.custoFinanceiroDetalhe.findMany({
    where: {
      ...(lista ? { codccu: { in: lista } } : escopo.ocultos.size > 0 ? { codccu: { notIn: Array.from(escopo.ocultos) } } : {}),
      ...(porCompetencia ? { OR: [{ competenciaNota: faixa }, { competenciaNota: null, competencia: faixa }] } : { competencia: faixa }),
    },
    orderBy: [{ codccu: "asc" }, { competencia: "asc" }, { contaFinanceira: "asc" }, { valorRateado: "desc" }],
  });
  const nomes = await prisma.custoContaFinanceira.findMany({ distinct: ["codccu"], select: { codccu: true, contrato: true } });
  const nomePorCcu = new Map(nomes.map((n) => [n.codccu, n.contrato]));

  return NextResponse.json({
    total: linhas.reduce((s, l) => s + l.valorRateado, 0),
    linhas: linhas.map((l) => ({
      codccu: l.codccu,
      centroDeCusto: nomePorCcu.get(l.codccu) ?? `CCU ${l.codccu}`,
      competencia: (porCompetencia ? l.competenciaNota ?? l.competencia : l.competencia).toISOString().slice(0, 7), // mes pela base escolhida
      mesPagamento: l.competencia.toISOString().slice(0, 7),
      competenciaNota: l.competenciaNota?.toISOString().slice(0, 7) ?? null,
      dataPagamento: l.dataPagamento?.toISOString().slice(0, 10) ?? null,
      formaBaixa: l.baixa === "ADIANTAMENTO" ? "adiantamento" : l.baixa === "PAGAMENTO" ? "pagamento" : null,
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
