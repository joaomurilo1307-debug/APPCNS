import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hojeBR } from "@/lib/financeiro/alertas";
import { montarAoVivo } from "@/lib/contratos/aoVivo";
import { carregarAoVivo } from "@/lib/contratos/aoVivoServidor";
import { montarPrevisao } from "@/lib/contratos/previsao";
import { itensDePrevisao, lancamentosDeTitulos } from "@/lib/contratos/titulosPrevistos";

// ROTA TEMPORARIA DE DIAGNOSTICO (somente leitura), protegida por x-sync-key. Sera removida apos o uso.
// GET ?rateio=1   -> estado do rateio dos titulos guardado e quantos titulos em aberto ficaram com/sem centro de custo
// GET ?aovivo=CCU -> o que a tela "Ao vivo" mostraria para esse centro de custo (resumo + primeiros lancamentos)
// GET ?previsao=CCU -> o que a aba Previsao mostraria para esse centro de custo (totais por categoria)

const autorizado = (req: Request) => {
  const chave = req.headers.get("x-sync-key");
  return !!chave && chave === process.env.SENIOR_SYNC_KEY;
};

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const sp = new URL(req.url).searchParams;
  const hoje = hojeBR();

  if (sp.get("rateio")) {
    const linhas = await prisma.tituloRateioSenior.count();
    const porTns = await prisma.tituloRateioSenior.groupBy({ by: ["codTns"], _count: { _all: true } });
    const porTipo = await prisma.tituloRateioSenior.groupBy({ by: ["codTpt"], _count: { _all: true } });
    const { itens } = await lancamentosDeTitulos(prisma, { somenteAbertos: true });
    const agg = (l: typeof itens) => ({ linhas: l.length, valor: Math.round(l.reduce((s, t) => s + t.valorAberto, 0)) });
    const porOrigem: Record<string, ReturnType<typeof agg>> = {};
    for (const o of ["rateio", "titulo", "oc", "oc-rateada", "nenhuma"]) porOrigem[o] = agg(itens.filter((t) => (t.origemCcu ?? "nenhuma") === o));
    const prv = itens.filter((t) => t.tipo === "PRV");
    const porOrigemPrv: Record<string, ReturnType<typeof agg>> = {};
    for (const o of ["rateio", "titulo", "oc", "oc-rateada", "nenhuma"]) porOrigemPrv[o] = agg(prv.filter((t) => (t.origemCcu ?? "nenhuma") === o));
    // titulos com mais de uma transacao de entrada/previsao OU com CCs diferentes entre transacoes (para avaliar a regra de proporcao)
    const todas = await prisma.tituloRateioSenior.findMany({ select: { numTit: true, codFil: true, codTpt: true, codFor: true, codTns: true, codccu: true } });
    const porTitulo = new Map<string, { tns: Set<string>; ccus: Set<string> }>();
    for (const r of todas) {
      const k = `${r.numTit}|${r.codFil}|${r.codTpt}|${r.codFor}`;
      const e = porTitulo.get(k) ?? { tns: new Set(), ccus: new Set() };
      e.tns.add(r.codTns); e.ccus.add(r.codccu);
      porTitulo.set(k, e);
    }
    const multiTns = [...porTitulo.values()].filter((e) => e.tns.size > 1).length;
    const multiCcu = [...porTitulo.values()].filter((e) => e.ccus.size > 1).length;
    const ult = await prisma.atualizacaoCusto.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true, resumo: true } });
    return NextResponse.json({ linhasGuardadas: linhas, porTns: porTns.map((x) => [x.codTns, x._count._all]), porTipo: porTipo.map((x) => [x.codTpt, x._count._all]), titulosComRateio: porTitulo.size, titulosComMaisDeUmaTransacao: multiTns, titulosEmMaisDeUmCcu: multiCcu, emAbertoPorOrigemDoCc: porOrigem, previsoesPrvPorOrigemDoCc: porOrigemPrv, ultimaAtualizacao: ult?.finalizadoEm, rateioDosTitulos: (ult?.resumo as any)?.rateioDosTitulos ?? null });
  }

  if (sp.get("aovivo")) {
    const ccu = sp.get("aovivo") as string;
    const dados = await carregarAoVivo(prisma, hoje);
    const r = montarAoVivo(dados.itens, { ccu, situacao: (sp.get("situacao") as any) || "todas", conta: sp.get("conta"), q: sp.get("q") });
    return NextResponse.json({ atualizadoEm: dados.atualizadoEm, ocsSemRateioLegivel: dados.ocsSemRateioLegivel, itensNoTotal: dados.itens.length, total: r.total, resumo: r.resumo, linhasDeCusto: r.linhasDeCusto.slice(0, 15), primeiros: r.itens.slice(0, 10).map((i) => `${i.data} | ${i.pagamento} | ${i.ocRotulo} | ${i.fornecedor} | ${i.linhaCusto} | ${i.valor} | ${(i.descricao ?? "").slice(0, 60)}`) });
  }

  if (sp.get("previsao")) {
    const ccu = sp.get("previsao") as string;
    const itens = await itensDePrevisao(prisma);
    const doCc = itens.filter((t) => t.ccu === ccu).map((t) => ({ ...t, vencimento: t.vencimento ?? "" }));
    const r = montarPrevisao(doCc, hoje);
    return NextResponse.json({ total: r.total, quantidade: r.quantidade, grupos: r.grupos.map((g) => ({ chave: g.chave, total: Math.round(g.total), n: g.quantidade, vencidos: Math.round(g.vencidos), porTipoValor: g.porTipoValor })) });
  }
  return NextResponse.json({ ok: true });
}
