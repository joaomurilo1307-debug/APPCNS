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

/** "OC 15994 · título 008034" (os dois quando existem; "lançamento" se nenhum). */
export function referenciaDoLancamento(c: { numTit?: string | null; numOcp?: string | null }): string {
  const refs = [c.numOcp ? `OC ${c.numOcp}` : null, c.numTit ? `título ${c.numTit}` : null].filter(Boolean);
  return refs.length ? refs.join(" · ") : "lançamento";
}

export function descricaoDoLancamento(c: ResumoLancamento): string {
  return `${c.fornecedor} · ${referenciaDoLancamento(c)} · ${moeda(c.valor)} · ${c.ccuNome || `CC ${c.codccu}`}`;
}

export type DadosDoEmail = ResumoLancamento & { linhaCusto?: string | null; dataLancamento?: string | null };

const dataBr = (iso?: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

/** E-mail enviado ao financeiro quando alguem contesta um custo: traz a OC, o titulo e a descricao, para decidir (ou ajustar no Senior) sem abrir o sistema. */
export function emailDaContestacao(
  c: DadosDoEmail,
  p: { autor: string; justificativa: string; indicado?: string | null; anexos?: string[]; dominio?: string | null }
): { subject: string; text: string } {
  const link = p.dominio ? `https://${p.dominio}/aprovacoes#contestacoes` : null;
  const linhas = [
    "Olá,",
    "",
    `${p.autor} contestou um custo na tela Ao vivo e precisa da decisão do financeiro.`,
    "",
    `Contrato (centro de custo): ${c.ccuNome || "—"} (CCU ${c.codccu})`,
    `Fornecedor: ${c.fornecedor}`,
    `OC: ${c.numOcp || "não ligada"}`,
    `Título: ${c.numTit || "sem título"}`,
    ...(c.linhaCusto ? [`Linha de custo: ${c.linhaCusto}`] : []),
    `Valor: ${moeda(c.valor)}`,
    ...(c.dataLancamento ? [`Data do lançamento: ${dataBr(c.dataLancamento)}`] : []),
    "",
    "Descrição da contestação:",
    p.justificativa.trim(),
    "",
    ...(p.indicado ? [`Responsável indicado por quem contestou: ${p.indicado}`] : []),
    ...(p.anexos && p.anexos.length ? [`Arquivos anexados (para baixar no sistema): ${p.anexos.join(", ")}`] : []),
    ...(link ? ["", `Para aceitar ou rejeitar: ${link}`] : []),
    "Aceitar registra a decisão; o ajuste no Senior é feito pelo financeiro (o sistema não altera o Senior).",
  ];
  return { subject: `Contestação de custo: ${referenciaDoLancamento(c)} · ${moeda(c.valor)}`, text: linhas.join("\n") };
}

/** Separa uma lista de e-mails digitada (virgula, ponto e virgula ou quebra de linha), tira repetidos e descarta o que nao parece e-mail. */
export function lerListaDeEmails(texto: string | null | undefined): { validos: string[]; invalidos: string[] } {
  const validos: string[] = [];
  const invalidos: string[] = [];
  for (const bruto of (texto ?? "").split(/[\s,;]+/)) {
    const e = bruto.trim().toLowerCase();
    if (!e) continue;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) invalidos.push(bruto.trim());
    else if (!validos.includes(e)) validos.push(e);
  }
  return { validos, invalidos };
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
