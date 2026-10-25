// Quem enxerga quais centros de custo (CCU) na tela Custo por Centro de Custo -- UM so' lugar para a regra, usado por todas as
// rotas. Cada pessoa tem:
//   - TODOS: papel ADMIN/DIRETOR ou User.verTodosCustos;
//   - ou um conjunto de CCUs = os liberados para ela (AcessoCentroCusto) + os das equipes de que participa (Team.codccu);
//   - conjunto vazio = NENHUM.

import type { prisma as prismaReal } from "@/lib/prisma";
import { COOKIE_VISAO, lerSelecao } from "../areas";

export type EscopoCustos = {
  todos: boolean;
  ccus: ReadonlySet<string>; // so' vale quando todos = false
  /** Centros retirados desta visao. Nao altera a permissao de consultar o historico. */
  ocultos: ReadonlySet<string>;
  tipo: "todos" | "varios" | "um" | "nenhum";
  quantidade: number | null; // null = todos
};

export function montarEscopo(todos: boolean, ccus: Iterable<string>, ocultos: Iterable<string> = []): EscopoCustos {
  const fora = new Set(ocultos);
  if (todos) return { todos: true, ccus: new Set(), ocultos: fora, tipo: "todos", quantidade: null };
  const conjunto = new Set(Array.from(ccus).filter((c) => !fora.has(c)));
  const n = conjunto.size;
  return { todos: false, ccus: conjunto, ocultos: fora, tipo: n === 0 ? "nenhum" : n === 1 ? "um" : "varios", quantidade: n };
}

export function podeVerCcu(escopo: EscopoCustos, codccu: string): boolean {
  if (escopo.ocultos.has(codccu)) return false;
  return escopo.todos || escopo.ccus.has(codccu);
}

// ---------------------------------------------------------------- escolha de acompanhamento (independente da situacao operacional)
/** Mantido para os chamadores de alteracao; as consultas agora sempre leem a escolha atual do banco. */
export function limparCacheDeAcompanhamento() {
  // Sem cache entre requisicoes, inclusive quando houver mais de uma replica da aplicacao.
}

/** CCUs fora dos resultados. Contrato novo/sem ficha participa por padrao. */
export async function ccusForaDosResultados(db: typeof prismaReal): Promise<Set<string>> {
  const lista = await db.contrato.findMany({ where: { acompanharResultados: false }, select: { codccu: true } });
  return new Set(lista.map((c) => c.codccu));
}

/**
 * `area` diz ONDE o escopo vai ser usado: "FINANCEIRO" (padrao: custos, medicao, previsao, contratos) ou "PROJETOS" (demandas e projetos do
 * contrato). O acesso liberado na tela Usuarios > Acesso vale na area escolhida ou nas duas (AMBOS, o que ja existia).
 */
export async function escopoDeCustos(db: typeof prismaReal, usuario: { id: string; role?: string }, area: "FINANCEIRO" | "PROJETOS" = "FINANCEIRO"): Promise<EscopoCustos> {
  // Situacao e acompanhamento sao escolhas de gestao, nunca concessoes/revogacoes de acesso.
  if (usuario.role === "ADMIN" || usuario.role === "DIRETOR") return montarEscopo(true, []);
  const eu = await db.user.findUnique({
    where: { id: usuario.id },
    select: {
      verTodosCustos: true,
      acessosCentroCusto: { select: { codccu: true, area: true } },
      teams: { select: { team: { select: { codccu: true } } } },
    },
  });
  if (!eu) return montarEscopo(false, []);
  if (eu.verTodosCustos) return montarEscopo(true, []);
  const ccus = new Set<string>();
  // area ausente (registro antigo ou de teste) = AMBOS, o padrao do banco
  for (const a of eu.acessosCentroCusto) if (!a.area || a.area === "AMBOS" || a.area === area) ccus.add(a.codccu);
  for (const t of eu.teams) if (t.team.codccu) ccus.add(t.team.codccu);
  return montarEscopo(false, ccus);
}

// ---------------------------------------------------------------- importacao em lote ("email;190, 230, 102235")

