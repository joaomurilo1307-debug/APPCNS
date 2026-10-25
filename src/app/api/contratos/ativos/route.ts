import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { limparCacheDeAcompanhamento } from "@/lib/custos/acesso";
import { z } from "zod";

// Mantem o payload antigo de situacao e permite escolher, separadamente, a inclusao nos resultados.
const schema = z.object({ itens: z.array(z.object({
  codccu: z.string().regex(/^\d+$/), ativo: z.boolean().optional(), acompanharResultados: z.boolean().optional(),
}).refine((i) => i.ativo !== undefined || i.acompanharResultados !== undefined)).min(1).max(1000) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role !== "ADMIN") return NextResponse.json({ error: "Só administradores alteram a situação e o acompanhamento dos contratos" }, { status: 403 });
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const unicos = new Map(parsed.data.itens.map((i) => [i.codccu, i]));
  const existentes = await prisma.contrato.findMany({ where: { codccu: { in: Array.from(unicos.keys()) } }, select: { codccu: true, status: true, acompanharResultados: true } });
  const mudam = existentes.filter((c) => unicos.get(c.codccu)!.ativo !== undefined && (c.status === "ATIVO") !== unicos.get(c.codccu)!.ativo);
  const ativar = mudam.filter((c) => unicos.get(c.codccu)!.ativo).map((c) => c.codccu);
  const encerrar = mudam.filter((c) => !unicos.get(c.codccu)!.ativo).map((c) => c.codccu);
  const mudamAcompanhamento = existentes.filter((c) => unicos.get(c.codccu)!.acompanharResultados !== undefined && c.acompanharResultados !== unicos.get(c.codccu)!.acompanharResultados);
  const incluir = mudamAcompanhamento.filter((c) => unicos.get(c.codccu)!.acompanharResultados).map((c) => c.codccu);
  const retirar = mudamAcompanhamento.filter((c) => !unicos.get(c.codccu)!.acompanharResultados).map((c) => c.codccu);
  await prisma.$transaction([
    ...(ativar.length ? [prisma.contrato.updateMany({ where: { codccu: { in: ativar } }, data: { status: "ATIVO" } })] : []),
    ...(encerrar.length ? [prisma.contrato.updateMany({ where: { codccu: { in: encerrar } }, data: { status: "ENCERRADO" } })] : []),
    ...(incluir.length ? [prisma.contrato.updateMany({ where: { codccu: { in: incluir } }, data: { acompanharResultados: true } })] : []),
    ...(retirar.length ? [prisma.contrato.updateMany({ where: { codccu: { in: retirar } }, data: { acompanharResultados: false } })] : []),
  ]);
  limparCacheDeAcompanhamento();
  if (mudam.length) await logAudit({ userId: u.id, action: "contratos.ativos", entityType: "Contrato", metadata: { ativados: ativar, encerrados: encerrar } });
  if (mudamAcompanhamento.length) await logAudit({ userId: u.id, action: "contratos.acompanhamento", entityType: "Contrato", metadata: { incluidos: incluir, retirados: retirar } });
  return NextResponse.json({ ativados: ativar.length, encerrados: encerrar.length, incluidos: incluir.length, retirados: retirar.length, semFicha: unicos.size - existentes.length });
}
