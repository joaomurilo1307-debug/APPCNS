import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo, podeAcessarModulo } from "@/lib/acesso/servidor";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";

// Apenas metadados da cópia local; não inicia sincronização nem consulta o ERP.
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  const negado = await negarSemModulo(usuario, "metas"); if (negado) return negado;
  const codccu = new URL(req.url).searchParams.get("codccu");
  if (codccu && !/^\d+$/.test(codccu)) return NextResponse.json({ error: "Centro de custo inválido" }, { status: 422 });
  const [custos, medicao, escopo] = await Promise.all([
    podeAcessarModulo(usuario, "custos"), podeAcessarModulo(usuario, "medicao"), escopoDeCustos(prisma, usuario, "FINANCEIRO"),
  ]);
  if (usuario.role === "CLIENTE" || (!custos && !medicao) || (codccu && !podeVerCcu(escopo, codccu))) {
    return NextResponse.json({ error: "Sem acesso à fonte deste centro de custo" }, { status: 403 });
  }
  const ccuWhere = codccu ? { codccu } : escopo.todos ? {} : { codccu: { in: [...escopo.ccus] } };
  const [contas, centrosCusto, centrosMedicao] = await Promise.all([
    custos && codccu ? prisma.custoContaFinanceira.findMany({ where: ccuWhere, distinct: ["contaFinanceira"], select: { contaFinanceira: true }, orderBy: { contaFinanceira: "asc" } }) : [],
    custos ? prisma.custoContaFinanceira.findMany({ where: ccuWhere, distinct: ["codccu"], select: { codccu: true, contrato: true } }) : [],
    medicao ? prisma.medicaoContrato.findMany({ where: ccuWhere, distinct: ["codccu"], select: { codccu: true } }) : [],
  ]);
  const centros = new Map<string, { codccu: string; nome: string }>();
  for (const centro of centrosCusto) centros.set(centro.codccu, { codccu: centro.codccu, nome: centro.contrato || `CCU ${centro.codccu}` });
  for (const centro of centrosMedicao) if (centro.codccu && !centros.has(centro.codccu)) centros.set(centro.codccu, { codccu: centro.codccu, nome: `CCU ${centro.codccu}` });
  return NextResponse.json({ accounts: contas.map((c) => c.contaFinanceira), ccus: [...centros.values()].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")), sources: { CUSTO: custos, MEDICAO: medicao, FATURAMENTO: medicao } });
}
