import { prisma } from "@/lib/prisma";
import { baixarPagamentoDaNota, type NotaRecebida } from "./notasRecebidas";

const PARALELO = 6;

/**
 * Pagamento (vencimentos/forma) das notas, lido do XML uma vez e guardado em NfRecebidaPagamento.
 * Le as que faltam ate' `orcamentoMs`; devolve o que ja existe (pode faltar nota se estourar o orcamento).
 */
export async function pagamentoDasNotas(notas: NotaRecebida[], orcamentoMs: number) {
  const lidos = await prisma.nfRecebidaPagamento.findMany({ where: { chave: { in: notas.map((n) => n.chave) } } });
  const porChave = new Map(lidos.map((l) => [l.chave, l]));
  const faltam = notas.filter((n) => !porChave.has(n.chave));
  const fim = Date.now() + orcamentoMs;
  let i = 0;
  await Promise.all(
    Array.from({ length: PARALELO }, async () => {
      while (i < faltam.length && Date.now() < fim) {
        const n = faltam[i++];
        try {
          const p = await baixarPagamentoDaNota(n.chave);
          porChave.set(n.chave, await prisma.nfRecebidaPagamento.upsert({ where: { chave: n.chave }, create: { chave: n.chave, ...p }, update: p }));
        } catch {
          /* fica sem leitura; a proxima chamada tenta de novo */
        }
      }
    })
  );
  return porChave;
}
