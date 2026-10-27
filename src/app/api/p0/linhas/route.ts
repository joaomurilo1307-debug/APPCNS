import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";

// Linhas do P0 por tras de UMA celula (conta x mes) da tabela "Plano de contas x mes" do P0: de onde vem cada valor previsto (item do quantitativo,
// "recorrentes da CPU"...). Mesma regra de acesso de /api/p0/custos. So' custo de contrato.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const ccu = sp.get("ccu");
  const conta = sp.get("conta");
  const mes = sp.get("mes");
  if (!ccu || !conta || !mes || !/^\d{4}-\d{2}$/.test(mes)) return NextResponse.json({ error: "Informe ccu, conta e mes (aaaa-mm)" }, { status: 400 });

  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (!podeVerCcu(escopo, ccu)) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });

  const versao = await prisma.p0Versao.findFirst({ where: { codccu: ccu, ativa: true }, orderBy: { versao: "desc" }, select: { id: true, versao: true, rotulo: true } });
  if (!versao) return NextResponse.json({ error: "Este contrato não tem P0 cadastrado" }, { status: 404 });

  const linhas = await prisma.p0Linha.findMany({
    where: { p0Id: versao.id, tipo: "CUSTO_CONTRATO", conta, competencia: new Date(`${mes}-01T00:00:00.000Z`) },
    select: { historico: true, valor: true },
    orderBy: [{ valor: "desc" }, { historico: "asc" }],
  });
  const total = Math.round(linhas.reduce((s, l) => s + l.valor, 0) * 100) / 100;
  return NextResponse.json({ versao: versao.versao, rotulo: versao.rotulo, conta, mes, total, linhas });
}
