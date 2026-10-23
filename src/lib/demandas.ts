import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { nucleoIdsQueGere } from "@/lib/permissions";

// Demandas de projetos: quem pode ver e quem pode gerir.
//  - Contratante (role CLIENTE): ve e cria demandas dos contratos a que esta ligado (ContratoUsuario).
//  - Equipe (demais papeis): ve as demandas dos contratos que acompanha (mesmo acesso dos centros de custo) e as que ela mesma criou.
//  - Gestao (ADMIN, GESTOR_PROJETO ou gestor de alguma equipe): muda situacao, abre projeto, edita a lista.
//  - Nucleo (22/10/2026): a demanda pode ser dirigida a um nucleo; o coordenador e o gerente DESSE nucleo a veem e a controlam
//    (situacao, lista, projeto), mesmo sem acesso ao contrato.

export const STATUS_DEMANDA = ["NOVA", "EM_ANALISE", "EM_PROJETO", "CONCLUIDA", "RECUSADA"] as const;
export type StatusDemanda = (typeof STATUS_DEMANDA)[number];
export const PRIORIDADES = ["BAIXA", "NORMAL", "ALTA", "URGENTE"] as const;

export type UsuarioSessao = { id: string; role: string };

export const ehCliente = (u: UsuarioSessao) => u.role === "CLIENTE";

/** A pessoa foi indicada para atender esta demanda? (nao vale para contratante nem visualizador) */
export async function ehAtendente(u: UsuarioSessao, demandaId: string): Promise<boolean> {
  if (ehCliente(u) || u.role === "VISUALIZADOR") return false;
  return (await prisma.demandaAtendente.count({ where: { demandaId, userId: u.id } })) > 0;
}

/**
 * Sem `nucleoId`: pode gerir demandas em geral (inclui quem gere algum nucleo). Com `nucleoId`: pode gerir a demanda desse nucleo (null = sem nucleo).
 * Com `demandaId`: quem foi indicado para atender ESTA demanda tambem a controla (aceita, recusa, anexa, abre projeto, edita a lista).
 */
export async function podeGerirDemandas(u: UsuarioSessao, nucleoId?: string | null, demandaId?: string): Promise<boolean> {
  if (u.role === "ADMIN" || u.role === "GESTOR_PROJETO") return true;
  if (ehCliente(u) || u.role === "VISUALIZADOR") return false;
  if (demandaId && (await ehAtendente(u, demandaId))) return true;
  if ((await prisma.userTeam.count({ where: { userId: u.id, role: "GESTOR" } })) > 0) return true;
  const meus = await nucleoIdsQueGere(u.id);
  return nucleoId === undefined ? meus.length > 0 : !!nucleoId && meus.includes(nucleoId);
}

/** Equipes (id, nome) que tem gente dos nucleos informados: onde o coordenador/gerente do nucleo pode abrir projeto. */
export async function equipesDosNucleos(nucleoIds: string[]) {
  if (nucleoIds.length === 0) return [];
  return prisma.team.findMany({
    where: { members: { some: { user: { nucleoId: { in: nucleoIds } } } } },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
}

/** Contratos (codccu) que a pessoa pode ligar a uma demanda ou ver: null = todos. */
export async function contratosDoUsuario(u: UsuarioSessao): Promise<{ todos: boolean; ccus: Set<string> }> {
  if (ehCliente(u)) {
    const l = await prisma.contratoUsuario.findMany({ where: { userId: u.id }, select: { contrato: { select: { codccu: true } } } });
    return { todos: false, ccus: new Set(l.map((x) => x.contrato.codccu)) };
  }
  const escopo = await escopoDeCustos(prisma, u, "PROJETOS");
  return { todos: escopo.todos, ccus: new Set(escopo.ccus) };
}

export async function podeVerDemanda(u: UsuarioSessao, d: { id?: string; solicitanteId: string; nucleoId?: string | null; contrato: { codccu: string } }): Promise<boolean> {
  if (d.solicitanteId === u.id) return true;
  if (u.role === "ADMIN") return true;
  if (d.id && (await ehAtendente(u, d.id))) return true;
  if (d.nucleoId && !ehCliente(u) && (await nucleoIdsQueGere(u.id)).includes(d.nucleoId)) return true;
  const c = await contratosDoUsuario(u);
  return c.todos || c.ccus.has(d.contrato.codccu);
}

/** Pessoas que podem ser indicadas para atender (ou executar/acompanhar): ativas e que nao sejam contratante. Devolve so' os ids validos. */
export async function pessoasValidas(ids: string[]): Promise<string[]> {
  const unicos = Array.from(new Set(ids));
  if (!unicos.length) return [];
  const achadas = await prisma.user.findMany({ where: { id: { in: unicos }, active: true, anonymizedAt: null, role: { not: "CLIENTE" } }, select: { id: true } });
  return achadas.map((a) => a.id);
}

/** Aviso no sino para quem recebeu a demanda (ou a tarefa dela). */
export async function avisarPessoas(userIds: string[], aviso: { title: string; body: string; link: string }) {
  const unicos = Array.from(new Set(userIds));
  if (!unicos.length) return;
  await prisma.notification.createMany({ data: unicos.map((userId) => ({ userId, type: "OUTRO" as const, title: aviso.title, body: aviso.body, link: aviso.link })) });
}

// ---------------------------------------------------------------- aceitar anexando a um projeto que ja existe

const PRIORIDADE_DA_TAREFA: Record<string, "BAIXA" | "MEDIA" | "ALTA" | "URGENTE"> = { BAIXA: "BAIXA", NORMAL: "MEDIA", ALTA: "ALTA", URGENTE: "URGENTE" };

/** PURA: a tarefa que nasce da demanda (titulo, descricao com a origem, prioridade e prazo) e as subtarefas, uma por item da lista. */
export function montarTarefaAnexada(d: {
  titulo: string; descricao: string | null; prioridade: string; prazoDesejado: Date | null;
  contrato: { nome: string; codccu: string }; solicitante: { name: string }; itens: { texto: string; concluido: boolean }[];
}) {
  return {
    title: d.titulo,
    description: [d.descricao, `Origem: demanda para o contrato ${d.contrato.nome} (CCU ${d.contrato.codccu}), pedida por ${d.solicitante.name}.`].filter(Boolean).join("\n\n"),
    priority: PRIORIDADE_DA_TAREFA[d.prioridade] ?? "MEDIA",
    dueDate: d.prazoDesejado,
    subtarefas: d.itens.map((i, ordem) => ({ title: i.texto, ordem, status: i.concluido ? ("FEITO" as const) : ("A_FAZER" as const) })),
  };
}

export { podeVerCcu };