export type LinhaAcesso = { email: string; todos: boolean; ccus: string[] };

/** PURA: le linhas "email;ccu, ccu, ccu" (ou "email;todos"). Aceita ; , tab como separador do e-mail e virgula/espaco entre CCUs. */
export function lerListaDeAcessos(texto: string): { linhas: LinhaAcesso[]; erros: string[] } {
  const linhas: LinhaAcesso[] = [];
  const erros: string[] = [];
  texto.split(/\r?\n/).forEach((bruta, i) => {
    const l = bruta.trim();
    if (!l || l.startsWith("#")) return;
    const m = /^([^\s;,\t]+@[^\s;,\t]+)\s*[;\t,]\s*(.+)$/.exec(l);
    if (!m) {
      erros.push(`linha ${i + 1}: use "email;190, 230" ou "email;todos" — "${l.slice(0, 60)}"`);
      return;
    }
    const resto = m[2].trim().toLowerCase();
    if (resto === "todos" || resto === "todos os centros de custo") {
      linhas.push({ email: m[1].toLowerCase(), todos: true, ccus: [] });
      return;
    }
    const ccus = Array.from(new Set(resto.split(/[\s,;]+/).filter(Boolean)));
    const invalido = ccus.find((c) => !/^\d+$/.test(c));
    if (invalido) {
      erros.push(`linha ${i + 1}: centro de custo "${invalido}" não é um número`);
      return;
    }
    linhas.push({ email: m[1].toLowerCase(), todos: false, ccus });
  });
  return { linhas, erros };
}

// ---------------------------------------------------------------- filtro de contratos / area (so' visao)

/**
 * Filtro "Contratos" ao lado do Buscar (a lista suspensa com os centros de custo, que tambem marca Engenharia, Ambiental e Administrativo de uma vez): estreita a VISAO de uma
 * lista, sem tocar no acesso. Quem ve tudo passa a ver so' os centros de custo escolhidos; quem ve uma lista, a intersecao. Sem selecao = o mesmo escopo (o mesmo objeto).
 * Permissao, detalhe, exportacao e demanda continuam usando o escopo de `escopoDeCustos`, que nao muda.
 */
export function aplicarSelecaoAoEscopo(escopo: EscopoCustos, selecao: readonly string[] | null): EscopoCustos {
  if (!selecao || selecao.length === 0) return escopo;
  return montarEscopo(false, escopo.todos ? selecao : selecao.filter((c) => escopo.ccus.has(c)), escopo.ocultos);
}

/** Os centros de custo escolhidos na lista suspensa (cookie da sessao). Fora de uma requisicao (testes, rotinas de fundo) nao ha cookie: sem filtro. */
export async function selecaoEscolhida(): Promise<string[] | null> {
  try {
    const { cookies } = await import("next/headers");
    return lerSelecao(cookies().get(COOKIE_VISAO)?.value);
  } catch {
    return null;
  }
}

/** PURA: retira dos resultados sem conceder acesso a centros que a pessoa nao pode consultar. */
export function aplicarAcompanhamentoAoEscopo(escopo: EscopoCustos, fora: Iterable<string>): EscopoCustos {
  const ocultos = new Set([...escopo.ocultos, ...fora]);
  if (ocultos.size === 0) return escopo;
  return montarEscopo(escopo.todos, escopo.ccus, ocultos);
}

/** Visao analitica: permissao + escolha de acompanhamento + selecao temporaria.
 * Detalhes e obrigacoes financeiras usam escopoDeCustos, sem essa exclusao.
 */
export async function escopoDeVisao(
  escopo: EscopoCustos,
  opcoes: { incluirForaDosResultados?: boolean; ignorarSelecao?: boolean } = {},
  db?: typeof prismaReal,
): Promise<EscopoCustos> {
  const acompanhado = opcoes.incluirForaDosResultados
    ? escopo
    : aplicarAcompanhamentoAoEscopo(escopo, await ccusForaDosResultados(db ?? (await import("@/lib/prisma")).prisma));
  return opcoes.ignorarSelecao ? acompanhado : aplicarSelecaoAoEscopo(acompanhado, await selecaoEscolhida());
}
