// Contestacao de custo na tela Ao vivo (regras PURAS, sem banco): validacao do pedido e textos das notificacoes.
// O fluxo: quem acompanha o contrato contesta um lancamento -> o financeiro (modulo "Aprovar contestacoes de custo") aceita ou rejeita.
// O sistema NAO altera o Senior: "aceita" registra a decisao e o financeiro ajusta o lancamento la.

export const STATUS_CONTESTACAO = ["PENDENTE", "ACEITA", "REJEITADA"] as const;
export type StatusContestacao = (typeof STATUS_CONTESTACAO)[number];

export const ROTULO_STATUS: Record<StatusContestacao, string> = {
  PENDENTE: "Aguardando o financeiro",
  ACEITA: "Aceita",
  REJEITADA: "Rejeitada",
};

export const LIMITES = {
  justificativaMin: 15,
  justificativaMax: 4000,
  parecerMin: 5,
  parecerMax: 4000,
  arquivosMax: 5,
  bytesPorArquivo: 15 * 1024 * 1024,
} as const;

/** Mensagem de erro do pedido de contestacao, ou null se estiver valido. */
export function validarPedido(p: { chave?: string | null; justificativa?: string | null; arquivos?: { name: string; size: number }[] }): string | null {
  if (!p.chave || !p.chave.trim()) return "Escolha o lançamento a contestar.";
  const j = (p.justificativa ?? "").trim();
  if (j.length < LIMITES.justificativaMin) return `Explique o motivo da contestação (pelo menos ${LIMITES.justificativaMin} letras).`;
  if (j.length > LIMITES.justificativaMax) return `A justificativa passou de ${LIMITES.justificativaMax} caracteres.`;
  const arquivos = p.arquivos ?? [];
  if (arquivos.length > LIMITES.arquivosMax) return `No máximo ${LIMITES.arquivosMax} arquivos por contestação.`;
  const grande = arquivos.find((a) => a.size > LIMITES.bytesPorArquivo);
  if (grande) return `O arquivo "${grande.name}" passa de ${Math.round(LIMITES.bytesPorArquivo / 1024 / 1024)} MB.`;
  return null;
}

/** Mensagem de erro da decisao do financeiro, ou null. Rejeitar exige o motivo; so' se decide o que esta pendente. */
export function validarDecisao(statusAtual: string, novo: string, parecer?: string | null): string | null {
  if (statusAtual !== "PENDENTE") return "Esta contestação já foi decidida.";
  if (novo !== "ACEITA" && novo !== "REJEITADA") return "Decisão inválida.";
  const p = (parecer ?? "").trim();
  if (novo === "REJEITADA" && p.length < LIMITES.parecerMin) return "Para rejeitar, escreva o motivo.";
  if (p.length > LIMITES.parecerMax) return `O parecer passou de ${LIMITES.parecerMax} caracteres.`;
  return null;
}

export type ResumoLancamento = { fornecedor: string; numTit?: string | null; numOcp?: string | null; valor: number; ccuNome?: string | null; codccu: string };

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function descricaoDoLancamento(c: ResumoLancamento): string {
  const ref = c.numTit ? `título ${c.numTit}` : c.numOcp ? `OC ${c.numOcp}` : "lançamento";
  return `${c.fornecedor} · ${ref} · ${moeda(c.valor)} · ${c.ccuNome || `CC ${c.codccu}`}`;
}

export function notificacaoNova(c: ResumoLancamento, autor: string) {
  return { title: "Contestação de custo para analisar", body: `${autor} contestou: ${descricaoDoLancamento(c)}.` };
}

export function notificacaoIndicado(c: ResumoLancamento, autor: string) {
  return { title: "Você foi indicado como responsável por um custo", body: `${autor} indicou você: ${descricaoDoLancamento(c)}. O financeiro vai analisar.` };
}

export function notificacaoDecisao(c: ResumoLancamento, status: StatusContestacao, quem: string, parecer?: string | null) {
  const acao = status === "ACEITA" ? "aceitou" : "rejeitou";
  const fim = status === "ACEITA" ? " O financeiro ajusta o lançamento no Senior." : "";
  return { title: `Contestação ${status === "ACEITA" ? "aceita" : "rejeitada"}`, body: `${quem} ${acao} a contestação de ${descricaoDoLancamento(c)}.${parecer ? ` Parecer: ${parecer}` : ""}${fim}` };
}
