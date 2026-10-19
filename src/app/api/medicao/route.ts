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

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);
  const hoje = hojeBR();
  const mesAtual = hoje.slice(0, 7);

  const estado = await estadoMedicao();
  // abre a tela com dado fresco: se estiver velho, dispara a leitura em segundo plano (nao espera)
  if (estado.dadosVelhos && !estado.emCurso) void dispararMedicao("automático (ao abrir a tela)").catch(() => {});

  const contratos = (await prisma.medicaoContrato.findMany({ orderBy: { numOfi: "asc" } })).filter((c) => (c.codccu ? podeVerCcu(escopo, c.codccu) : escopo.todos));
  const numeros = contratos.map((c) => c.numCtr);
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
      ultimoMes: ultimo ? { mes: ultimo, valor: Math.round((s.get(ultimo) ?? 0) * 100) / 100 } : null,
      serie: ultimos.map((m) => ({ mes: m, valor: Math.round((s.get(m) ?? 0) * 100) / 100 })),
    };
  });

  return NextResponse.json({
    hoje, mesAtual, contratos: lista,
    totais: { contratado: lista.reduce((s, c) => s + c.valorContratado, 0), medido: lista.reduce((s, c) => s + c.valorMedido, 0) },
    atualizacao: { emCurso: estado.emCurso && { etapa: estado.emCurso.etapa, progresso: estado.emCurso.progresso }, ultimaOk: estado.ultimaOk?.finalizadoEm ?? null, erro: estado.ultimoErro?.erro ?? null },
  });
}
