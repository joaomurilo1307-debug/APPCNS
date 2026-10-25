// Catalogo dos MODULOS do sistema e a regra UNICA de quem entra em cada um.
//
// Decisao do Joao (22/10/2026): o financeiro (pagamentos, SISPAG, conferencia de OC, programacao...) so' e' acessado por pessoas
// NOMEADAS (time financeiro), nunca por papel. Os demais modulos continuam valendo pelo papel, como sempre, e o ADMIN pode liberar ou
// bloquear qualquer modulo para uma pessoa (tela Usuarios > Acesso).
//
// Regra (moduloPermitido):
//   1. ADMIN entra em tudo.
//   2. Se ha uma liberacao/bloqueio gravado para a pessoa naquele modulo, vale ele.
//   3. Modulo RESTRITO sem liberacao: bloqueado (nao importa o papel).
//   4. Modulo comum sem liberacao: vale o padrao do papel (o mesmo que o menu ja usava).
// Este arquivo e' PURO (sem banco): testavel e usado tanto pelo menu quanto pelas rotas.

export type GrupoModulo = "gestao" | "financeiro" | "contratos" | "admin";

export type ModuloId =
  | "painel" | "projetos" | "tarefas" | "sprint" | "gantt" | "calendario" | "chat" | "equipes" | "nucleos" | "metas" | "relatorios" | "pdi" | "aprovacoes_projetos"
  | "programacao_pagamento" | "pagamentos_itau" | "conferencia_oc" | "despesas_recorrentes" | "alertas_financeiro" | "notas_fiscais" | "aprovacoes_oc_todas" | "contestacoes_custo"
  | "aprovacoes_oc"
  | "contratos" | "custos" | "medicao" | "previsao" | "p0"
  | "usuarios" | "usuarios_senior";

export type ModuloDef = {
  id: ModuloId;
  href: string;
  label: string;
  grupo: GrupoModulo;
  /** true = so' entra quem recebeu a liberacao (nem o papel basta). */
  restrito: boolean;
  /** papeis que entram quando NAO ha liberacao/bloqueio gravado (ignorado nos restritos). */
  padraoPapeis: ReadonlyArray<string>;
  descricao: string;
};

const TODOS = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] as const;
const GESTAO = ["ADMIN", "DIRETOR", "GESTOR_PROJETO"] as const;

