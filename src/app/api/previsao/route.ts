import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR, vencimentoSentinela } from "@/lib/financeiro/alertas";
import { CATEGORIAS, montarPrevisao, type TituloPrevisao } from "@/lib/contratos/previsao";
import { titulosAbertosComCcu } from "@/lib/contratos/titulosPrevistos";

// Previsao por centro de custo (Financeiro), SOMENTE LEITURA: titulos em aberto do Senior, um resumo por CC (so' os que a pessoa pode ver).
// O detalhe de cada CC vem de /api/contratos/[codccu]/previsao. Quem ve todos os CCs tambem recebe o grupo "sem centro de custo".

const SEM_CC = "_sem_cc";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (escopo.tipo === "nenhum") return NextResponse.json({ error: "Sem centros de custo liberados para você" }, { status: 403 });

  const hoje = hojeBR();
  const todos = await titulosAbertosComCcu(prisma);

  const porCcu = new Map<string, TituloPrevisao[]>();
  let semVencimento = 0;
  for (const t of todos) {
    const chave = t.ccu ?? SEM_CC;
    if (chave === SEM_CC ? !escopo.todos : !podeVerCcu(escopo, chave)) continue;
    if (!t.vencimento || vencimentoSentinela(t.vencimento)) { semVencimento += 1; continue; }
    if (!porCcu.has(chave)) porCcu.set(chave, []);
    porCcu.get(chave)!.push({ ...t, vencimento: t.vencimento });
  }

  const nomes = new Map<string, string>();
  for (const c of await prisma.contrato.findMany({ select: { codccu: true, nome: true } })) nomes.set(c.codccu, c.nome);
  const faltam = [...porCcu.keys()].filter((c) => c !== SEM_CC && !nomes.has(c));
  if (faltam.length) {
    for (const c of await prisma.custoContaFinanceira.findMany({ where: { codccu: { in: faltam } }, distinct: ["codccu"], select: { codccu: true, contrato: true } })) {
      nomes.set(c.codccu, c.contrato.replace(new RegExp(`^${c.codccu}\\s*-\\s*`), "").trim() || c.contrato);
    }
  }

  const linhas = [...porCcu.entries()].map(([codccu, titulos]) => {
    const r = montarPrevisao(titulos, hoje);
    return {
      codccu,
      nome: codccu === SEM_CC ? "Sem centro de custo no Senior" : nomes.get(codccu) ?? `CC ${codccu}`,
      total: r.total,
      quantidade: r.quantidade,
      vencidos: r.grupos.reduce((s, g) => s + g.vencidos, 0),
      porCategoria: Object.fromEntries(r.grupos.map((g) => [g.chave, g.total])),
    };
  });
  linhas.sort((a, b) => (a.codccu === SEM_CC ? 1 : b.codccu === SEM_CC ? -1 : b.total - a.total));

  return NextResponse.json({
    hoje,
    categorias: CATEGORIAS.map((c) => ({ chave: c.chave, rotulo: c.rotulo })),
    linhas,
    semVencimento,
  });
}
