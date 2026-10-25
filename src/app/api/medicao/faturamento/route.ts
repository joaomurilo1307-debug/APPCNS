import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, escopoDeVisao, podeVerCcu } from "@/lib/custos/acesso";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { hojeBR } from "@/lib/financeiro/alertas";
import { consolidarFaturamento, normalizarPeriodoConsolidado } from "@/lib/medicao/consolidado";
import type { DocConc } from "@/lib/medicao/conciliacao";

// Resumo do faturamento de todos os CCUs autorizados, apenas com dados locais.
// Nao inicia sincronizacao nem faz uma requisicao/consulta por contrato.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "medicao");
  if (negado) return negado;
  const escopo = await escopoDeCustos(prisma, session.user as any);
  const visao = await escopoDeVisao(escopo);
  const hoje = hojeBR();
  const mesAtual = hoje.slice(0, 7);
  const sp = new URL(req.url).searchParams;
  const { de, ate } = normalizarPeriodoConsolidado(sp.get("de"), sp.get("ate"), mesAtual);

  const contratos = (await prisma.medicaoContrato.findMany({
    where: { codccu: { not: null } },
    select: { numCtr: true, codccu: true },
  })).filter((c) => c.codccu !== null && podeVerCcu(visao, c.codccu));
  const numeros = contratos.map((c) => c.numCtr);
  const ccus = [...new Set(contratos.map((c) => c.codccu!))];
  const [itens, docs, ultima] = await Promise.all([
    prisma.medicaoItem.findMany({
      where: { numCtr: { in: numeros } },
      select: { numCtr: true, numPed: true, competencia: true, origem: true, boletim: true, situacao: true, qtd: true, valor: true, dataEmissao: true },
    }),
    prisma.faturamentoMedicao.findMany({
      where: { codccu: { in: ccus } },
      select: { chave: true, tipo: true, numero: true, filial: true, serie: true, dataEmissao: true, valor: true, valorLiquido: true, valorDoc: true, codccu: true, competencia: true, origem: true, pedidos: true, situacao: true, duplicadaDe: true, vencimento: true, dataPagamento: true, valorAberto: true },
    }),
    prisma.atualizacaoMedicao.findFirst({
      where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true, resumo: true },
    }),
  ]);
  const documentos: DocConc[] = docs.map((doc) => ({
    ...doc,
    tipo: doc.tipo as "NF" | "ND",
    origem: doc.origem as "PEDIDO" | "EMISSAO" | "ACUMULADO",
    dataEmissao: doc.dataEmissao.toISOString().slice(0, 10),
    valorLiquido: doc.valorLiquido > 0 ? doc.valorLiquido : doc.valor,
  }));
  const consolidado = consolidarFaturamento({
    contratos,
    itens: itens.map((item) => ({ ...item, dataEmissao: item.dataEmissao.toISOString().slice(0, 10) })),
    docs: documentos,
    ccusPermitidos: new Set(ccus),
    de, ate, hoje,
  });
  const resumo = (ultima?.resumo ?? {}) as { faturamentoErro?: string | null };
  return NextResponse.json({
    de, ate, mesAtual, ...consolidado,
    atualizadoEm: ultima?.finalizadoEm ?? null,
    faturamentoErro: resumo.faturamentoErro ?? null,
  });
}
