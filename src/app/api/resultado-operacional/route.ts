import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, escopoDeVisao, podeVerCcu } from "@/lib/custos/acesso";
import { negarSemModulo, podeAcessarModulo } from "@/lib/acesso/servidor";
import { hojeBR } from "@/lib/financeiro/alertas";
import { COMPETENCIA_PISO } from "@/lib/custos/motorCustoContrato";
import { areaDoCentro } from "@/lib/areas";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { somaMes } from "@/lib/medicao/competencia";
import type { DocConc } from "@/lib/medicao/conciliacao";
import { alinharAosMeses, receitaPorCentro } from "@/lib/resultado/receitaPorCentro";

// Resultado operacional: o que e' do lado da RECEITA e do PESSOAL de cada centro de custo (o custo vem da tela de custos, que o navegador junta). So' dados locais:
// abrir a tela nunca consulta o Senior. Cada pessoa ve os centros que ja pode ver nas telas de receita e custo (mesmo escopo e mesmo filtro de area do topo).
// O custo de pessoal e' dado de remuneracao: so' vem para quem tem o modulo restrito "custo_pessoal"; sem ele `pessoal` vai null e o resultado e' "antes do pessoal".

const MES_ISO = (m: string) => `${m}-01T00:00:00.000Z`;

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  for (const modulo of ["medicao", "custos"] as const) {
    const negado = await negarSemModulo(user, modulo);
    if (negado) return negado;
  }
  const escopo = await escopoDeCustos(prisma, user);
  const visao = await escopoDeVisao(escopo);
  const hoje = hojeBR();
  const mesAtual = hoje.slice(0, 7);
  const de = COMPETENCIA_PISO.slice(0, 7);
  const meses: string[] = [];
  for (let m = de; m <= mesAtual; m = somaMes(m, 1)) meses.push(m);

  const contratos = (await prisma.medicaoContrato.findMany({ where: { codccu: { not: null } }, select: { numCtr: true, codccu: true } }))
    .filter((c) => c.codccu !== null && podeVerCcu(visao, c.codccu));
  const ccusComReceita = [...new Set(contratos.map((c) => c.codccu!))];
  const numeros = contratos.map((c) => c.numCtr);
  const [itens, docs, ultima] = await Promise.all([
    prisma.medicaoItem.findMany({ where: { numCtr: { in: numeros } }, select: { numCtr: true, numPed: true, competencia: true, origem: true, boletim: true, situacao: true, qtd: true, valor: true, dataEmissao: true } }),
    prisma.faturamentoMedicao.findMany({
      where: { codccu: { in: ccusComReceita } },
      select: { chave: true, tipo: true, numero: true, filial: true, serie: true, dataEmissao: true, valor: true, valorLiquido: true, valorDoc: true, codccu: true, competencia: true, origem: true, pedidos: true, situacao: true, duplicadaDe: true, vencimento: true, dataPagamento: true, valorAberto: true },
    }),
    prisma.atualizacaoMedicao.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true, resumo: true } }),
  ]);
  const documentos = docs.map((d) => ({
    ...d,
    tipo: d.tipo as "NF" | "ND",
    origem: d.origem as "PEDIDO" | "EMISSAO" | "ACUMULADO",
    dataEmissao: d.dataEmissao.toISOString().slice(0, 10),
    valorLiquido: d.valorLiquido > 0 ? d.valorLiquido : d.valor,
  })) as DocConc[];
  const receita = receitaPorCentro({
    contratos,
    itens: itens.map((i) => ({ ...i, dataEmissao: i.dataEmissao.toISOString().slice(0, 10) })),
    docs: documentos,
    ccusPermitidos: new Set(ccusComReceita),
    de, ate: mesAtual, hoje,
  });

  // pessoal (CLT): so' com o modulo restrito
  const podePessoal = await podeAcessarModulo(user, "custo_pessoal");
  const pessoal = new Map<string, number[]>();
  let mesesComFolha: string[] = [];
  let pessoalAtualizadoEm: string | null = null;
  if (podePessoal) {
    const grupos = await prisma.custoPessoalMes.groupBy({ by: ["codccu", "competencia"], _sum: { total: true, proLabore: true } });
    const comFolha = new Set<string>();
    for (const g of grupos) {
      const mes = g.competencia.toISOString().slice(0, 7);
      const i = meses.indexOf(mes);
      if (i < 0 || !podeVerCcu(visao, g.codccu)) continue;
      comFolha.add(mes);
      const serie = pessoal.get(g.codccu) ?? meses.map(() => 0);
      serie[i] = Math.round(((serie[i] ?? 0) + (g._sum.total ?? 0) + (g._sum.proLabore ?? 0)) * 100) / 100;
      pessoal.set(g.codccu, serie);
    }
    // meses com folha carregada no banco (qualquer centro), para a tela saber ate onde o custo de pessoal existe
    for (const g of grupos) comFolha.add(g.competencia.toISOString().slice(0, 7));
    mesesComFolha = meses.filter((m) => comFolha.has(m));
    const ult = await prisma.custoPessoalMes.aggregate({ _max: { atualizadoEm: true } });
    pessoalAtualizadoEm = ult._max.atualizadoEm?.toISOString() ?? null;
  }

  // fichas dos centros: todos os que a pessoa ve e tem receita, folha ou ficha
  const fichas = await prisma.contrato.findMany({ select: { codccu: true, nome: true, tipo: true, status: true, cliente: true, numero: true, objeto: true, vigenciaInicio: true, vigenciaFim: true, valor: true } });
  const fichaDe = new Map(fichas.map((f) => [f.codccu, f]));
  const todosCcus = [...new Set([...ccusComReceita, ...pessoal.keys(), ...fichas.map((f) => f.codccu)])].filter((c) => podeVerCcu(visao, c));
  const nomes = await nomesDosCentros(prisma, todosCcus);
  const dia = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null);
  const centros = todosCcus.map((codccu) => {
    const f = fichaDe.get(codccu);
    const r = alinharAosMeses(receita.get(codccu), meses);
    return {
      codccu,
      nome: nomes.get(codccu)?.trim() || f?.nome || `CCU ${codccu}`,
      tipo: (f?.tipo === "ADMINISTRATIVO" ? "ADMINISTRATIVO" : "CONTRATO") as "CONTRATO" | "ADMINISTRATIVO",
      status: (f?.status === "ENCERRADO" ? "ENCERRADO" : "ATIVO") as "ATIVO" | "ENCERRADO",
      area: areaDoCentro(codccu),
      cliente: f?.cliente ?? null,
      numero: f?.numero ?? null,
      objeto: f?.objeto ?? null,
      vigenciaInicio: dia(f?.vigenciaInicio),
      vigenciaFim: dia(f?.vigenciaFim),
      valorContrato: f?.valor ?? null,
      receita: r.receita,
      retencoes: r.retencoes,
      semNota: r.semNota,
      pessoal: podePessoal ? pessoal.get(codccu) ?? meses.map(() => 0) : null,
    };
  });

  const resumo = (ultima?.resumo ?? {}) as { faturamentoErro?: string | null };
  return NextResponse.json(
    { hoje, mesAtual, meses, centros, podePessoal, mesesComFolha, pessoalAtualizadoEm, medicaoAtualizadaEm: ultima?.finalizadoEm ?? null, faturamentoErro: resumo.faturamentoErro ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
