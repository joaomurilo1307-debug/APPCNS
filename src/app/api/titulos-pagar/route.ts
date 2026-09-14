import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Programação de Contas a Pagar por título, escopo 2026. Mesmo nível de
// acesso das Aprovações OC do Senior.
//
// Cruzamento com OC (pedido do João 14/09/2026): o Senior não grava NUMOCP
// nos títulos (confirmado 13/09/2026, zerado em 100% da base) -- mas achamos
// o vínculo real do OUTRO lado: E420OCP.USU_NUMTIT é um campo customizado,
// texto livre digitado pelo comprador na própria OC, com o NUMTIT do título
// gerado por ela. Testado empiricamente 14/09/2026 contra o Senior ao vivo:
// 8.780 de 11.682 OCs preenchidas, e numa amostra de 30, 25 (83%) casam EXATO
// (fornecedor + NUMTIT) com um título real em E501TCP -- os outros 5 são
// provavelmente erro de digitação de quem preencheu (campo é texto livre).
// Por isso o vínculo por usuNumTit é tratado como REAL (aproximado: false);
// só cai pra aproximação por fornecedor+valor quando não há usuNumTit que
// bata -- e mesmo assim só entre as OCs que a base de Aprovações Senior tem
// carregadas (pendentes + resolvidas recentes, não é histórico completo).
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
      select: {
        numOcp: true,
        fornecedorCodigo: true,
        valor: true,
        dataEmissao: true,
        situacaoAtual: true,
        usuNumTit: true,
      },
    }),
  ]);

  // vínculo REAL: fornecedor + NUMTIT (bruto, do jeito que foi digitado na
  // OC) -- ver nota no topo do arquivo. Cada OC pode ter mais de um título
  // (comprador separa por quebra de linha/;/,) -- NUNCA separa por "-",
  // porque NUMTIT real usa "-" dentro do próprio número (ex "51841-103"),
  // então splitar por "-" quebraria esse caso. Tenta o texto inteiro primeiro
  // (é o que bateu nos 25/30 testados), só separa como fallback.
  const ocPorTituloReal = new Map<string, (typeof ocs)[number]>();
  for (const oc of ocs) {
    if (!oc.usuNumTit) continue;
    const bruto = oc.usuNumTit.trim();
    if (!bruto) continue;
    const candidatos = new Set<string>([bruto]);
    for (const parte of bruto.split(/[\n\r;,]+/)) {
      const p = parte.trim();
      if (p) candidatos.add(p);
    }
    for (const cand of candidatos) {
      const chave = `${oc.fornecedorCodigo}|${cand}`;
      // se mais de uma OC reivindica o mesmo (fornecedor,numTit), fica com a
      // primeira -- caso raro, não vale complicar
      if (!ocPorTituloReal.has(chave)) ocPorTituloReal.set(chave, oc);
    }
  }

  // fallback: aproximação por fornecedor + valor (só quando não achou vínculo real)
  const ocsPorChave = new Map<string, typeof ocs>();
  for (const oc of ocs) {
    const chave = `${oc.fornecedorCodigo}|${oc.valor.toFixed(2)}`;
    const lista = ocsPorChave.get(chave) ?? [];
    lista.push(oc);
    ocsPorChave.set(chave, lista);
  }

  function ocRelacionadaDe(codFor: string, numTit: string, valorOriginal: number, dataEmissaoTitulo: Date) {
    const real = ocPorTituloReal.get(`${codFor}|${numTit}`);
    if (real) {
      return {
        numOcp: real.numOcp,
        situacao: real.situacaoAtual,
        situacaoLabel: situacaoLabel(real.situacaoAtual),
        aproximado: false,
      };
    }

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
      ocRelacionada: ocRelacionadaDe(t.codFor, t.numTit, t.valorOriginal, t.dataEmissao),
    })),
    totalAberto,
    qtdAberto,
    qtdPagos,
    totalPago,
    totalTitulos: titulos.length,
  });
}
