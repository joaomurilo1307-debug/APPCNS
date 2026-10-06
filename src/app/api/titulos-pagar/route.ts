import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo, aplicarCorrecaoManual } from "@/lib/vinculoOcTitulo";
import { criarIndiceDossies } from "@/lib/dossieTitulo";
import { garantirFormasPagamentoAtualizadas } from "@/lib/senior/formasPagamento";

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

  // Mantem o codigo/descricao da forma de pagamento atualizados em segundo plano (aparecem dentro da OC).
  garantirFormasPagamentoAtualizadas();

  const [titulos, ocs, usuariosSenior, dossies, adiamentos] = await Promise.all([
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
    prisma.dossieOC.findMany({
      select: {
        id: true,
        numOcp: true,
        codFor: true,
        titulos: true,
        status: true,
        motivo: true,
        arquivoPath: true,
        geradoEm: true,
      },
      orderBy: { geradoEm: "desc" },
    }),
    // "Proxima programacao": poucos registros, entram em todo titulo que ja foi
    // adiado (aberto ou nao) pra mostrar o aviso na programacao de origem.
    prisma.tituloAdiamento.findMany({
      where: { tituloId: { not: null } },
      orderBy: { marcadoEm: "desc" },
      select: { id: true, tituloId: true, programacaoOrigem: true, marcadoPorNome: true, marcadoEm: true, motivo: true, resolvidoEm: true, resolvidoComo: true },
    }),
  ]);

  // Mais recente por titulo (a query ja vem ordenada por marcadoEm desc).
  const adiamentoPorTitulo = new Map<string, (typeof adiamentos)[number]>();
  for (const a of adiamentos) {
    if (a.tituloId && !adiamentoPorTitulo.has(a.tituloId)) adiamentoPorTitulo.set(a.tituloId, a);
  }

  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) codToNome[u.codigo] = u.user?.name || u.nome;

  const motor = criarMotorVinculo(ocs);
  const indiceDossies = criarIndiceDossies(dossies);
  const ocPorNumero = new Map(ocs.map((o) => [o.numOcp, o]));

  function dossieDe(titulo: { numTit: string; codFor: string }, numOcpVinculado: string | null | undefined) {
    const achado = indiceDossies.dossieDoTitulo({ numTit: titulo.numTit, codFor: titulo.codFor, numOcp: numOcpVinculado });
    if (!achado) return null;
    return {
      id: achado.id,
      status: achado.status,
      motivo: achado.motivo,
      temArquivo: !!achado.arquivoPath,
      numOcp: achado.numOcp,
      geradoEm: achado.geradoEm,
    };
  }

  // Quando o sincronismo rodou pela última vez. Sem isso a tela não tem como
  // avisar que está mostrando dado de dias atrás -- e conferência contra dado
  // defasado é pior do que não conferir, porque parece confiável.
  let sincronizadoEm: Date | null = null;
  for (const t of titulos) {
    if (!sincronizadoEm || t.atualizadoEm > sincronizadoEm) sincronizadoEm = t.atualizadoEm;
  }

  const totalAberto = titulos.filter((t) => !t.pago).reduce((s, t) => s + t.valorAberto, 0);
  const qtdAberto = titulos.filter((t) => !t.pago).length;
  const qtdPagos = titulos.filter((t) => t.pago).length;
  const totalPago = titulos.filter((t) => t.pago).reduce((s, t) => s + t.valorOriginal, 0);

  return NextResponse.json({
    titulos: titulos.map((t) => {
      const vinculo = aplicarCorrecaoManual(t, (n) => ocPorNumero.get(n), motor.ocRelacionadaDe(t));
      return {
        id: t.id,
        numTit: t.numTit,
        codFil: t.codFil,
        codFor: t.codFor,
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
        dossie: dossieDe(t, vinculo.ocRelacionada?.numOcp),
        // Preenchimento automatico do Pagamentos Itaú (SISPAG), quando o
        // sincronismo já trouxer isso -- ver docs/integracao-itau.md.
        codigoBarrasBoleto: t.codigoBarrasBoleto,
        bancoFavorecido: t.bancoFavorecido,
        agenciaFavorecido: t.agenciaFavorecido,
        contaFavorecido: t.contaFavorecido,
        dacFavorecido: t.dacFavorecido,
        tipoContaFavorecido: t.tipoContaFavorecido,
        chavePix: t.chavePix,
        tipoChavePix: t.tipoChavePix,
        documentoFavorecido: t.documentoFavorecido,
        codFpg: t.codFpg,
        revisadoStatus: t.revisadoStatus,
        revisadoPorNome: t.revisadoPorNome,
        revisadoEm: t.revisadoEm,
        revisadoObs: t.revisadoObs,
        numOcpCorrigido: t.numOcpCorrigido,
        // So' vai no payload de quem ja foi adiado alguma vez (poucos).
        ...(adiamentoPorTitulo.has(t.id)
          ? {
              adiamento: {
                programacaoOrigem: adiamentoPorTitulo.get(t.id)!.programacaoOrigem,
                marcadoPorNome: adiamentoPorTitulo.get(t.id)!.marcadoPorNome,
                marcadoEm: adiamentoPorTitulo.get(t.id)!.marcadoEm,
                motivo: adiamentoPorTitulo.get(t.id)!.motivo,
                resolvidoEm: adiamentoPorTitulo.get(t.id)!.resolvidoEm,
                resolvidoComo: adiamentoPorTitulo.get(t.id)!.resolvidoComo,
              },
            }
          : {}),
      };
    }),
    totalAberto,
    qtdAberto,
    qtdPagos,
    totalPago,
    totalTitulos: titulos.length,
    sincronizadoEm,
  });
}
