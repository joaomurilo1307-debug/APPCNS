// Auditoria de integridade do Custo por Centro de Custo (somente leitura): confere que cada celula (CCU x conta x mes) e' a
// soma exata dos lancamentos por tras dela, que nada ficou orfao, que os lancamentos existem nas outras abas do sistema
// (Programacao de Pagamento) e quais centros de custo ainda nao tem equipe -- sem equipe, nenhum coordenador enxerga.

import type { prisma as prismaReal } from "@/lib/prisma";

export type ItemAuditoria = { codccu: string; contaFinanceira: string; competencia: string; valor: number };
export type SomaDetalhe = { codccu: string; contaFinanceira: string; competencia: string; soma: number };
export type Divergencia = { codccu: string; contaFinanceira: string; competencia: string; celula: number; lancamentos: number; diferenca: number };

const chave = (a: { codccu: string; contaFinanceira: string; competencia: string }) => `${a.codccu}|${a.contaFinanceira}|${a.competencia}`;
const arred = (n: number) => Math.round(n * 100) / 100;

/** PURA: cada celula tem que ser igual a soma dos seus lancamentos (tolerancia de 1 centavo). */
export function compararItensComDetalhe(itens: ReadonlyArray<ItemAuditoria>, detalhes: ReadonlyArray<SomaDetalhe>) {
  const somas = new Map(detalhes.map((d) => [chave(d), d.soma]));
  const vistos = new Set<string>();
  const divergencias: Divergencia[] = [];
  let celulasSemLancamento = 0;
  for (const i of itens) {
    const k = chave(i);
    vistos.add(k);
    const soma = somas.get(k);
    if (soma === undefined) {
      celulasSemLancamento++;
      divergencias.push({ ...i, celula: arred(i.valor), lancamentos: 0, diferenca: arred(i.valor) });
      continue;
    }
    if (Math.abs(soma - i.valor) > 0.011) divergencias.push({ codccu: i.codccu, contaFinanceira: i.contaFinanceira, competencia: i.competencia, celula: arred(i.valor), lancamentos: arred(soma), diferenca: arred(i.valor - soma) });
  }
  const lancamentosSemCelula = detalhes.filter((d) => !vistos.has(chave(d)));
  for (const d of lancamentosSemCelula) divergencias.push({ codccu: d.codccu, contaFinanceira: d.contaFinanceira, competencia: d.competencia, celula: 0, lancamentos: arred(d.soma), diferenca: arred(-d.soma) });
  return { divergencias, celulasSemLancamento, lancamentosSemCelula: lancamentosSemCelula.length };
}

export async function auditarCustos(db: typeof prismaReal) {
  const [itensBrutos, somasBrutas, qtdDetalhe, semData, semFornecedor] = await Promise.all([
    db.custoContaFinanceira.findMany({ select: { codccu: true, contaFinanceira: true, competencia: true, valor: true, teamId: true, contrato: true } }),
    db.custoFinanceiroDetalhe.groupBy({ by: ["codccu", "contaFinanceira", "competencia"], _sum: { valorRateado: true } }),
    db.custoFinanceiroDetalhe.count(),
    db.custoFinanceiroDetalhe.count({ where: { dataEntrada: null } }),
    db.custoFinanceiroDetalhe.count({ where: { fornecedorNome: null } }),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const itens = itensBrutos.map((i) => ({ codccu: i.codccu, contaFinanceira: i.contaFinanceira, competencia: iso(i.competencia), valor: i.valor }));
  const somas = somasBrutas.map((s) => ({ codccu: s.codccu, contaFinanceira: s.contaFinanceira, competencia: iso(s.competencia), soma: s._sum.valorRateado ?? 0 }));
  const cmp = compararItensComDetalhe(itens, somas);

  const porMes = (xs: { competencia: string; v: number }[]) => {
    const m: Record<string, number> = {};
    for (const x of xs) m[x.competencia.slice(0, 7)] = arred((m[x.competencia.slice(0, 7)] ?? 0) + x.v);
    return Object.fromEntries(Object.entries(m).sort());
  };

  // centros de custo sem equipe vinculada: nenhum coordenador (so' ADMIN/DIRETOR/verTodosCustos) enxerga
  const semEquipeMapa = new Map<string, { contrato: string; total: number }>();
  for (const i of itensBrutos) {
    if (i.teamId) continue;
    const a = semEquipeMapa.get(i.codccu) ?? { contrato: i.contrato, total: 0 };
    a.total += i.valor;
    semEquipeMapa.set(i.codccu, a);
  }

  // os lancamentos existem na Programacao de Pagamento (outra aba)? -- so' o que falta la nao abre o dossie do titulo
  const titulosDoDetalhe = await db.custoFinanceiroDetalhe.findMany({ distinct: ["numTit", "codFor"], select: { numTit: true, codFor: true } });
  const naProgramacao = new Set((await db.tituloContasAPagar.findMany({ select: { numTit: true, codFor: true } })).map((t) => `${t.numTit}|${t.codFor}`));
  const faltandoNaProgramacao = titulosDoDetalhe.filter((t) => !naProgramacao.has(`${t.numTit}|${t.codFor}`));

  // equipes do sistema e quais ja estao ligadas a um CCU (Team.codccu) -- e' essa ligacao que da' acesso ao coordenador
  const equipes = await db.team.findMany({ select: { name: true, codccu: true, _count: { select: { members: true } } } });

  return {
    equipes: {
      total: equipes.length,
      comCodccu: equipes.filter((e) => e.codccu).map((e) => ({ nome: e.name, codccu: e.codccu, membros: e._count.members })),
      semCodccu: equipes.filter((e) => !e.codccu).length,
    },
    celulas: itens.length,
    lancamentos: qtdDetalhe,
    totalCelulasPorMes: porMes(itens.map((i) => ({ competencia: i.competencia, v: i.valor }))),
    totalLancamentosPorMes: porMes(somas.map((s) => ({ competencia: s.competencia, v: s.soma }))),
    divergenciasCelulaXLancamentos: cmp.divergencias.length,
    celulasSemLancamento: cmp.celulasSemLancamento,
    lancamentosSemCelula: cmp.lancamentosSemCelula,
    primeirasDivergencias: cmp.divergencias.slice(0, 15),
    lancamentosSemDataDeEntrada: semData,
    lancamentosSemNomeDeFornecedor: semFornecedor,
    titulosDistintos: titulosDoDetalhe.length,
    titulosForaDaProgramacaoDePagamento: faltandoNaProgramacao.length,
    centrosDeCustoSemEquipe: Array.from(semEquipeMapa.entries())
      .map(([codccu, v]) => ({ codccu, contrato: v.contrato, total: arred(v.total) }))
      .sort((a, b) => b.total - a.total),
  };
}
