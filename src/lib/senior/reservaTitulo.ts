// Reserva da OC (TituloGeradoOC): criada ANTES de escrever na Senior pra dois cliques nao gerarem dois
// titulos. Se a gravacao falha de forma ambigua (timeout/rede), a reserva fica -- mas a Senior pode nao
// ter criado nada, e a reserva orfa mostraria na tela um titulo que nao existe e bloquearia nova tentativa
// (visto em 15/10/2026 com o TESTE1510). A Senior e' a fonte da verdade: a reserva so' vale se o titulo existe.

export const RESERVA_RECENTE_MS = 2 * 60 * 1000; // dentro disso a gravacao ainda pode estar em andamento (limite do POST: 60 s)

export type DecisaoReserva = "vale" | "orfa" | "em-andamento" | "indeterminado";

/**
 * existeNaSenior: true/false conferido agora, ou null se nao deu pra conferir.
 *  - existe            -> "vale" (bloqueia novo titulo)
 *  - nao existe + antiga -> "orfa" (libera: pode apagar a reserva)
 *  - nao existe + recente -> "em-andamento" (ainda pode estar gravando: nao mexe)
 *  - sem conferencia   -> "indeterminado" (nao mexe)
 */
export function decidirReserva(geradoEm: Date, existeNaSenior: boolean | null, agora = Date.now()): DecisaoReserva {
  if (existeNaSenior === null) return "indeterminado";
  if (existeNaSenior) return "vale";
  return agora - geradoEm.getTime() > RESERVA_RECENTE_MS ? "orfa" : "em-andamento";
}
