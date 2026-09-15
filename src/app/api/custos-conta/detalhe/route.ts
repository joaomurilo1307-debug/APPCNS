import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo } from "@/lib/vinculoOcTitulo";

// Detalhe titulo-a-titulo de UMA linha de Custo por Plano de Contas (um
// codccu+contaFinanceira+competencia), com a OC relacionada de cada titulo
// -- pedido do Joao 15/09/2026. Mesmo motor de vinculo usado em
// /api/titulos-pagar (src/lib/vinculoOcTitulo.ts), pra nao ter 2 logicas
// de "qual e a OC desse titulo" divergindo com o tempo.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;

  const { searchParams } = new URL(req.url);
  const codccu = searchParams.get("codccu");
  const contaFinanceira = searchParams.get("contaFinanceira");
  const competencia = searchParams.get("competencia");
  if (!codccu || !contaFinanceira || !competencia) {
    return NextResponse.json({ error: "codccu, contaFinanceira e competencia são obrigatórios" }, { status: 422 });
  }

  // mesma regra de visibilidade da tela principal (/api/custos-conta) --
  // sem isso, dava pra ler o detalhe de qualquer CCU so' sabendo o codigo.
  let vePodeTudo = ["ADMIN", "DIRETOR"].includes(user.role);
  if (!vePodeTudo) {
    const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { verTodosCustos: true } });
    vePodeTudo = !!eu?.verTodosCustos;
  }
  if (!vePodeTudo) {
    const time = await prisma.team.findFirst({ where: { codccu }, select: { id: true } });
    const souMembro = time && (await prisma.userTeam.findUnique({ where: { userId_teamId: { userId: user.id, teamId: time.id } } }));
    if (!souMembro) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  }

  const [linhas, ocs] = await Promise.all([
    prisma.custoFinanceiroDetalhe.findMany({
      where: { codccu, contaFinanceira, competencia: new Date(competencia) },
      orderBy: { valorRateado: "desc" },
    }),
    prisma.aprovacaoSenior.findMany({
      select: {
        numOcp: true,
        codFil: true,
        fornecedorCodigo: true,
        fornecedorNome: true,
        valor: true,
        dataEmissao: true,
        situacaoAtual: true,
        usuNumTit: true,
        usuNumNfc: true,
        codccu: true,
        contratoNome: true,
        temRateio: true,
        previsaoPagamento: true,
      },
    }),
  ]);

  const motor = criarMotorVinculo(ocs);

  const itens = linhas.map((l) => {
    const vinculo = motor.ocRelacionadaDe({
      numTit: l.numTit,
      codFor: l.codFor,
      fornecedorNome: l.fornecedorNome,
      tipo: "", // este detalhe (composicao_custo_financeiro) nao carrega o tipo/CODTPT do titulo
      numOcp: null, // NUMOCP direto no titulo confirmado sempre zero nesta base (ver Programação de Pagamento)
      filOcp: null,
      numNfc: null,
      valorOriginal: l.valorRateado,
      dataEmissao: l.dataEntrada ?? l.competencia,
      vencimentoProgramado: l.dataVencimento,
    });
    return {
      numTit: l.numTit,
      codFor: l.codFor,
      fornecedorNome: l.fornecedorNome ?? `código ${l.codFor}`,
      dataEntrada: l.dataEntrada,
      dataVencimento: l.dataVencimento,
      valorRateado: l.valorRateado,
      ocRelacionada: vinculo.ocRelacionada,
      motivoSemOC: vinculo.motivoSemOC,
    };
  });

  const total = itens.reduce((s, i) => s + i.valorRateado, 0);
  return NextResponse.json({ itens, total });
}
