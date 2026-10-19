import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR, vencimentoSentinela } from "@/lib/financeiro/alertas";
import { montarPrevisao, type TituloPrevisao } from "@/lib/contratos/previsao";

// Previsao do contrato (centro de custo), SOMENTE LEITURA: titulos em aberto que o Senior ja tem para este CCU, agrupados por categoria.
// Nao grava nada e nao mistura com o realizado (a aba Custos mostra so' o que foi pago). Mesmo controle de acesso das demais abas do contrato.

const LIMITE_TITULOS_POR_GRUPO = 400;

export async function GET(_req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (!podeVerCcu(escopo, params.codccu)) return NextResponse.json({ error: "Sem permissão para este contrato" }, { status: 403 });

  const hoje = hojeBR();
  const abertos = await prisma.tituloContasAPagar.findMany({
    where: { codccu: params.codccu, pago: false },
    select: { numTit: true, tipo: true, fornecedorNome: true, descricao: true, numOcp: true, numNfc: true, vencimentoProgramado: true, vencimentoOriginal: true, valorAberto: true },
  });

  let semVencimento = 0;
  const titulos: TituloPrevisao[] = [];
  for (const t of abertos) {
    const v = (t.vencimentoProgramado ?? t.vencimentoOriginal)?.toISOString().slice(0, 10);
    if (!v || vencimentoSentinela(v)) { semVencimento += 1; continue; }
    if (t.valorAberto <= 0) continue;
    titulos.push({ numTit: t.numTit, tipo: t.tipo, fornecedorNome: t.fornecedorNome, descricao: t.descricao, numOcp: t.numOcp, numNfc: t.numNfc, vencimento: v, valorAberto: t.valorAberto });
  }

  const r = montarPrevisao(titulos, hoje);
  const grupos = r.grupos.map((g) => ({ ...g, titulos: g.titulos.slice(0, LIMITE_TITULOS_POR_GRUPO), titulosOcultos: Math.max(0, g.titulos.length - LIMITE_TITULOS_POR_GRUPO) }));
  return NextResponse.json({ codccu: params.codccu, hoje, meses: r.meses, grupos, total: r.total, quantidade: r.quantidade, semVencimento });
}
