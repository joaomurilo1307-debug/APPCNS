import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { contasDoP0, periodoDoP0, type P0Resposta } from "@/lib/p0/montar";

// P0 de CUSTO DE CONTRATO de um contrato (a versao ativa mais nova), no mesmo formato das contas da tela Custo por Contrato.
// So' le o que foi cadastrado a partir da planilha da area; nao estima nada. O custo de pessoal (salario CLT, encargos, ferias, 13o, provisoes)
// fica guardado a' parte e nao sai aqui. Quem pode ver o P0 de um contrato e' quem pode ver os custos dele (mesma regra de /api/custos-conta).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const ccu = new URL(req.url).searchParams.get("ccu");
  if (!ccu) return NextResponse.json({ error: "Informe o centro de custo (ccu)" }, { status: 400 });

  const escopo = await escopoDeCustos(prisma, session.user as any);
  if (!podeVerCcu(escopo, ccu)) return NextResponse.json({ error: "Sem permissão para este centro de custo" }, { status: 403 });

  const versao = await prisma.p0Versao.findFirst({ where: { codccu: ccu, ativa: true }, orderBy: { versao: "desc" } });
  if (!versao) return NextResponse.json({ existe: false } satisfies P0Resposta);

  const linhas = await prisma.p0Linha.findMany({
    where: { p0Id: versao.id, tipo: "CUSTO_CONTRATO" },
    select: { codConta: true, conta: true, grupoCodigo: true, grupoNome: true, reembolsavel: true, competencia: true, valor: true },
  });
  const contas = contasDoP0(linhas);
  const periodo = periodoDoP0(contas);
  if (!periodo) return NextResponse.json({ existe: false } satisfies P0Resposta);

  const resposta: P0Resposta = {
    existe: true,
    codccu: versao.codccu,
    versao: versao.versao,
    rotulo: versao.rotulo,
    origem: versao.origem,
    rotuloNaPlanilha: versao.rotuloNaPlanilha,
    mesIni: periodo.mesIni,
    mesFim: periodo.mesFim,
    totalCusto: Math.round(contas.reduce((s, c) => s + c.total, 0) * 100) / 100,
    contas,
  };
  return NextResponse.json(resposta);
}
