import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listaEstoqueComCalculo } from "@/lib/epi";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const [contratos, colaboradoresAtivos, estoque, ultimasMovimentacoes] = await Promise.all([
    prisma.epiContrato.findMany({ orderBy: { codigo: "asc" } }),
    prisma.epiColaborador.count({ where: { situacao: "ATIVO" } }),
    listaEstoqueComCalculo(),
    prisma.epiMovimentacao.findMany({
      orderBy: { data: "desc" },
      take: 8,
      include: {
        produto: { select: { nome: true, unidade: true } },
        contrato: { select: { codigo: true } },
        colaborador: { select: { nomeCompleto: true } },
      },
    }),
  ]);

  const abaixoMinimo = estoque.filter((e) => e.status === "COMPRAR");
  const necessidadeTotal = estoque.reduce((acc, e) => acc + e.necessidade, 0);

  const porContrato = contratos.map((c) => {
    const itensContrato = estoque.filter((e) => e.contrato?.id === c.id);
    return {
      contrato: c,
      totalItens: itensContrato.length,
      abaixoMinimo: itensContrato.filter((e) => e.status === "COMPRAR").length,
    };
  });

  const porTipo: Record<string, { total: number; abaixoMinimo: number }> = {};
  for (const e of estoque) {
    const tipo = e.produto.tipo;
    porTipo[tipo] ??= { total: 0, abaixoMinimo: 0 };
    porTipo[tipo].total++;
    if (e.status === "COMPRAR") porTipo[tipo].abaixoMinimo++;
  }

  return NextResponse.json({
    totalContratos: contratos.length,
    colaboradoresAtivos,
    totalItensMonitorados: estoque.length,
    itensAbaixoMinimo: abaixoMinimo.length,
    necessidadeTotalCompra: necessidadeTotal,
    porContrato,
    porTipo,
    criticos: abaixoMinimo
      .sort((a, b) => b.necessidade - a.necessidade)
      .slice(0, 12)
      .map((e) => ({
        produto: e.produto.nome,
        contrato: e.contrato?.codigo ?? "Geral",
        estoqueAtual: e.estoqueAtual,
        estoqueMinimo: e.estoqueMinimo,
        necessidade: e.necessidade,
      })),
    ultimasMovimentacoes,
  });
}
