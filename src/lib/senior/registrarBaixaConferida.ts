import type { PrismaClient } from "@prisma/client";
import type { situacaoDoTituloNaSenior } from "./baixaTitulos";

type Situacao = ReturnType<typeof situacaoDoTituloNaSenior>;

// Concluir o item e atualizar o espelho na mesma transacao, exclusivamente a
// partir da leitura efetiva da Senior. Retorno bancario sozinho nunca marca pago.
export async function registrarBaixaConferida(db: PrismaClient, dados: {
  itemId: string; status: "ENVIADA" | "JA_BAIXADO"; mensagem: string; userId: string; situacao: Situacao;
}) {
  const s = dados.situacao;
  if (!s.existe || s.valorAberto !== 0 || !["AB", "LQ"].includes(s.sittit)) throw new Error("Liquidacao nao confirmada na Senior.");
  return db.$transaction(async tx => {
    const item = await tx.remessaItemPagamento.findUniqueOrThrow({ where: { id: dados.itemId } });
    if (item.status !== "PAGO") throw new Error("Item sem pagamento confirmado pelo banco.");
    await tx.remessaItemPagamento.update({ where: { id: item.id }, data: {
      baixaSeniorStatus: dados.status, baixaSeniorEm: new Date(), baixaSeniorMsg: dados.mensagem, baixaSeniorPorId: dados.userId,
    } });
    if (!item.tituloId) return 0;
    await tx.tituloContasAPagar.update({ where: { id: item.tituloId }, data: {
      pago: true, situacao: s.sittit, valorAberto: 0,
      ...(s.dataPagamento ? { dataPagamento: s.dataPagamento } : {}),
    } });
    await tx.tituloContasAPagar.updateMany({ where: { id: item.tituloId, revisadoStatus: "ENVIADO_AGUARDANDO_BAIXA" }, data: {
      revisadoStatus: null, revisadoPorNome: null, revisadoEm: null,
    } });
    return 1;
  });
}
