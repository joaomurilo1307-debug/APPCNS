import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR, vencimentoSentinela } from "@/lib/financeiro/alertas";
import { ehContaForaDoCusto, montarPrevisao, type TituloPrevisao } from "@/lib/contratos/previsao";
import { itensDePrevisao } from "@/lib/contratos/titulosPrevistos";
import { nomeConta } from "@/lib/custos/planoContas";

// Previsao do contrato (centro de custo), SOMENTE LEITURA: titulos em aberto que o Senior ja tem para este CCU (CC do proprio titulo ou da OC vinculada), agrupados por categoria.
// Nao grava nada e nao mistura com o realizado (a aba Custos mostra so' o que foi pago). Mesmo controle de acesso das demais abas do contrato.

const LIMITE_TITULOS_POR_GRUPO = 400;
const SEM_CC = "_sem_cc"; // pseudo-centro de custo: titulos em aberto que nao tem CC no Senior (nem no titulo, nem em OC de um so' CC)

export async function GET(_req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (!podeVerCcu(escopo, params.codccu)) return NextResponse.json({ error: "Sem permissão para este contrato" }, { status: 403 });

  const hoje = hojeBR();
  const todos = await itensDePrevisao(prisma, hoje);

  let semVencimento = 0;
  const foraDoCusto = { n: 0, valor: 0 }; // pessoal e impostos: ficam no Custo de pessoal
  const titulos: TituloPrevisao[] = [];
  for (const t of todos) {
    if (params.codccu === SEM_CC ? !!t.ccu : t.ccu !== params.codccu) continue;
    if (ehContaForaDoCusto(t.ctaFin)) { foraDoCusto.n += 1; foraDoCusto.valor += t.valorAberto; continue; }
    const semData = !t.vencimento || vencimentoSentinela(t.vencimento);
    if (semData && t.tipo !== "OC") { semVencimento += 1; continue; } // titulo sem data valida nao entra; OC sem previsao de pagamento entra como "sem data"
    titulos.push({ ...t, vencimento: semData ? "" : (t.vencimento as string), contaNome: t.ctaFin ? nomeConta(t.ctaFin) ?? `Conta ${t.ctaFin}` : null });
  }

  // Aviso geral (so' para quem ve todos os centros de custo): titulos em aberto que nao puderam ser ligados a nenhum CC.
  let semCentroDeCusto: { quantidade: number; valor: number; ocRateada: number } | null = null;
  if (escopo.todos && params.codccu !== SEM_CC) {
    const sem = todos.filter((t) => !t.ccu);
    semCentroDeCusto = { quantidade: sem.length, valor: sem.reduce((s, t) => s + t.valorAberto, 0), ocRateada: sem.filter((t) => t.origemCcu === "oc-rateada").length };
  }

  const r = montarPrevisao(titulos, hoje);
  const grupos = r.grupos.map((g) => ({ ...g, titulos: g.titulos.slice(0, LIMITE_TITULOS_POR_GRUPO), titulosOcultos: Math.max(0, g.titulos.length - LIMITE_TITULOS_POR_GRUPO) }));
  return NextResponse.json({ codccu: params.codccu, hoje, meses: r.meses, grupos, total: r.total, quantidade: r.quantidade, semVencimento, semCentroDeCusto, foraDoCusto: { n: foraDoCusto.n, valor: Math.round(foraDoCusto.valor * 100) / 100 } });
}
