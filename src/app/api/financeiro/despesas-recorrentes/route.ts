import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { hojeBR, vencimentoSentinela } from "@/lib/financeiro/alertas";
import { montarRecorrentes } from "@/lib/financeiro/recorrentes";

// Relatorio de despesas recorrentes (somente leitura): previsoes PRV do Senior x o que foi lancado de fato.
// Le a tabela de titulos que o sincronismo ja alimenta a partir da Senior; nao grava nada.


export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const negado = await negarSemModulo(session.user as any, "despesas_recorrentes");
  if (negado) return negado;

  const hoje = hojeBR();
  // So' quem tem previsao interessa; traz os titulos reais desses fornecedores a partir de 6 meses atras.
  const prv = await prisma.tituloContasAPagar.findMany({
    where: { tipo: "PRV", vencimentoProgramado: { not: null } },
    select: { numTit: true, tipo: true, codFor: true, fornecedorNome: true, vencimentoProgramado: true, valorOriginal: true },
  });
  const fornecedores = [...new Set(prv.map((t) => t.codFor))];
  const desde = new Date(`${hoje}T00:00:00Z`);
  desde.setUTCMonth(desde.getUTCMonth() - 6);
  const reais = await prisma.tituloContasAPagar.findMany({
    where: { tipo: { not: "PRV" }, codFor: { in: fornecedores }, vencimentoProgramado: { gte: desde } },
    select: { numTit: true, tipo: true, codFor: true, fornecedorNome: true, vencimentoProgramado: true, valorOriginal: true },
  });
  const titulos = [...prv, ...reais]
    .map((t) => ({ numTit: t.numTit, tipo: t.tipo, codFor: t.codFor, fornecedorNome: t.fornecedorNome, vencimento: t.vencimentoProgramado!.toISOString().slice(0, 10), valor: t.valorOriginal }))
    .filter((t) => !vencimentoSentinela(t.vencimento));
  return NextResponse.json({ hoje, grupos: montarRecorrentes(titulos, hoje) });
}
