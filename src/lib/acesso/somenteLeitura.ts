// Papeis que so' consultam fora de Projetos (matriz de acessos de 02/11/2026): o Acesso Master (Carolina e Andre) ve tudo, todos os contratos e o financeiro,
// e EDITA so' a parte de Projetos (a dele: projetos, tarefas, demandas, aprovacoes, metas, PDI). Todo o resto e' so' leitura.
// A regra fica na entrada (middleware), antes de qualquer rota, para valer tambem para rotas novas. Continuam liberadas: login, presenca, chat,
// calendario, o proprio perfil e o primeiro acesso, as rotas de Projetos (cada uma ja limita ao que e' da pessoa) e os POSTs que so' leem ou
// geram arquivo (exportar, dossie, zip, "Atualizar" da tela, simulacao de meta).
// Este arquivo e' PURO (sem banco): testavel e usado pelo middleware (runtime Edge).

export const PAPEIS_SO_LEITURA: ReadonlyArray<string> = ["ACESSO_MASTER"];

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
  // parte de Projetos (a dele): cada rota ja mostra so' o que tem relacao com a pessoa
  "/api/projects",
  "/api/tasks",
  "/api/tarefas",
  "/api/task-dependencies",
  "/api/teams",
  "/api/demandas",
  "/api/approval-requests",
  "/api/goals",
  "/api/contract-goals",
  "/api/sector-goals",
  "/api/fields",
  "/api/folders",
  "/api/attachments",
  "/api/pdi",
  "/api/pdi-items",
  "/api/timesheet-auto",
  "/api/projetos-acesso",
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
