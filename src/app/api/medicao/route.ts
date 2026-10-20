import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { dispararMedicao, estadoMedicao } from "@/lib/medicao/sincronizar";
import { somaMes } from "@/lib/medicao/competencia";

// Lista dos contratos com Medicao (so' os que tem linhas contratadas no Senior), com o resumo de cada um: contratado, medido, saldo e os ultimos meses.
// Cada pessoa ve os contratos dos centros de custo que ja pode ver; contrato ainda sem centro de custo identificado so' aparece para quem ve tudo.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  const hoje = hojeBR();
  const mesAtual = hoje.slice(0, 7);

  const estado = await estadoMedicao();
  // abre a tela com dado fresco: se estiver velho, dispara a leitura em segundo plano (nao espera)
  if (estado.dadosVelhos && !estado.emCurso) void dispararMedicao("automático (ao abrir a tela)").catch(() => {});

  const visiveis = (await prisma.medicaoContrato.findMany({ orderBy: { numOfi: "asc" } })).filter((c) => (c.codccu ? podeVerCcu(escopo, c.codccu) : escopo.todos));
  // "tem medicao" = ja houve pelo menos um item de pedido ou valor faturado; os demais so' aparecem se pedido (e so' para quem ve tudo)
  const comMedicao = new Set((await prisma.medicaoItem.groupBy({ by: ["numCtr"], where: { numCtr: { in: visiveis.map((c) => c.numCtr) } } })).map((x) => x.numCtr));
  const ccusComNota = new Set((await prisma.faturamentoMedicao.findMany({ where: { codccu: { in: visiveis.map((c) => c.codccu).filter((x): x is string => !!x) } }, select: { codccu: true }, distinct: ["codccu"] })).map((x) => x.codccu));
  const temMedicao = (c: { numCtr: string; valorMedido: number; codccu: string | null }) => comMedicao.has(c.numCtr) || c.valorMedido > 0 || (!!c.codccu && ccusComNota.has(c.codccu)); // contrato so' com nota (ex.: aluguel por ND) tambem aparece
  const incluirSem = escopo.todos && new URL(req.url).searchParams.get("todos") === "1";
  const semMedicao = visiveis.filter((c) => !temMedicao(c)).length;
  const contratos = visiveis.filter((c) => temMedicao(c) || incluirSem);
  const numeros = contratos.map((c) => c.numCtr);
  // consumo por quantidade (fisico) de cada contrato: media do consumo de quantidade das linhas, ponderada pelo valor contratado (cada linha conta ate 100%)
  const linhasDb = await prisma.medicaoLinha.findMany({ where: { numCtr: { in: numeros } }, select: { numCtr: true, qtdContratada: true, valorContratado: true, qtdFaturada: true } });
  const fisico = new Map<string, { pesos: number; soma: number; linhas: number; esgotadas: number; acima80: number }>();
  for (const l of linhasDb) {
    const f = fisico.get(l.numCtr) ?? { pesos: 0, soma: 0, linhas: 0, esgotadas: 0, acima80: 0 };
    f.linhas += 1;
    if (l.qtdContratada > 0) {
      const pct = l.qtdFaturada / l.qtdContratada;
      if (l.valorContratado > 0) { f.pesos += l.valorContratado; f.soma += Math.min(1, pct) * l.valorContratado; }
      if (l.qtdContratada - l.qtdFaturada <= 0.0005) f.esgotadas += 1; else if (pct >= 0.8) f.acima80 += 1;
    }
    fisico.set(l.numCtr, f);
  }
  const porMes = await prisma.medicaoItem.groupBy({ by: ["numCtr", "competencia"], where: { numCtr: { in: numeros } }, _sum: { valor: true } });
  const serie = new Map<string, Map<string, number>>();
  for (const x of porMes) {
    const m = serie.get(x.numCtr) ?? new Map<string, number>();
    m.set(x.competencia, x._sum.valor ?? 0);
    serie.set(x.numCtr, m);
  }
  const nomes = await nomesDosCentros(prisma, [...new Set(contratos.map((c) => c.codccu).filter((c): c is string => !!c))]);
  const ultimos = Array.from({ length: 12 }, (_, i) => somaMes(mesAtual, i - 11));

  const lista = contratos.map((c) => {
    const s = serie.get(c.numCtr) ?? new Map<string, number>();
    const mesesComMedicao = [...s.keys()].sort();
    const ultimo = mesesComMedicao[mesesComMedicao.length - 1] ?? null;
    return {
      numCtr: c.numCtr, numOfi: c.numOfi, codccu: c.codccu, ccuNome: c.codccu ? nomes.get(c.codccu) ?? `CC ${c.codccu}` : null, maisDeUmCcu: (c.codccusItens ?? "").includes(","),
      valorContratado: c.valorContratado, valorMedido: c.valorMedido, saldo: Math.round((c.valorContratado - c.valorMedido) * 100) / 100, pct: c.valorContratado > 0 ? c.valorMedido / c.valorContratado : 0,
      pctFisico: (fisico.get(c.numCtr)?.pesos ?? 0) > 0 ? (fisico.get(c.numCtr)!.soma / fisico.get(c.numCtr)!.pesos) : 0, nLinhas: fisico.get(c.numCtr)?.linhas ?? 0, linhasEsgotadas: fisico.get(c.numCtr)?.esgotadas ?? 0, linhasAcima80: fisico.get(c.numCtr)?.acima80 ?? 0, temMedicao: temMedicao(c),
      ultimoMes: ultimo ? { mes: ultimo, valor: Math.round((s.get(ultimo) ?? 0) * 100) / 100 } : null,
      serie: ultimos.map((m) => ({ mes: m, valor: Math.round((s.get(m) ?? 0) * 100) / 100 })),
    };
  });

  return NextResponse.json({
    hoje, mesAtual, contratos: lista, semMedicao: escopo.todos ? semMedicao : 0, incluiuSemMedicao: incluirSem,
    totais: { contratado: lista.reduce((s, c) => s + c.valorContratado, 0), medido: lista.reduce((s, c) => s + c.valorMedido, 0) },
    atualizacao: { emCurso: estado.emCurso && { etapa: estado.emCurso.etapa, progresso: estado.emCurso.progresso }, ultimaOk: estado.ultimaOk?.finalizadoEm ?? null, erro: estado.ultimoErro?.erro ?? null },
  });
}
