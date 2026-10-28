import { createHash, timingSafeEqual } from "crypto";

/**
 * Valida a chave compartilhada (header `x-sync-key`) que o n8n e os scripts usam
 * para chamar as rotas /api/senior/* e /api/financeiro/alertas/verificar.
 *
 * Por que existe: comparar com `!==` para no primeiro caractere diferente, o que
 * permite descobrir a chave medindo o tempo de resposta. Aqui as duas pontas viram
 * hash SHA-256 (tamanho fixo) e a comparacao leva sempre o mesmo tempo.
 *
 * Se SENIOR_SYNC_KEY nao estiver definida (ou vazia), NINGUEM passa: fica fechado
 * por padrao em vez de aceitar uma chave vazia.
 */
export function chaveSyncValida(chave: string | null | undefined): boolean {
  const esperada = process.env.SENIOR_SYNC_KEY;
  if (!chave || !esperada) return false;
  const hash = (valor: string) => createHash("sha256").update(valor).digest();
  return timingSafeEqual(hash(chave), hash(esperada));
}
