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

/** Sem `nucleoId`: pode gerir demandas em geral (inclui quem gere algum nucleo). Com `nucleoId`: pode gerir a demanda desse nucleo (null = sem nucleo). */
export async function podeGerirDemandas(u: UsuarioSessao, nucleoId?: string | null): Promise<boolean> {
  if (u.role === "ADMIN" || u.role === "GESTOR_PROJETO") return true;
  if (ehCliente(u) || u.role === "VISUALIZADOR") return false;
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

export async function podeVerDemanda(u: UsuarioSessao, d: { solicitanteId: string; nucleoId?: string | null; contrato: { codccu: string } }): Promise<boolean> {
  if (d.solicitanteId === u.id) return true;
  if (u.role === "ADMIN") return true;
  if (d.nucleoId && !ehCliente(u) && (await nucleoIdsQueGere(u.id)).includes(d.nucleoId)) return true;
  const c = await contratosDoUsuario(u);
  return c.todos || c.ccus.has(d.contrato.codccu);
}

export { podeVerCcu };
