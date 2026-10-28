// Regras PURAS da tela Contestacoes: contagem por status, filtros, ordem (o que ainda precisa de acao vem primeiro) e linha do tempo de cada contestacao.

import { ROTULO_STATUS, type StatusContestacao } from "./contestacoes";

export type EventoTela = { id: string; em: string; tipo: "CRIADA" | "STATUS" | "NOTA" | string; status: string | null; porNome: string; via: string; texto: string | null };

export type ItemTela = {
  id: string; criadoEm: string; status: StatusContestacao; fornecedor: string; numTit: string | null; numOcp: string | null; ccuNome: string | null; codccu: string;
  valor: number; justificativa: string; parecer: string | null; decididoEm: string | null; decididoVia?: string | null;
  autor: { id: string; name: string }; indicado: { id: string; name: string } | null; decididoPor: { id: string; name: string } | null; eventos?: EventoTela[];
};

export const ETAPAS: ReadonlyArray<StatusContestacao> = ["PENDENTE", "ACEITA", "REALOCADA", "REJEITADA"];
/** Em andamento = ainda falta alguem agir (o financeiro decidir ou realocar no Senior). */
export const emAndamento = (s: string) => s === "PENDENTE" || s === "ACEITA";

export function contarPorStatus(itens: ReadonlyArray<{ status: string }>): Record<StatusContestacao, number> {
  const c: Record<StatusContestacao, number> = { PENDENTE: 0, ACEITA: 0, REALOCADA: 0, REJEITADA: 0 };
  for (const i of itens) if (i.status in c) c[i.status as StatusContestacao] += 1;
  return c;
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

export type Filtro = { status: StatusContestacao | "ABERTAS" | "TODAS"; busca: string; ccu: string; autorId: string };

export function filtrar<T extends ItemTela>(itens: ReadonlyArray<T>, f: Filtro): T[] {
  const termo = semAcento(f.busca.trim());
  return itens.filter((i) => {
    if (f.status === "ABERTAS" ? !emAndamento(i.status) : f.status !== "TODAS" && i.status !== f.status) return false;
    if (f.ccu && i.codccu !== f.ccu) return false;
    if (f.autorId && i.autor.id !== f.autorId) return false;
    if (!termo) return true;
    return semAcento([i.fornecedor, i.numTit, i.numOcp, i.ccuNome, i.codccu, i.autor.name, i.indicado?.name, i.justificativa].filter(Boolean).join(" ")).includes(termo);
  });
}

const PESO: Record<string, number> = { PENDENTE: 0, ACEITA: 1, REALOCADA: 2, REJEITADA: 2 }; // realocada e rejeitada: encerradas, no mesmo bloco

/** Pendentes primeiro (a espera mais antiga no topo: e' quem esta esperando ha mais tempo), depois aceitas, depois as encerradas (a mais nova primeiro). */
export function ordenar<T extends ItemTela>(itens: ReadonlyArray<T>): T[] {
  return [...itens].sort((a, b) => {
    const pa = PESO[a.status] ?? 9, pb = PESO[b.status] ?? 9;
    if (pa !== pb) return pa - pb;
    return emAndamento(a.status) ? a.criadoEm.localeCompare(b.criadoEm) : b.criadoEm.localeCompare(a.criadoEm);
  });
}

/** Dias inteiros entre a abertura e `agora`. */
export const diasEmAberto = (criadoEm: string, agora: number) => Math.max(0, Math.floor((agora - new Date(criadoEm).getTime()) / 86_400_000));

/**
 * Linha do tempo: os eventos gravados; contestacoes antigas (sem historico) ganham uma linha derivada da abertura e da decisao, para ninguem ver a tela vazia.
 */
export function linhaDoTempo(i: ItemTela): EventoTela[] {
  const abertura: EventoTela = { id: `${i.id}-criada`, em: i.criadoEm, tipo: "CRIADA", status: "PENDENTE", porNome: i.autor.name, via: "sistema", texto: i.justificativa };
  // contestacao aberta antes do historico existir e decidida depois: tem eventos de decisao mas nao a abertura; a abertura vem da propria contestacao
  if (i.eventos && i.eventos.length) return [...(i.eventos.some((e) => e.tipo === "CRIADA") ? [] : [abertura]), ...i.eventos].sort((a, b) => a.em.localeCompare(b.em));
  const base: EventoTela[] = [abertura];
  if (i.status !== "PENDENTE" && i.decididoEm) base.push({ id: `${i.id}-decisao`, em: i.decididoEm, tipo: "STATUS", status: i.status, porNome: i.decididoPor?.name ?? (i.decididoVia === "e-mail" ? "O financeiro (resposta por e-mail)" : "Financeiro"), via: i.decididoVia ?? "sistema", texto: i.parecer });
  return base;
}

export function tituloDoEvento(e: EventoTela): string {
  if (e.tipo === "CRIADA") return "Contestou";
  if (e.tipo === "NOTA") return "Recado";
  return ROTULO_STATUS[e.status as StatusContestacao] ?? "Atualizou";
}

/** Proximas etapas que o financeiro pode dar a partir do status atual (a mesma regra do servidor, em validarDecisao). */
export function proximasEtapas(status: string): ReadonlyArray<"ACEITA" | "REALOCADA" | "REJEITADA"> {
  return status === "PENDENTE" ? ["ACEITA", "REALOCADA", "REJEITADA"] : status === "ACEITA" ? ["REALOCADA"] : [];
}
