import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";

// Quais contratos ja' tem P0 cadastrado (a versao ativa mais nova de cada um), com o periodo e o total do custo de contrato e, quando ja' tiver
// sido carregada, o total da receita tambem (datas e total podem ser diferentes dos de custo: cada tipo tem seu proprio periodo).
// Mostra so' os contratos que a pessoa pode ver (mesma regra dos custos).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);

  const versoes = await prisma.p0Versao.findMany({ where: { ativa: true }, orderBy: [{ codccu: "asc" }, { versao: "desc" }], select: { id: true, codccu: true, versao: true, rotulo: true } });
  const maisNovaPorCcu = new Map<string, (typeof versoes)[number]>();
  for (const v of versoes) if (!maisNovaPorCcu.has(v.codccu) && podeVerCcu(escopo, v.codccu)) maisNovaPorCcu.set(v.codccu, v);

  const p0s = [];
  for (const v of Array.from(maisNovaPorCcu.values())) {
    const [aggCusto, iniCusto, fimCusto, aggReceita, iniReceita, fimReceita] = await Promise.all([
      prisma.p0Linha.aggregate({ where: { p0Id: v.id, tipo: "CUSTO_CONTRATO" }, _sum: { valor: true }, _count: true }),
      prisma.p0Linha.findFirst({ where: { p0Id: v.id, tipo: "CUSTO_CONTRATO" }, orderBy: { competencia: "asc" }, select: { competencia: true } }),
      prisma.p0Linha.findFirst({ where: { p0Id: v.id, tipo: "CUSTO_CONTRATO" }, orderBy: { competencia: "desc" }, select: { competencia: true } }),
      prisma.p0Linha.aggregate({ where: { p0Id: v.id, tipo: "RECEITA" }, _sum: { valor: true }, _count: true }),
      prisma.p0Linha.findFirst({ where: { p0Id: v.id, tipo: "RECEITA" }, orderBy: { competencia: "asc" }, select: { competencia: true } }),
      prisma.p0Linha.findFirst({ where: { p0Id: v.id, tipo: "RECEITA" }, orderBy: { competencia: "desc" }, select: { competencia: true } }),
    ]);
    if (!iniCusto || !fimCusto) continue;
    const temReceita = aggReceita._count > 0;
    p0s.push({
      codccu: v.codccu,
      versao: v.versao,
      rotulo: v.rotulo,
      mesIni: iniCusto.competencia.toISOString().slice(0, 7),
      mesFim: fimCusto.competencia.toISOString().slice(0, 7),
      totalCusto: Math.round((aggCusto._sum.valor ?? 0) * 100) / 100,
      linhas: aggCusto._count,
      temReceita,
      totalReceita: temReceita ? Math.round((aggReceita._sum.valor ?? 0) * 100) / 100 : null,
      receitaMesIni: iniReceita ? iniReceita.competencia.toISOString().slice(0, 7) : null,
      receitaMesFim: fimReceita ? fimReceita.competencia.toISOString().slice(0, 7) : null,
    });
  }
  return NextResponse.json({ p0s });
}
