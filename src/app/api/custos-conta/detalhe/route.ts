import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { criarMotorVinculo } from "@/lib/vinculoOcTitulo";
import { escolherTituloReal, type CandidatoTitulo } from "@/lib/escolherTituloReal";

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

  const [linhas, ocs, usuariosSenior] = await Promise.all([
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
    prisma.usuarioSenior.findMany({ include: { user: { select: { name: true } } } }),
  ]);

  const codToNome: Record<string, string> = {};
  for (const u of usuariosSenior) codToNome[u.codigo] = u.user?.name || u.nome;

  const motor = criarMotorVinculo(ocs);

  // detalhe (composicao_custo_financeiro) não carrega tipo/NF/valor real
  // do título -- só o valor RATEADO pra este CCU. Bug real encontrado pelo
  // João 15/09/2026 (título 239A1: linha da tabela dizia "Sem OC", mas o
  // dossiê do MESMO título, que usa o título real, achava a OC 11743 na
  // hora): esta rota rodava o motor de vínculo com tipo/numNfc/valorOriginal
  // ZERADOS (placeholder), em vez do título de verdade -- por isso o
  // "vínculo exato" via NF (que depende de numNfc/valorOriginal reais)
  // nunca fechava aqui, mesmo quando existia e o dossiê achava certinho.
  // Busca o título real por numTit+codFor ANTES de rodar o motor, mesma
  // chave usada em Programação de Pagamento e no dossiê do título.
  const numTits = Array.from(new Set(linhas.map((l) => l.numTit)));
  const titulosReais = numTits.length
    ? await prisma.tituloContasAPagar.findMany({
        where: { numTit: { in: numTits } },
      })
    : [];
  const candidatosPorChave = new Map<string, (typeof titulosReais)[number][]>();
  for (const t of titulosReais) {
    const chave = `${t.numTit}|${t.codFor}`;
    const lista = candidatosPorChave.get(chave) ?? [];
    lista.push(t);
    candidatosPorChave.set(chave, lista);
  }

  const itens = linhas.map((l) => {
    const candidatos = candidatosPorChave.get(`${l.numTit}|${l.codFor}`) ?? [];
    // desempate por valor quando o mesmo numTit+codFor tem mais de um
    // título real (ex: um tipo COF e um tipo IRF com o mesmo número) --
    // ver src/lib/escolherTituloReal.ts.
    const real = escolherTituloReal(candidatos as CandidatoTitulo<(typeof titulosReais)[number]>[], l.valorRateado);
    const vinculo = motor.ocRelacionadaDe(
      real
        ? {
            numTit: real.numTit,
            codFor: real.codFor,
            fornecedorNome: real.fornecedorNome,
            tipo: real.tipo,
            numOcp: real.numOcp,
            filOcp: real.filOcp,
            numNfc: real.numNfc,
            valorOriginal: real.valorOriginal,
            dataEmissao: real.dataEmissao,
            vencimentoProgramado: real.vencimentoProgramado,
          }
        : {
            // título não achado na base de contas a pagar (raro) -- cai pro
            // placeholder anterior, sem inventar dado que não existe.
            numTit: l.numTit,
            codFor: l.codFor,
            fornecedorNome: l.fornecedorNome,
            tipo: "",
            numOcp: null,
            filOcp: null,
            numNfc: null,
            valorOriginal: l.valorRateado,
            dataEmissao: l.dataEntrada ?? l.competencia,
            vencimentoProgramado: l.dataVencimento,
          }
    );
    return {
      numTit: l.numTit,
      codFor: l.codFor,
      fornecedorNome: l.fornecedorNome ?? `código ${l.codFor}`,
      dataEntrada: l.dataEntrada,
      dataVencimento: l.dataVencimento,
      valorRateado: l.valorRateado,
      ocRelacionada: vinculo.ocRelacionada,
      motivoSemOC: vinculo.motivoSemOC,
      descricao: real?.descricao ?? null,
      dataLancamento: real?.dataLancamento ?? null,
      lancadoPorNome: real?.lancadoPorCod && real.lancadoPorCod !== "0" ? codToNome[real.lancadoPorCod] || `Usuário Senior #${real.lancadoPorCod}` : null,
      entradaManual: real ? !real.numNfc || real.numNfc === "0" : null,
    };
  });

  const total = itens.reduce((s, i) => s + i.valorRateado, 0);
  return NextResponse.json({ itens, total });
}
