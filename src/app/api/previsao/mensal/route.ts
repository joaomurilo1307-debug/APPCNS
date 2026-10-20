import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, escopoDeVisao, podeVerCcu } from "@/lib/custos/acesso";
import { nomeConta } from "@/lib/custos/planoContas";
import { hojeBR, vencimentoSentinela } from "@/lib/financeiro/alertas";
import { CATEGORIAS, ehContaForaDoCusto, somaMeses, type CategoriaPrevisao } from "@/lib/contratos/previsao";
import { SEM_CCU, mesesEntre, montarMensal, prepararItens, type NaturezaPrevisao } from "@/lib/contratos/previsaoMensal";
import { DIMENSOES, chaveDaDim, montarPlanilha, type DimPlanilha } from "@/lib/contratos/previsaoPlanilha";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { itensDePrevisao } from "@/lib/contratos/titulosPrevistos";

// Previsao mes a mes (SOMENTE LEITURA): o que o Senior ja tem programado (titulos em aberto e OCs com data) e o que esta previsto (PRV),
// por mes, com filtro de periodo, centro de custo e linha de custo, e o detalhe de qualquer mes. Cada pessoa so' ve os centros de custo liberados.

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const CATEGORIA = new Set<string>(CATEGORIAS.map((c) => c.chave));

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (escopo.tipo === "nenhum") return NextResponse.json({ error: "Sem centros de custo liberados para você" }, { status: 403 });
  const visao = await escopoDeVisao(escopo); // filtro de area do topo das telas: so' estreita a lista; as checagens de acesso usam o escopo

  const sp = new URL(req.url).searchParams;
  const hoje = hojeBR();
  const mesAtual = hoje.slice(0, 7);
  let de = sp.get("de") ?? "";
  let ate = sp.get("ate") ?? "";
  if (!MES.test(de)) de = mesAtual;
  if (!MES.test(ate)) ate = somaMeses(de, 11);
  if (ate < de) [de, ate] = [ate, de];
  if (mesesEntre(de, ate, 40).length > 36) ate = somaMeses(de, 35);

  const ccu = sp.get("ccu") || null;
  if (ccu && (ccu === SEM_CCU ? !escopo.todos : !podeVerCcu(escopo, ccu))) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });
  const categoriaParam = sp.get("categoria");
  const categoria = categoriaParam && CATEGORIA.has(categoriaParam) ? (categoriaParam as CategoriaPrevisao) : null;
  const naturezaParam = sp.get("natureza");
  const natureza: NaturezaPrevisao | null = naturezaParam === "PROGRAMADO" || naturezaParam === "PREVISTO" ? naturezaParam : null;
  const mes = sp.get("mes") || null;

  const todos = await itensDePrevisao(prisma, hoje);
  const foraDoCusto = { n: 0, valor: 0 }; // pessoal e impostos: ficam no Custo de pessoal
  let semVencimento = 0;
  const brutos = [];
  for (const t of todos) {
    if (t.ccu ? !podeVerCcu(visao, t.ccu) : !visao.todos) continue;
    if (ehContaForaDoCusto(t.ctaFin)) { foraDoCusto.n += 1; foraDoCusto.valor += t.valorAberto; continue; }
    const semData = !t.vencimento || vencimentoSentinela(t.vencimento);
    if (semData && t.tipo !== "OC") { semVencimento += 1; continue; } // titulo sem data valida nao entra; OC sem previsao de pagamento entra em "sem data"
    brutos.push({ ...t, vencimento: semData ? "" : (t.vencimento as string), contaNome: t.ctaFin ? nomeConta(t.ctaFin) ?? `Conta ${t.ctaFin}` : null });
  }

  const itens = prepararItens(brutos);
  const filtros = { de, ate, ccu, conta: sp.get("conta"), categoria, natureza, q: sp.get("q") };
  const dimParam = sp.get("dim");
  const dim: DimPlanilha = DIMENSOES.includes(dimParam as DimPlanilha) ? (dimParam as DimPlanilha) : "conta";
  const filhoDim: DimPlanilha = dim === "fornecedor" ? "conta" : "fornecedor";
  // detalhe de uma celula da planilha: restringe a lista do mes a uma linha (e, opcionalmente, a uma linha filha)
  const grupo = sp.get("grupo");
  const filho = sp.get("filho");
  const celula = grupo ? (i: (typeof itens)[number]) => chaveDaDim(i, dim) === grupo && (!filho || chaveDaDim(i, filhoDim) === filho) : null;
  const r = montarMensal(itens, filtros, mes, Number(sp.get("pagina")) || 1, 50, celula);

  const nomes = await nomesDosCentros(prisma, [...new Set(itens.map((i) => i.ccu))].filter((c) => c !== SEM_CCU));
  const nomeCcu = (c: string) => (c === SEM_CCU ? "Sem centro de custo no Senior" : nomes.get(c) ?? `CC ${c}`);
  const planilha = montarPlanilha(itens, filtros, dim, { ccu: nomeCcu, conta: (cod) => nomeConta(cod) ?? `Conta ${cod}` });
  const rotuloCategoria = new Map<string, string>(CATEGORIAS.map((c) => [c.chave, c.rotulo]));
  const sincronizado = await prisma.tituloContasAPagar.aggregate({ _max: { atualizadoEm: true } });

  return NextResponse.json({
    hoje, mesAtual, periodo: { de, ate },
    meses: r.meses, antes: r.antes, depois: r.depois, semData: r.semData, totais: r.totais,
    centros: r.centros.map((c) => ({ ...c, nome: nomeCcu(c.ccu) })),
    linhasDeCusto: r.linhasDeCusto.map((l) => ({ ...l, nome: l.cod === "_sem_linha" ? "Sem linha de custo informada" : nomeConta(l.cod) ?? `Conta ${l.cod}` })),
    categorias: r.categorias,
    planilha,
    celula: grupo ? { dim, grupo, filho } : null,
    drill: r.drill && { ...r.drill, itens: r.drill.itens.map((i) => ({ ...i, ccuNome: nomeCcu(i.ccu), categoriaRotulo: rotuloCategoria.get(i.categoria) ?? i.categoria })) },
    foraDoCusto: { n: foraDoCusto.n, valor: Math.round(foraDoCusto.valor * 100) / 100 },
    semVencimento,
    sincronizadoEm: sincronizado._max.atualizadoEm?.toISOString() ?? null,
  });
}
