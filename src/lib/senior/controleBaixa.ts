import type { PrismaClient } from "@prisma/client";
import type { ResultadoBaixa } from "./baixaTitulos";

export function erroDoItemBaixa(r: ResultadoBaixa, referencia: string): string | null {
  const mensagens = r.itens.filter(i => i.numInt === referencia && i.msgErr).map(i => i.msgErr);
  if (mensagens.length) return mensagens.join("; ");
  // Erro sem identificador nao pode ser atribuido a um titulo com seguranca.
  if (r.itens.some(i => !i.numInt && i.msgErr)) return "Senior retornou erro individual sem identificador; conferir lote.";
  return r.ok ? null : r.erroExecucao || `Senior respondeu ${r.resultado || "sem resultado"}.`;
}

export async function reservarItemBaixa(db: PrismaClient, itemId: string, userId: string): Promise<boolean> {
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(341242)`;
    const item = await tx.remessaItemPagamento.findUnique({ where: { id: itemId } });
    if (!item || item.status !== "PAGO" || ["ENVIADA", "JA_BAIXADO", "EM_PROCESSAMENTO", "INDETERMINADO"].includes(item.baixaSeniorStatus ?? "")) return false;
    if (item.tituloId) {
      const concorrente = await tx.remessaItemPagamento.findFirst({ where: { tituloId: item.tituloId, id: { not: item.id }, baixaSeniorStatus: { in: ["EM_PROCESSAMENTO", "INDETERMINADO"] } } });
      if (concorrente) return false;
    }
    await tx.remessaItemPagamento.update({ where: { id: itemId }, data: {
      baixaSeniorStatus: "EM_PROCESSAMENTO", baixaSeniorEm: new Date(), baixaSeniorPorId: userId,
      baixaSeniorMsg: "Envio reservado. Se o processo interromper, conferir a Senior antes de liberar nova tentativa.",
    } });
    return true;
  });
}
