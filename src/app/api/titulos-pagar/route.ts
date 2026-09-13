import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Programação de Contas a Pagar por título -- pra cruzar com Aprovações OC
// (via numOcp). Mesmo nível de acesso das Aprovações OC do Senior.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const titulos = await prisma.tituloContasAPagar.findMany({
    orderBy: [{ pago: "asc" }, { vencimentoProgramado: "asc" }],
  });

  const totalAberto = titulos.filter((t) => !t.pago).reduce((s, t) => s + t.valorAberto, 0);
  const qtdAberto = titulos.filter((t) => !t.pago).length;
  const qtdPagos = titulos.filter((t) => t.pago).length;
  const totalPago = titulos.filter((t) => t.pago).reduce((s, t) => s + t.valorOriginal, 0);
  const qtdComOcp = titulos.filter((t) => t.numOcp).length;

  return NextResponse.json({
    titulos: titulos.map((t) => ({
      numTit: t.numTit,
      codFil: t.codFil,
      fornecedorNome: t.fornecedorNome ?? `código ${t.codFor}`,
      tipo: t.tipo,
      situacao: t.situacao,
      pago: t.pago,
      dataEmissao: t.dataEmissao,
      vencimentoOriginal: t.vencimentoOriginal,
      vencimentoProgramado: t.vencimentoProgramado,
      valorOriginal: t.valorOriginal,
      valorAberto: t.valorAberto,
      dataPagamento: t.dataPagamento,
      ccuNome: t.ccuNome ?? t.codccu,
      numOcp: t.numOcp,
    })),
    totalAberto,
    qtdAberto,
    qtdPagos,
    totalPago,
    qtdComOcp,
    totalTitulos: titulos.length,
  });
}
