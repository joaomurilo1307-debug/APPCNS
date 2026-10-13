import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { exigir } from "@/lib/efetivos/servidor";

export const dynamic = "force-dynamic";

// Quem mexeu em que e quando (realocacoes, ausencias, importacoes). So quem edita enxerga.
export async function GET() {
  const a = await exigir("editar");
  if ("erro" in a) return a.erro;
  const linhas = await prisma.auditLog.findMany({
    where: { entityType: { startsWith: "EFETIVO_" } },
    orderBy: { createdAt: "desc" },
    take: 300,
    include: { user: { select: { name: true } } },
  });
  return NextResponse.json({
    historico: linhas.map((l) => {
      let resumo = l.action;
      try {
        resumo = (JSON.parse(l.metadata ?? "{}") as { resumo?: string }).resumo ?? l.action;
      } catch {
        // metadata ilegivel: mostra so a acao
      }
      return { id: l.id, em: l.createdAt.toISOString(), por: l.user?.name ?? "—", acao: l.action.replace("EFETIVOS_", ""), resumo };
    }),
  });
}
