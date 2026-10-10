import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const pedidoSchema = z.object({
  acao: z.enum(["limpar", "restaurar"]),
  remessaIds: z.array(z.string().min(1)).min(1).max(5000),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as { id: string; role: string };
  if (!["ADMIN", "DIRETOR"].includes(user.role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const pedido = pedidoSchema.safeParse(await req.json().catch(() => null));
  if (!pedido.success) return NextResponse.json({ error: "Informe as remessas e a ação de limpeza ou restauração." }, { status: 422 });
  const { acao, remessaIds } = pedido.data;
  // Arquivar nao altera os pagamentos, os retornos nem as reservas dos titulos.
  // IDs explicitos evitam limpar uma remessa criada por outra pessoa depois do clique.
  const quantidade = await prisma.$transaction(async tx => {
    const registros = await tx.remessaPagamento.findMany({ where: {
      id: { in: remessaIds }, arquivadaEm: acao === "limpar" ? null : { not: null },
    }, select: { id: true } });
    if (!registros.length) return 0;
    await tx.remessaPagamento.updateMany({ where: { id: { in: registros.map(r => r.id) } },
      data: { arquivadaEm: acao === "limpar" ? new Date() : null } });
    await tx.auditLog.create({ data: { userId: user.id,
      action: acao === "limpar" ? "REMESSAS_ARQUIVADAS" : "REMESSAS_RESTAURADAS",
      entityType: "RemessaPagamento", entityId: registros[0].id,
      metadata: JSON.stringify({ remessaIds: registros.map(r => r.id), quantidade: registros.length }),
    } });
    return registros.length;
  });
  return NextResponse.json({ quantidade, acao });
}
