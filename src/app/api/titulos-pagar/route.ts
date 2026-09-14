import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Programação de Contas a Pagar por título, escopo 2026. Mesmo nível de
// acesso das Aprovações OC do Senior.
//
// Cruzamento com OC (pedido do João 14/09/2026): o Senior não grava NUMOCP
// nos títulos (confirmado 13/09/2026, zerado em 100% da base) -- não existe
// chave real pra ligar título <-> OC. O melhor que dá pra fazer sem inventar
// dado é aproximar por fornecedor + valor (mesmo padrão manual que já era
// usado pra comparar as duas telas) e, se houver mais de uma OC do mesmo
// fornecedor com o mesmo valor, ficar com a de emissão mais próxima da do
// título. Por isso `ocRelacionada` vem sempre marcada como aproximação, nunca
// como vínculo garantido -- e só existe pra OCs que a base de Aprovações
// Senior ainda tem (pendentes + resolvidas nos últimos ~30 dias, não é
// histórico completo).
function situacaoLabel(situacao: string) {
  switch (situacao) {
    case "APR":
      return "Aprovada";
    case "REP":
      return "Reprovada";
    case "CAN":
      return "Cancelada";
    case "PRE":
      return "Pré-aprovada";
    case "ANA":
    default:
      return "Em análise (pendente)";
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [titulos, ocs] = await Promise.all([
    prisma.tituloContasAPagar.findMany({
      orderBy: [{ pago: "asc" }, { vencimentoProgramado: "asc" }],
    }),
    prisma.aprovacaoSenior.findMany({
      select: { numOcp: true, fornecedorCodigo: true, valor: true, dataEmissao: true, situacaoAtual: true },
    }),
  ]);

  // agrupa OCs por fornecedor+valor (arredondado a centavo) pra achar candidatas rapido
  const ocsPorChave = new Map<string, typeof ocs>();
  for (const oc of ocs) {
    const chave = `${oc.fornecedorCodigo}|${oc.valor.toFixed(2)}`;
    const lista = ocsPorChave.get(chave) ?? [];
    lista.push(oc);
    ocsPorChave.set(chave, lista);
  }

  function ocRelacionadaDe(codFor: string, valorOriginal: number, dataEmissaoTitulo: Date) {
    const candidatas = ocsPorChave.get(`${codFor}|${valorOriginal.toFixed(2)}`);
    if (!candidatas || candidatas.length === 0) return null;
    const maisProxima = candidatas.reduce((a, b) =>
      Math.abs(a.dataEmissao.getTime() - dataEmissaoTitulo.getTime()) <=
      Math.abs(b.dataEmissao.getTime() - dataEmissaoTitulo.getTime())
        ? a
        : b
    );
    return {
      numOcp: maisProxima.numOcp,
      situacao: maisProxima.situacaoAtual,
      situacaoLabel: situacaoLabel(maisProxima.situacaoAtual),
      aproximado: true,
    };
  }

  const totalAberto = titulos.filter((t) => !t.pago).reduce((s, t) => s + t.valorAberto, 0);
  const qtdAberto = titulos.filter((t) => !t.pago).length;
  const qtdPagos = titulos.filter((t) => t.pago).length;
  const totalPago = titulos.filter((t) => t.pago).reduce((s, t) => s + t.valorOriginal, 0);

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
      ocRelacionada: ocRelacionadaDe(t.codFor, t.valorOriginal, t.dataEmissao),
    })),
    totalAberto,
    qtdAberto,
    qtdPagos,
    totalPago,
    totalTitulos: titulos.length,
  });
}
