import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { somaMes } from "@/lib/medicao/competencia";
import { conciliar } from "@/lib/medicao/conciliacao";

// Medicao (pedidos) x Faturamento (NF e ND) de um centro de custo do contrato, mes a mes. Tudo do Senior, somente leitura. Mesmo controle de acesso do contrato.

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

  // centros de custo do contrato: o principal e os demais que aparecem nos itens. Um centro que o usuario nao pode ver nao entra na lista.
  const todos = [...new Set([c.codccu, ...(c.codccusItens ?? "").split(",")].filter((x): x is string => !!x))].filter((x) => escopo.todos || podeVerCcu(escopo, x));
  const pedido = sp.get("ccu");
  const ccu = pedido && todos.includes(pedido) ? pedido : todos[0] ?? null;
  const nomes = await nomesDosCentros(prisma, todos);
  const ccus = todos.map((x) => ({ codccu: x, nome: nomes.get(x) ?? `CC ${x}`, principal: x === c.codccu }));

  const ult = await prisma.atualizacaoMedicao.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true, resumo: true } });
  const resumo = (ult?.resumo ?? {}) as { faturamentoErro?: string | null; faturamento?: { documentos?: number } | null };
  if (!ccu) return NextResponse.json({ ccu: null, ccus, conciliacao: null, outrosContratos: [], atualizadoEm: ult?.finalizadoEm ?? null, faturamentoErro: resumo.faturamentoErro ?? null, semFaturamento: true });

  const [itens, docs] = await Promise.all([
    prisma.medicaoItem.findMany({ where: { codccu: { not: null } }, select: { numCtr: true, numPed: true, competencia: true, origem: true, boletim: true, situacao: true, qtd: true, valor: true, codccu: true, dataEmissao: true } }),
    prisma.faturamentoMedicao.findMany({ where: { codccu: { not: null } } }), // todos os centros de custo: o aviso de nota em outro CC precisa deles
  ]);
  const conc = conciliar(
    itens.map((i) => ({ ...i, dataEmissao: i.dataEmissao.toISOString().slice(0, 10) })),
    docs.map((d) => ({ chave: d.chave, tipo: d.tipo as "NF" | "ND", numero: d.numero, filial: d.filial, serie: d.serie, dataEmissao: d.dataEmissao.toISOString().slice(0, 10), valor: d.valor, valorDoc: d.valorDoc, codccu: d.codccu, competencia: d.competencia, origem: d.origem as "PEDIDO" | "EMISSAO" | "ACUMULADO", pedidos: d.pedidos, situacao: d.situacao })),
    ccu, de, ate,
  );

  // outros contratos com pedido neste mesmo centro de custo (o faturamento e' do centro de custo, nao do contrato)
  const porContrato = new Map<string, number>();
  for (const i of itens) if (i.codccu === ccu && i.competencia !== "0000-00") porContrato.set(i.numCtr, (porContrato.get(i.numCtr) ?? 0) + i.valor);
  const outros = [...porContrato.entries()].filter(([n]) => n !== c.numCtr);
  const nomesCtr = outros.length ? await prisma.medicaoContrato.findMany({ where: { numCtr: { in: outros.map(([n]) => n) } }, select: { numCtr: true, numOfi: true } }) : [];
  return NextResponse.json({
    ccu, ccuNome: nomes.get(ccu) ?? `CC ${ccu}`, ccus, de, ate, mesAtual, conciliacao: conc,
    outrosContratos: outros.map(([n, v]) => ({ numCtr: n, numOfi: nomesCtr.find((x) => x.numCtr === n)?.numOfi ?? n, valor: Math.round(v * 100) / 100 })),
    atualizadoEm: ult?.finalizadoEm ?? null, faturamentoErro: resumo.faturamentoErro ?? null, semFaturamento: docs.length === 0,
  });
}