export const MODULOS: ReadonlyArray<ModuloDef> = [
  // ---- gestao de projetos
  { id: "painel", href: "/dashboard", label: "Painel", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Visão geral dos projetos" },
  { id: "projetos", href: "/projetos", label: "Projetos", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Projetos, quadro e cronograma" },
  { id: "tarefas", href: "/tarefas", label: "Tarefas", grupo: "gestao", restrito: false, padraoPapeis: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "COLABORADOR", "VISUALIZADOR"], descricao: "Tarefas e subtarefas" },
  { id: "sprint", href: "/sprint", label: "Sprint da semana", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Planejamento semanal" },
  { id: "gantt", href: "/gantt", label: "Gantt", grupo: "gestao", restrito: false, padraoPapeis: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "VISUALIZADOR"], descricao: "Cronograma" },
  { id: "calendario", href: "/calendario", label: "Calendário", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Eventos e prazos" },
  { id: "chat", href: "/chat", label: "Chat", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Conversas e equipes" },
  { id: "equipes", href: "/equipes", label: "Equipes", grupo: "gestao", restrito: false, padraoPapeis: GESTAO, descricao: "Equipes e pessoas dos projetos" },
  { id: "nucleos", href: "/nucleos", label: "Núcleos", grupo: "gestao", restrito: false, padraoPapeis: GESTAO, descricao: "Núcleos, coordenadores e demandas" },
  { id: "metas", href: "/metas", label: "Metas", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Metas e indicadores" },
  { id: "relatorios", href: "/relatorios", label: "Relatórios", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Relatórios de projetos" },
  { id: "pdi", href: "/pdi", label: "PDI", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Desenvolvimento individual" },
  { id: "aprovacoes_projetos", href: "/aprovacoes", label: "Aprovações de projetos", grupo: "gestao", restrito: false, padraoPapeis: TODOS, descricao: "Pedidos de aprovação dentro do sistema" },
  // ---- financeiro RESTRITO (so' quem foi liberado, pelo time financeiro)
  { id: "programacao_pagamento", href: "/programacao-pagamento", label: "Programação de pagamento", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "Contas a pagar por título" },
  { id: "pagamentos_itau", href: "/pagamentos-itau", label: "Pagamentos Itaú (SISPAG)", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "Remessas e retornos do banco" },
  { id: "conferencia_oc", href: "/conferencia-oc", label: "Conferência de OC", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "OC, nota e título" },
  { id: "despesas_recorrentes", href: "/despesas-recorrentes", label: "Despesas recorrentes", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "Contas fixas" },
  { id: "alertas_financeiro", href: "/alertas-financeiro", label: "Alertas do financeiro", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "Avisos de pagamento" },
  { id: "notas_fiscais", href: "/notas-fiscais", label: "Notas fiscais recebidas", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "Notas contra o CNPJ da empresa" },
  { id: "contestacoes_custo", href: "/aprovacoes", label: "Aprovar contestações de custo", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "Recebe e decide as contestações de custo feitas na tela Ao vivo" },
  { id: "aprovacoes_oc_todas", href: "/aprovacoes/senior", label: "Aprovações de OC: ver todas", grupo: "financeiro", restrito: true, padraoPapeis: [], descricao: "Sem isto, a pessoa vê só as OCs em que está envolvida" },
  // ---- aprovacoes de OC (cada um ve as suas; liberada pessoa a pessoa, por enquanto so' para poucos) e contratos (seguem o papel)
  { id: "aprovacoes_oc", href: "/aprovacoes/senior", label: "Aprovações de OC", grupo: "contratos", restrito: true, padraoPapeis: [], descricao: "As OCs do Senior em que a pessoa está envolvida (precisa do vínculo com o usuário do Senior)" },
  { id: "contratos", href: "/contratos", label: "Contratos", grupo: "contratos", restrito: false, padraoPapeis: TODOS, descricao: "Contratos e centros de custo" },
  { id: "custos", href: "/custos/plano-de-contas", label: "Custo por centro de custo", grupo: "contratos", restrito: false, padraoPapeis: TODOS, descricao: "Custo realizado do Senior" },
  { id: "medicao", href: "/medicao", label: "Receita e medição", grupo: "contratos", restrito: false, padraoPapeis: TODOS, descricao: "Medição, notas e recebimento" },
  { id: "previsao", href: "/previsao", label: "Previsão por centro de custo", grupo: "contratos", restrito: false, padraoPapeis: TODOS, descricao: "Previsão mensal" },
  { id: "p0", href: "/p0", label: "P0 dos contratos", grupo: "contratos", restrito: false, padraoPapeis: TODOS, descricao: "Ficha do contrato" },
  // ---- administracao (so' ADMIN)
  { id: "usuarios", href: "/usuarios", label: "Usuários", grupo: "admin", restrito: true, padraoPapeis: [], descricao: "Cadastro e acesso" },
  { id: "usuarios_senior", href: "/usuarios/senior", label: "Usuários do Senior", grupo: "admin", restrito: true, padraoPapeis: [], descricao: "Vínculo com o Senior" },
];

export const POR_ID: ReadonlyMap<string, ModuloDef> = new Map(MODULOS.map((m) => [m.id, m]));

export const GRUPOS: ReadonlyArray<{ id: GrupoModulo; nome: string; ajuda: string }> = [
  { id: "gestao", nome: "Gestão de projetos", ajuda: "Projetos, tarefas, equipes e núcleos" },
  { id: "financeiro", nome: "Financeiro restrito", ajuda: "Só o time financeiro: pagamentos, SISPAG, conferência de OC e programação" },
  { id: "contratos", nome: "Contratos e aprovações de OC", ajuda: "Contratos, custo, receita e as OCs em que a pessoa está envolvida" },
  { id: "admin", nome: "Administração", ajuda: "Cadastro de usuários" },
];

export const PAPEIS_DO_SISTEMA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR", "CLIENTE"] as const;

/** Liberacoes e bloqueios gravados para a pessoa: modulo -> true (libera) | false (bloqueia). */
export type Sobreposicoes = ReadonlyMap<string, boolean>;

/** VER = so' consulta; EDITAR = consulta e altera. */
export type NivelAcesso = "VER" | "EDITAR";
export type Niveis = ReadonlyMap<string, NivelAcesso>;

/** Nivel quando nada foi gravado: VISUALIZADOR so' consulta, os demais papeis consultam e alteram (como sempre foi). */
export function nivelPadraoDoPapel(papel: string): NivelAcesso {
  return papel === "VISUALIZADOR" ? "VER" : "EDITAR";
}

/** O nivel da pessoa neste modulo; null quando ela nem entra nele. ADMIN sempre edita. */
export function nivelDoModulo(def: ModuloDef, papel: string, sobre: Sobreposicoes, niveis: Niveis): NivelAcesso | null {
  if (!moduloPermitido(def, papel, sobre)) return null;
  if (papel === "ADMIN") return "EDITAR";
  return niveis.get(def.id) ?? nivelPadraoDoPapel(papel);
}

export function lerNiveis(linhas: ReadonlyArray<{ modulo: string; permitido: boolean; nivel?: string | null }>): Map<string, NivelAcesso> {
  const m = new Map<string, NivelAcesso>();
  for (const l of linhas) if (POR_ID.has(l.modulo) && l.permitido && (l.nivel === "VER" || l.nivel === "EDITAR")) m.set(l.modulo, l.nivel);
  return m;
}

/** Modulo + nivel de tudo o que a pessoa enxerga, na ordem do catalogo. */
export function acessosEfetivos(papel: string, sobre: Sobreposicoes, niveis: Niveis): { modulo: ModuloId; nivel: NivelAcesso }[] {
  return MODULOS.flatMap((m) => {
    const n = nivelDoModulo(m, papel, sobre, niveis);
    return n ? [{ modulo: m.id, nivel: n }] : [];
  });
}

export function moduloPermitido(def: ModuloDef, papel: string, sobre: Sobreposicoes): boolean {
  if (papel === "ADMIN") return true;
  if (def.grupo === "admin") return false; // administracao e' so' do ADMIN, nao se libera por pessoa
  const gravado = sobre.get(def.id);
  if (gravado !== undefined) return gravado;
  if (def.restrito) return false;
  return def.padraoPapeis.includes(papel);
}

/** Ids dos modulos que a pessoa enxerga, na ordem do catalogo. */
export function modulosEfetivos(papel: string, sobre: Sobreposicoes): ModuloId[] {
  return MODULOS.filter((m) => moduloPermitido(m, papel, sobre)).map((m) => m.id);
}

export function lerSobreposicoes(linhas: ReadonlyArray<{ modulo: string; permitido: boolean }>): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const l of linhas) if (POR_ID.has(l.modulo)) m.set(l.modulo, l.permitido);
  return m;
}

/**
 * O que gravar para que a pessoa fique EXATAMENTE com `desejados` (ids de modulo): so' guarda a diferenca em relacao ao padrao do papel,
 * para a tela nao encher o banco de linhas redundantes. ADMIN nao tem linhas.
 */
export function sobreposicoesParaGravar(
  papel: string,
  desejados: ReadonlyArray<string>,
  niveisDesejados: Readonly<Record<string, NivelAcesso | undefined>> = {}
): { modulo: string; permitido: boolean; nivel?: NivelAcesso }[] {
  if (papel === "ADMIN") return [];
  const quer = new Set(desejados);
  const padraoNivel = nivelPadraoDoPapel(papel);
  const saida: { modulo: string; permitido: boolean; nivel?: NivelAcesso }[] = [];
  for (const m of MODULOS) {
    if (m.grupo === "admin") continue;
    const padrao = !m.restrito && m.padraoPapeis.includes(papel);
    const q = quer.has(m.id);
    const nivel = niveisDesejados[m.id] ?? padraoNivel;
    if (q !== padrao || (q && nivel !== padraoNivel)) saida.push(q ? { modulo: m.id, permitido: true, nivel } : { modulo: m.id, permitido: false });
  }
  return saida;
}

// ---------------------------------------------------------------- perfis prontos (atalhos da tela de acesso)

export type PerfilPronto = {
  id: string;
  nome: string;
  descricao: string;
  /** papel sugerido para quem recebe o perfil */
  papel: (typeof PAPEIS_DO_SISTEMA)[number];
  modulos: ModuloId[];
  escopoProjetos: "PROPRIOS" | "NUCLEO" | "TODOS";
  /** nivel que o perfil da em todas as telas (padrao EDITAR) */
  nivel?: NivelAcesso;
  /** true = o perfil ja marca "ve todos os contratos" */
  verTodosContratos?: boolean;
};

const GESTAO_IDS: ModuloId[] = ["painel", "projetos", "tarefas", "sprint", "gantt", "calendario", "chat", "metas", "relatorios", "pdi", "aprovacoes_projetos"];
const FINANCEIRO_IDS: ModuloId[] = ["programacao_pagamento", "pagamentos_itau", "conferencia_oc", "despesas_recorrentes", "alertas_financeiro", "notas_fiscais", "aprovacoes_oc_todas", "contestacoes_custo"];
const CONTRATOS_IDS: ModuloId[] = ["aprovacoes_oc", "contratos", "custos", "medicao", "previsao", "p0"];

export const PERFIS_PRONTOS: ReadonlyArray<PerfilPronto> = [
  { id: "financeiro", nome: "Time financeiro", descricao: "Tudo do financeiro, contratos e todas as aprovações de OC", papel: "APROVADOR", modulos: [...GESTAO_IDS, ...FINANCEIRO_IDS, ...CONTRATOS_IDS], escopoProjetos: "PROPRIOS" },
  { id: "gerente_nucleo", nome: "Gerente de núcleo", descricao: "Gere o núcleo (equipe, demandas e projetos associados a ele) e os projetos em que participa; sem financeiro", papel: "GESTOR_PROJETO", modulos: [...GESTAO_IDS, "equipes", "nucleos", "aprovacoes_oc", "contratos"], escopoProjetos: "PROPRIOS" },
  { id: "coordenador_nucleo", nome: "Coordenador de núcleo", descricao: "Gere tarefas e demandas do núcleo e os projetos em que participa; sem financeiro", papel: "GESTOR_PROJETO", modulos: [...GESTAO_IDS, "equipes", "nucleos", "aprovacoes_oc", "contratos"], escopoProjetos: "PROPRIOS" },
  { id: "membro_projetos", nome: "Membro de projetos", descricao: "Só acompanha projetos e tarefas; sem financeiro nem contratos", papel: "COLABORADOR", modulos: ["painel", "projetos", "tarefas", "sprint", "calendario", "chat", "metas", "pdi"], escopoProjetos: "PROPRIOS" },
  { id: "gestor_contratos", nome: "Gestor de contratos", descricao: "Projetos e gestão, mais contratos, custos, medição e previsão; sem financeiro de pagamento", papel: "GESTOR_PROJETO", modulos: [...GESTAO_IDS, "aprovacoes_oc", "contratos", "custos", "medicao", "previsao", "p0"], escopoProjetos: "PROPRIOS" },
  { id: "visao_total", nome: "Visão total (sem pagamentos)", descricao: "Vê todas as telas, núcleos e contratos (os projetos continuam particulares); fora só o financeiro de pagamento (SISPAG, programação, conferência de OC...)", papel: "GESTOR_PROJETO", modulos: [...GESTAO_IDS, "equipes", "nucleos", ...CONTRATOS_IDS], escopoProjetos: "PROPRIOS", verTodosContratos: true },
  { id: "consulta", nome: "Somente consulta", descricao: "Vê projetos e contratos, sem alterar nada", papel: "VISUALIZADOR", modulos: ["painel", "projetos", "tarefas", "sprint", "gantt", "calendario", "metas", "relatorios", "contratos", "custos", "medicao", "previsao"], escopoProjetos: "PROPRIOS", nivel: "VER" },
  { id: "aprovador", nome: "Aprovador de OC", descricao: "Vê só as OCs em que está envolvido, mais contratos", papel: "APROVADOR", modulos: ["painel", "chat", "aprovacoes_projetos", "aprovacoes_oc", "contratos"], escopoProjetos: "PROPRIOS" },
];
