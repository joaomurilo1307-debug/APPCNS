import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo } from "@/lib/vinculoOcTitulo";

// Programação de Contas a Pagar por título, escopo histórico completo.
// Mesmo nível de acesso das Aprovações OC do Senior. Motor de conciliação
// Título<->OC em src/lib/vinculoOcTitulo.ts (também usado no sentido
// inverso pelo mapa da OC, ver /api/senior/aprovacoes/[numOcp]).

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const [titulos, ocs, usuariosSenior] = await Promise.all([
    prisma.tituloContasAPagar.findMany({
      orderBy: [{ pago: "asc" }, { vencimentoProgramado: "asc" }],
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
    prisma.usuarioSenior.findMany({ include: { user: { select: { name: true } } } }),
  ]);

  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) codToNome[u.codigo] = u.user?.name || u.nome;

  const motor = criarMotorVinculo(ocs);

  const totalAberto = titulos.filter((t) => !t.pago).reduce((s, t) => s + t.valorAberto, 0);
  const qtdAberto = titulos.filter((t) => !t.pago).length;
  const qtdPagos = titulos.filter((t) => t.pago).length;
  const totalPago = titulos.filter((t) => t.pago).reduce((s, t) => s + t.valorOriginal, 0);

  return NextResponse.json({
    titulos: titulos.map((t) => {
      const vinculo = motor.ocRelacionadaDe(t);
      return {
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
        ocRelacionada: vinculo.ocRelacionada,
        motivoSemOC: vinculo.motivoSemOC,
        ocEsperada: vinculo.ocEsperada,
        descricao: t.descricao,
        dataLancamento: t.dataLancamento,
        lancadoPorNome: t.lancadoPorCod && t.lancadoPorCod !== "0" ? codToNome[t.lancadoPorCod] || `Usuário Senior #${t.lancadoPorCod}` : null,
        entradaManual: !t.numNfc || t.numNfc === "0",
        numNfc: t.numNfc && t.numNfc !== "0" ? t.numNfc : null,
      };
    }),
    totalAberto,
    qtdAberto,
    qtdPagos,
    totalPago,
    totalTitulos: titulos.length,
  });
}
