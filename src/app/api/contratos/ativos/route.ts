import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { limparCacheDeContratosEncerrados } from "@/lib/custos/acesso";
import { z } from "zod";

// O administrador escolhe quais contratos estao ATIVOS. So' os ativos aparecem para as pessoas (custos, medicao, previsao, contratos, demandas...);
// os encerrados ficam guardados, com todo o historico, e so' o administrador os ve. Nada e' apagado.
const schema = z.object({ itens: z.array(z.object({ codccu: z.string().regex(/^\d+$/), ativo: z.boolean() })).min(1).max(1000) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role !== "ADMIN") return NextResponse.json({ error: "Só administradores escolhem os contratos ativos" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const unicos = new Map(parsed.data.itens.map((i) => [i.codccu, i.ativo]));
  const existentes = await prisma.contrato.findMany({ where: { codccu: { in: Array.from(unicos.keys()) } }, select: { codccu: true, status: true } });
  const mudam = existentes.filter((c) => (c.status === "ATIVO") !== unicos.get(c.codccu));
  const ativar = mudam.filter((c) => unicos.get(c.codccu)).map((c) => c.codccu);
  const encerrar = mudam.filter((c) => !unicos.get(c.codccu)).map((c) => c.codccu);
  await prisma.$transaction([
    ...(ativar.length ? [prisma.contrato.updateMany({ where: { codccu: { in: ativar } }, data: { status: "ATIVO" } })] : []),
    ...(encerrar.length ? [prisma.contrato.updateMany({ where: { codccu: { in: encerrar } }, data: { status: "ENCERRADO" } })] : []),
  ]);
  limparCacheDeContratosEncerrados();
  if (mudam.length) await logAudit({ userId: u.id, action: "contratos.ativos", entityType: "Contrato", metadata: { ativados: ativar, encerrados: encerrar } });
  return NextResponse.json({ ativados: ativar.length, encerrados: encerrar.length, semFicha: unicos.size - existentes.length });
}
