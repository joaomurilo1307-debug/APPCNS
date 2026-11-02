// Papeis que so' consultam, em TODO o sistema (matriz de acessos de 02/11/2026): o Diretor Master (Carolina e Andre) ve todos os contratos e o
// financeiro, mas "nao pode editar nada". A regra fica na entrada (middleware), antes de qualquer rota, para valer tambem para rotas novas.
// Continuam liberadas so' as chamadas que nao sao dado de gestao: login, presenca, chat, calendario, o proprio perfil e o primeiro acesso,
// mais os POSTs que so' leem ou geram arquivo (exportar, dossie, zip, "Atualizar" da tela, simulacao de meta).
// Este arquivo e' PURO (sem banco): testavel e usado pelo middleware (runtime Edge).

export const PAPEIS_SO_LEITURA: ReadonlyArray<string> = ["DIRETOR_MASTER"];

const METODOS_QUE_GRAVAM = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Prefixos de /api (inteiros ou com "/" em seguida) que o papel so' leitura ainda pode chamar com POST/PUT/PATCH/DELETE. */
const LIBERADOS: ReadonlyArray<string> = [
  "/api/auth",
  "/api/presence",
  "/api/messages",
  "/api/events",
  "/api/event-attendees",
  "/api/users/me",
  "/api/completar-cadastro",
  "/api/upload",
  // POSTs que so' leem ou geram arquivo
  "/api/conferencia-oc/dossies-zip",
  "/api/contract-goals/preview",
  "/api/custos-conta/atualizar",
  "/api/medicao/atualizar",
  "/api/dossies/gerar",
  "/api/titulos-pagar/exportar-pacote",
  "/api/senior/aprovacoes/sincronizar-agora",
  "/api/senior/titulos-pagar/sincronizar-agora",
];

const dentro = (caminho: string, prefixo: string) => caminho === prefixo || caminho.startsWith(prefixo + "/");

/** A chamada deve ser barrada? So' quando o papel e' de leitura, o metodo grava e o caminho nao esta na lista liberada. */
export function bloqueiaEscrita(papel: string | null | undefined, metodo: string, caminho: string): boolean {
  if (!papel || !PAPEIS_SO_LEITURA.includes(papel)) return false;
  if (!METODOS_QUE_GRAVAM.has(metodo.toUpperCase())) return false;
  return !LIBERADOS.some((p) => dentro(caminho, p));
}
