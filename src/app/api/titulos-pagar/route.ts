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

  // Instrumentacao temporaria (30/09/2026): rota medida em 10-30s ao vivo com
  // 20 mil+ titulos, achar onde o tempo vai antes de decidir o fix (index?
  // volume de OCs? laco em JS?). Remover depois de diagnosticado.
  const _t0 = Date.now();
  const [titulos, ocs, usuariosSenior, dossies] = await Promise.all([
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
  ]);

  const _t1 = Date.now();
  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) codToNome[u.codigo] = u.user?.name || u.nome;

  const motor = criarMotorVinculo(ocs);
  const _t2 = Date.now();

  // Dossiê por título (aba Conferência de OC). Um dossiê pode responder por
  // mais de um título -- a OC 14934, por exemplo, informa "398A1 - 196$01" --
  // então o índice é montado expandindo a lista, não por coluna simples.
  // A chave preferida inclui o fornecedor; a automação nem sempre tem o
  // CODFOR (caso do registro de erro "título sem OC"), e aí vale a chave só
  // pelo número. Como vem ordenado do mais recente pro mais antigo, o
  // primeiro a ocupar a chave é o dossiê mais novo daquele título.
  const dossiePorTitulo = new Map<string, (typeof dossies)[number]>();
  for (const d of dossies) {
    for (const numTit of d.titulos) {
      const limpo = numTit.trim();
      if (!limpo) continue;
      if (d.codFor) {
        const comFornecedor = `${d.codFor}|${limpo}`;
        if (!dossiePorTitulo.has(comFornecedor)) dossiePorTitulo.set(comFornecedor, d);
      }
      const soNumero = `*|${limpo}`;
      if (!dossiePorTitulo.has(soNumero)) dossiePorTitulo.set(soNumero, d);
    }
  }

  function dossieDe(codFor: string, numTit: string) {
    const achado = dossiePorTitulo.get(`${codFor}|${numTit}`) ?? dossiePorTitulo.get(`*|${numTit}`);
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

  const titulosResposta = titulos.map((t) => {
      const vinculo = motor.ocRelacionadaDe(t);
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
        dossie: dossieDe(t.codFor, t.numTit),
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
        revisadoStatus: t.revisadoStatus,
        revisadoPorNome: t.revisadoPorNome,
        revisadoEm: t.revisadoEm,
        revisadoObs: t.revisadoObs,
      };
  });
  const _t3 = Date.now();

  return NextResponse.json({
    titulos: titulosResposta,
    totalAberto,
    qtdAberto,
    qtdPagos,
    totalPago,
    totalTitulos: titulos.length,
    sincronizadoEm,
    _timing: {
      queryDbMs: _t1 - _t0,
      montarMotorMs: _t2 - _t1,
      mapearTitulosMs: _t3 - _t2,
      totalMs: _t3 - _t0,
      qtdOcs: ocs.length,
      qtdTitulos: titulos.length,
      qtdDossies: dossies.length,
    },
  });
}
