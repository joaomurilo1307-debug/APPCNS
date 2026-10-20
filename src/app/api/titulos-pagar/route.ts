import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { aplicarCorrecaoManual } from "@/lib/vinculoOcTitulo";
import { motorDeOcs } from "@/lib/cache/ocsMotor";
import { criarIndiceDossies } from "@/lib/dossieTitulo";
import { garantirFormasPagamentoAtualizadas, carregarCatalogoFormasPagamento } from "@/lib/senior/formasPagamento";
import { ehCartaoCredito } from "@/lib/pagamentos/cartaoCredito";

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
  garantirFormasPagamentoAtualizadas(true);

  // DESEMPENHO (19/10/2026): a lista tem ~20 mil titulos (~20 MB) e montá-la custava ~4 s de CPU a cada abertura, num servidor de 1 CPU.
  // A resposta e' a mesma para todo mundo que passou na checagem de papel acima; so' muda quando algum dado de origem muda. A "assinatura"
  // abaixo olha, com consultas baratas, tudo que entra na lista; se nada mudou, devolve o JSON ja pronto.
  const assinatura = await assinaturaDaLista();
  if (guardada && guardada.assinatura === assinatura) return respostaJson(guardada.texto);
  if (emCalculo && emCalculo.assinatura === assinatura) return respostaJson(await emCalculo.promessa);
  const promessa = calcularTexto();
  emCalculo = { assinatura, promessa };
  try {
    const texto = await promessa;
    guardada = { assinatura, texto };
    return respostaJson(texto);
  } finally {
    if (emCalculo && emCalculo.promessa === promessa) emCalculo = null;
  }
}

const respostaJson = (texto: string) => new NextResponse(texto, { status: 200, headers: { "Content-Type": "application/json" } });
let guardada: { assinatura: string; texto: string } | null = null;
let emCalculo: { assinatura: string; promessa: Promise<string> } | null = null;

/** Tudo que alimenta a lista, resumido numa chave curta. Se qualquer coisa mudar (titulo, OC, vinculo manual, adiamento, dossie...), a chave muda. */
async function assinaturaDaLista(): Promise<string> {
  const [t, oc, dossies, usuarios, formas, adiamentos, vinculos] = await Promise.all([
    prisma.tituloContasAPagar.aggregate({ _max: { atualizadoEm: true }, _count: { _all: true } }),
    motorDeOcs(prisma),
    prisma.dossieOC.aggregate({ _max: { atualizadoEm: true }, _count: { _all: true } }),
    prisma.usuarioSenior.aggregate({ _max: { atualizadoEm: true }, _count: { _all: true } }),
    prisma.formaPagamentoSenior.aggregate({ _max: { atualizadoEm: true }, _count: { _all: true } }),
    // poucos registros: lidos por inteiro para que qualquer alteracao (inclusive trocar a OC de um vinculo manual) mude a chave
    prisma.tituloAdiamento.findMany({ where: { tituloId: { not: null } }, select: { id: true, marcadoEm: true, resolvidoEm: true, resolvidoComo: true, motivo: true } }),
    prisma.tituloOcVinculo.findMany({ select: { id: true, numOcp: true, criadoEm: true } }),
  ]);
  const k = (d: Date | null | undefined) => d?.getTime() ?? 0;
  return [
    `t${t._count._all}:${k(t._max.atualizadoEm)}`,
    `o${oc.versao}`,
    `d${dossies._count._all}:${k(dossies._max.atualizadoEm)}`,
    `u${usuarios._count._all}:${k(usuarios._max.atualizadoEm)}`,
    `f${formas._count._all}:${k(formas._max.atualizadoEm)}`,
    `a${adiamentos.map((a) => `${a.id}.${k(a.marcadoEm)}.${k(a.resolvidoEm)}.${a.resolvidoComo ?? ""}.${a.motivo ?? ""}`).join(",")}`,
    `v${vinculos.map((v) => `${v.id}.${v.numOcp}.${k(v.criadoEm)}`).join(",")}`,
  ].join("|");
}

async function calcularTexto(): Promise<string> {
  const catalogoFormas = await carregarCatalogoFormasPagamento();

  const [titulos, motorOcs, usuariosSenior, dossies, adiamentos, vinculosManuais] = await Promise.all([
    prisma.tituloContasAPagar.findMany({
      orderBy: [{ pago: "asc" }, { vencimentoProgramado: "asc" }],
    }),
    motorDeOcs(prisma),
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
    prisma.tituloOcVinculo.findMany(),
  ]);

  const vinculoManualDe = new Map(vinculosManuais.map((v) => [`${v.numTit}|${v.codFil}|${v.codFor}`, v]));

  // Mais recente por titulo (a query ja vem ordenada por marcadoEm desc).
  const adiamentoPorTitulo = new Map<string, (typeof adiamentos)[number]>();
  for (const a of adiamentos) {
    if (a.tituloId && !adiamentoPorTitulo.has(a.tituloId)) adiamentoPorTitulo.set(a.tituloId, a);
  }

  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) codToNome[u.codigo] = u.user?.name || u.nome;

  const { motor, ocPorNumero } = motorOcs; // do cache (ver lib/cache/ocsMotor.ts)
  const indiceDossies = criarIndiceDossies(dossies);

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

  return JSON.stringify({
    titulos: titulos.map((t) => {
      const vinculoManual = vinculoManualDe.get(`${t.numTit}|${t.codFil}|${t.codFor}`);
      const vinculo = aplicarCorrecaoManual(
        { numOcpCorrigido: vinculoManual?.numOcp ?? t.numOcpCorrigido },
        (n) => ocPorNumero.get(n),
        motor.ocRelacionadaDe(t)
      );
      const ocCodFil = vinculo.ocRelacionada ? ocPorNumero.get(vinculo.ocRelacionada.numOcp)?.codFil ?? t.codFil : null;
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
        codccu: t.codccu ?? null, // o filtro de area (topo das telas) e' aplicado no navegador por este codigo
        ocRelacionada: vinculo.ocRelacionada,
        ocCodFil,
        vinculoManual: vinculoManual ? { numOcp: vinculoManual.numOcp, por: vinculoManual.criadoPorNome, em: vinculoManual.criadoEm } : null,
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
        formaPagamento: t.codFpg ? catalogoFormas.get(t.codFpg) ?? null : null,
        cartaoCredito: ehCartaoCredito(t.codFpg, t.codFpg ? catalogoFormas.get(t.codFpg) : null),
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
