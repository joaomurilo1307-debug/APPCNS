import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { hojeBR } from "@/lib/financeiro/alertas";
import { nomesDosCentros } from "@/lib/contratos/aoVivoServidor";
import { somaMes } from "@/lib/medicao/competencia";
import { montarDetalhe } from "@/lib/medicao/detalhe";

// Medicao de UM contrato: cada linha com o contratado, o medido mes a mes, o medido acumulado e o saldo, em valor e em quantidade, mais o detalhe
// (pedidos e boletins) de qualquer linha/mes. Somente leitura, tudo do Senior. Mesmo controle de acesso da lista.

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(req: Request, { params }: { params: { numCtr: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const escopo = await escopoDeCustos(prisma, session.user as any);

  const c = await prisma.medicaoContrato.findUnique({ where: { numCtr: params.numCtr }, include: { linhas: true } });
  if (!c) return NextResponse.json({ error: "Contrato não encontrado na Medição" }, { status: 404 });
  if (c.codccu ? !podeVerCcu(escopo, c.codccu) : !escopo.todos) return NextResponse.json({ error: "Sem permissão para este contrato" }, { status: 403 });

  const sp = new URL(req.url).searchParams;
  const mesAtual = hojeBR().slice(0, 7);
  let ate = sp.get("ate") ?? "";
  let de = sp.get("de") ?? "";
  if (!MES.test(ate)) ate = mesAtual;
  if (!MES.test(de)) de = somaMes(ate, -11);
  if (de > ate) [de, ate] = [ate, de];
  if (somaMes(de, 47) < ate) de = somaMes(ate, -47);

  const itens = await prisma.medicaoItem.findMany({ where: { numCtr: c.numCtr }, select: { seqCvs: true, numPed: true, seqIsp: true, dataEmissao: true, competencia: true, origem: true, boletim: true, pedCli: true, situacao: true, qtd: true, valor: true, codccu: true } });
  const linhaParam = sp.get("linha");
  const mesParam = sp.get("mes");
  const filtro = linhaParam || mesParam ? { seqCvs: linhaParam && /^\d+$/.test(linhaParam) ? Number(linhaParam) : null, mes: mesParam && (MES.test(mesParam) || mesParam === "antes" || mesParam === "depois") ? mesParam : null, pagina: Number(sp.get("pagina")) || 1 } : null;

  const d = montarDetalhe(c.linhas.map((l) => ({ seqCvs: l.seqCvs, descricao: l.descricao, unidade: l.unidade, qtdContratada: l.qtdContratada, precoUnit: l.precoUnit, valorContratado: l.valorContratado, qtdFaturada: l.qtdFaturada, valorFaturado: l.valorFaturado })),
    itens.map((i) => ({ ...i, dataEmissao: i.dataEmissao.toISOString().slice(0, 10) })), de, ate, mesAtual, filtro);

  const competencias = itens.filter((i) => i.origem !== "ACUMULADO").map((i) => i.competencia).sort(); // carga acumulada nao e' mes
  const ccus = (c.codccusItens ?? "").split(",").filter(Boolean);
  const nomes = await nomesDosCentros(prisma, ccus);
  const ult = await prisma.atualizacaoMedicao.findFirst({ where: { status: "OK" }, orderBy: { finalizadoEm: "desc" }, select: { finalizadoEm: true } });

  // itens rateados para outro centro de custo (o rateio do pedido manda): aviso para quem acompanha o contrato
  const foraDoPrincipal = itens.filter((i) => i.codccu && i.codccu !== c.codccu);
  return NextResponse.json({
    contrato: { numCtr: c.numCtr, numOfi: c.numOfi, codccu: c.codccu, ccuNome: c.codccu ? nomes.get(c.codccu) ?? `CC ${c.codccu}` : null, inicio: c.inicio, valorContratado: c.valorContratado, valorMedido: c.valorMedido },
    mesAtual, periodo: { de, ate }, primeiroMes: competencias[0] ?? null, ultimoMes: competencias[competencias.length - 1] ?? null,
    ...d,
    outrosCentros: ccus.filter((x) => x !== c.codccu).map((x) => ({ codccu: x, nome: nomes.get(x) ?? `CC ${x}`, itens: foraDoPrincipal.filter((i) => i.codccu === x).length, valor: Math.round(foraDoPrincipal.filter((i) => i.codccu === x).reduce((s, i) => s + i.valor, 0) * 100) / 100 })),
    atualizadoEm: ult?.finalizadoEm ?? null,
  });
}
