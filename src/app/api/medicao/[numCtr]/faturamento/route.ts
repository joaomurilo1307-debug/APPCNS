import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { somaMes } from "@/lib/medicao/competencia";
import { conciliar } from "@/lib/medicao/conciliacao";

// Receita do contrato mes a mes: medicao (notas fiscais) + notas de debito, bruta e liquida, conferida com as linhas dos pedidos do contrato.
// O contrato vale pelos SEUS pedidos (nunca pelo centro de custo do rateio do item); as notas valem pelo centro de custo principal do contrato.
// Contratos que dividem o mesmo centro de custo principal (ex.: PM Contagem, dois numeros no Senior para o mesmo contrato) entram juntos.
// Tudo do Senior, somente leitura. Mesmo controle de acesso do contrato.

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: Request, { params }: { params: { numCtr: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);

  const c = await prisma.medicaoContrato.findUnique({ where: { numCtr: params.numCtr } });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado na Medição" }, { status: 404 });
  if (c.codccu ? !podeVerCcu(escopo, c.codccu) : !escopo.todos) return NextResponse.json({ error: "Sem permissão para este contrato" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const mesAtual = hojeBR().slice(0, 7);
  let ate = sp.get("ate") ?? "", de = sp.get("de") ?? "";
  if (!MES.test(ate)) ate = mesAtual;
  if (!MES.test(de)) de = somaMes(ate, -11);
  if (de > ate) [de, ate] = [ate, de];
  if (somaMes(de, 47) < ate) de = somaMes(ate, -47);

  const ult = await prisma.atualizacaoMedicao.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true, resumo: true } });
  const resumo = (ult?.resumo ?? {}) as { faturamentoErro?: string | null };
  const base = { atualizadoEm: ult?.finalizadoEm ?? null, faturamentoErro: resumo.faturamentoErro ?? null };
  if (!c.codccu) return NextResponse.json({ ...base, ccu: null, conciliacao: null, contratos: [c.numOfi], semFaturamento: true });

  const grupo = await prisma.medicaoContrato.findMany({ where: { codccu: c.codccu }, select: { numCtr: true, numOfi: true } });
  const [itens, docs, nomes] = await Promise.all([
    prisma.medicaoItem.findMany({ where: { numCtr: { in: grupo.map((g) => g.numCtr) } }, select: { numPed: true, competencia: true, origem: true, boletim: true, situacao: true, qtd: true, valor: true, dataEmissao: true } }),
    prisma.faturamentoMedicao.findMany({ where: { codccu: { not: null } } }), // todos os centros de custo: o aviso de nota em outro CC precisa deles
    nomesDosCentros(prisma, [c.codccu]),
  ]);
  const doc = (d: (typeof docs)[number]) => ({ chave: d.chave, tipo: d.tipo as "NF" | "ND", numero: d.numero, filial: d.filial, serie: d.serie, dataEmissao: d.dataEmissao.toISOString().slice(0, 10), valor: d.valor, valorLiquido: d.valorLiquido > 0 ? d.valorLiquido : d.valor, valorDoc: d.valorDoc, codccu: d.codccu, competencia: d.competencia, origem: d.origem as "PEDIDO" | "EMISSAO" | "ACUMULADO", pedidos: d.pedidos, situacao: d.situacao, duplicadaDe: d.duplicadaDe, vencimento: d.vencimento, dataPagamento: d.dataPagamento, valorAberto: d.valorAberto });
  const conc = conciliar(
    itens.map((i) => ({ ...i, dataEmissao: i.dataEmissao.toISOString().slice(0, 10) })),
    docs.filter((d) => d.codccu === c.codccu).map(doc),
    docs.filter((d) => d.codccu !== c.codccu).map(doc),
    de, ate, hojeBR(),
  );
  return NextResponse.json({
    ...base, ccu: c.codccu, ccuNome: nomes.get(c.codccu) ?? `CC ${c.codccu}`, de, ate, mesAtual, conciliacao: conc,
    contratos: grupo.map((g) => g.numOfi), semFaturamento: docs.length === 0,
  });
}
