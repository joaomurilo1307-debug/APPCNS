// tipos espelhando os enums do schema (inline pra este modulo poder ser
// importado tambem por client component sem puxar @prisma/client pro bundle)
type UserRole = "ADMIN" | "DIRETOR" | "GESTOR_PROJETO" | "APROVADOR" | "COLABORADOR" | "CLIENTE" | "VISUALIZADOR";
type NivelHierarquico = "DIRETORIA" | "GERENCIA" | "COORDENACAO" | "SUPERVISOR" | "COLABORADOR";

// Cargo que a pessoa escolhe no primeiro acesso -> nivel de acesso no
// sistema. A ideia (pedido do Joao): o cargo ja define as "limitacoes de
// acesso", sem passo de aprovacao pra maioria dos casos.
//
// "sensivel: true" = cargo que daria visibilidade da empresa inteira
// (gerencia/diretoria). Esse NAO e concedido automaticamente no
// auto-cadastro -- a conta entra como COLABORADOR e um aviso vai pros
// admins confirmarem a elevacao em /usuarios. Isso evita que alguem se
// auto-promova a gerente/diretor num primeiro login nao verificado.
export type CargoInfo = {
  role: UserRole;
  nivel: NivelHierarquico;
  sensivel?: boolean;
};

export const CARGOS: Record<string, CargoInfo> = {
  "Estagiário(a)": { role: "VISUALIZADOR", nivel: "COLABORADOR" },
  "Jovem Aprendiz": { role: "VISUALIZADOR", nivel: "COLABORADOR" },
  "Auxiliar": { role: "COLABORADOR", nivel: "COLABORADOR" },
  "Assistente": { role: "COLABORADOR", nivel: "COLABORADOR" },
  "Técnico(a)": { role: "COLABORADOR", nivel: "COLABORADOR" },
  "Analista": { role: "COLABORADOR", nivel: "COLABORADOR" },
  "Analista Sênior": { role: "COLABORADOR", nivel: "COLABORADOR" },
  "Especialista": { role: "COLABORADOR", nivel: "COLABORADOR" },
  "Encarregado(a)": { role: "COLABORADOR", nivel: "SUPERVISOR" },
  "Supervisor(a)": { role: "COLABORADOR", nivel: "SUPERVISOR" },
  "Coordenador(a)": { role: "GESTOR_PROJETO", nivel: "COORDENACAO" },
  "Gerente": { role: "GESTOR_PROJETO", nivel: "GERENCIA", sensivel: true },
  "Diretor(a)": { role: "DIRETOR", nivel: "DIRETORIA", sensivel: true },
};

// usado quando o cargo escolhido nao esta no mapa (nao deveria acontecer
// pelo select, mas o back nunca confia no front)
export const CARGO_FALLBACK: CargoInfo = { role: "COLABORADOR", nivel: "COLABORADOR" };

export const CARGOS_LISTA = Object.keys(CARGOS);

export function resolverCargo(cargo: string): CargoInfo {
  return CARGOS[cargo] ?? CARGO_FALLBACK;
}
