import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Rateio completo de UM título entre todos os centros de custo -- pedido do
// João 15/09/2026: "poder clicar no título e abrir ele, pra entender", a
// partir de um caso real (título 006238 aparecia R$8,66 na tela mas
// R$78,00 no Senior). Confirmado que é rateio de verdade: mesmo título
// dividido entre 9 CCUs, soma exata ao valor original do Senior.
//
// Permissão: mesma regra de /api/custos-conta/detalhe, avaliada sobre o
// CCU de onde o usuário está vendo (query "codccuOrigem") -- um título
// pode ratear pra CCUs que o usuário não acompanha; uma vez autorizado a
// ver o CCU de origem, ele vê o rateio inteiro (mesmo padrão já usado pelo
// mapa de rateio de uma OC, que também mostra todos os CCUs sem redigir).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;

  const { searchParams } = new URL(req.url);
  const numTit = searchParams.get("numTit");
  const codFor = searchParams.get("codFor");
  const codccuOrigem = searchParams.get("codccuOrigem");
  if (!numTit || !codFor || !codccuOrigem) {
    return NextResponse.json({ error: "numTit, codFor e codccuOrigem são obrigatórios" }, { status: 422 });
  }

  let vePodeTudo = ["ADMIN", "DIRETOR"].includes(user.role);
  if (!vePodeTudo) {
    const eu = await prisma.user.findUnique({ where: { id: user.id }, select: { verTodosCustos: true } });
    vePodeTudo = !!eu?.verTodosCustos;
  }
  if (!vePodeTudo) {
    const time = await prisma.team.findFirst({ where: { codccu: codccuOrigem }, select: { id: true } });
    const souMembro = time && (await prisma.userTeam.findUnique({ where: { userId_teamId: { userId: user.id, teamId: time.id } } }));
    if (!souMembro) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  }

  const [linhas, tituloReal] = await Promise.all([
    prisma.custoFinanceiroDetalhe.findMany({
      where: { numTit, codFor },
      orderBy: { valorRateado: "desc" },
    }),
    prisma.tituloContasAPagar.findFirst({
      where: { numTit, codFor },
      orderBy: { dataEmissao: "desc" },
    }),
  ]);

  if (linhas.length === 0) {
    return NextResponse.json({ error: "Título não encontrado no detalhe sincronizado" }, { status: 404 });
  }

  const codccus = Array.from(new Set(linhas.map((l) => l.codccu)));
  const [contratos, usuarioLancou] = await Promise.all([
    prisma.custoContaFinanceira.findMany({
      where: { codccu: { in: codccus } },
      distinct: ["codccu"],
      select: { codccu: true, contrato: true },
    }),
    tituloReal?.lancadoPorCod && tituloReal.lancadoPorCod !== "0"
      ? prisma.usuarioSenior.findUnique({ where: { codigo: tituloReal.lancadoPorCod }, include: { user: { select: { name: true } } } })
      : null,
  ]);
  const nomePorCcu = new Map(contratos.map((c) => [c.codccu, c.contrato]));

  const somaRateio = linhas.reduce((s, l) => s + l.valorRateado, 0);
  const valorOriginalSenior = tituloReal?.valorOriginal ?? null;

  return NextResponse.json({
    numTit,
    codFor,
    fornecedorNome: linhas[0].fornecedorNome ?? `código ${codFor}`,
    tipo: tituloReal?.tipo ?? null,
    situacao: tituloReal?.situacao ?? null,
    pago: tituloReal?.pago ?? null,
    dataPagamento: tituloReal?.dataPagamento ?? null,
    valorOriginalSenior,
    somaRateio,
    bateComSenior: valorOriginalSenior !== null ? Math.abs(valorOriginalSenior - somaRateio) < 0.02 : null,
    descricao: tituloReal?.descricao ?? null,
    dataLancamento: tituloReal?.dataLancamento ?? null,
    lancadoPorNome: usuarioLancou?.user?.name || usuarioLancou?.nome || (tituloReal?.lancadoPorCod ? `Usuário Senior #${tituloReal.lancadoPorCod}` : null),
    entradaManual: tituloReal ? !tituloReal.numNfc || tituloReal.numNfc === "0" : null,
    rateio: linhas.map((l) => ({
      codccu: l.codccu,
      contrato: nomePorCcu.get(l.codccu) ?? `CCU ${l.codccu}`,
      contaFinanceira: l.contaFinanceira,
      competencia: l.competencia,
      valorRateado: l.valorRateado,
    })),
  });
}
