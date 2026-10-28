// Contestacao de custo na tela Ao vivo (regras PURAS, sem banco): validacao do pedido e textos das notificacoes.
// O fluxo: quem acompanha o contrato contesta um lancamento -> o financeiro (a Monica) recebe por e-mail e responde pelo proprio e-mail (ou pela tela Aprovacoes):
//   Contestado (PENDENTE) -> Aceita, a realocar no Senior (ACEITA) -> Realocado (REALOCADA); ou Rejeitada. A tela Ao vivo mostra cada etapa no proprio lancamento.
// O sistema NAO altera o Senior: "aceita" e "realocado" registram o que o financeiro fez; o ajuste do lancamento e' feito la.

export const STATUS_CONTESTACAO = ["PENDENTE", "ACEITA", "REALOCADA", "REJEITADA"] as const;
export type StatusContestacao = (typeof STATUS_CONTESTACAO)[number];

export const ROTULO_STATUS: Record<StatusContestacao, string> = {
  PENDENTE: "Aguardando o financeiro",
  ACEITA: "Aceita, a realocar no Senior",
  REALOCADA: "Realocado",
  REJEITADA: "Rejeitada",
};

/** Texto do selo no proprio lancamento (tela Ao vivo). */
export const ROTULO_NO_LANCAMENTO: Record<StatusContestacao, string> = {
  PENDENTE: "Contestado · aguardando o financeiro",
  ACEITA: "Contestado · aceita, a realocar",
  REALOCADA: "Realocado",
  REJEITADA: "Contestado · rejeitada",
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

/**
 * Mensagem de erro da decisao do financeiro, ou null. Rejeitar exige o motivo. Do pendente se vai para aceita, realocada (ja resolveu no Senior) ou rejeitada;
 * da aceita so' se vai para realocada. Rejeitada e realocada sao finais.
 */
export function validarDecisao(statusAtual: string, novo: string, parecer?: string | null): string | null {
  if (novo !== "ACEITA" && novo !== "REJEITADA" && novo !== "REALOCADA") return "Decisão inválida.";
  const permitidos: Record<string, string[]> = { PENDENTE: ["ACEITA", "REALOCADA", "REJEITADA"], ACEITA: ["REALOCADA"] };
  if (!(permitidos[statusAtual] ?? []).includes(novo)) return statusAtual === "ACEITA" ? "Esta contestação já foi decidida (aceita): falta só marcar como realocado." : "Esta contestação já foi decidida.";
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
  p: { autor: string; justificativa: string; indicado?: string | null; anexos?: string[]; dominio?: string | null; links?: { ok: string; realocado: string; discordo: string } | null }
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
    ...(p.links
      ? [
          "",
          "RESPONDA POR AQUI (um clique, sem precisar entrar no sistema; o status aparece na tela Ao vivo para quem contestou):",
          `  1) OK, vou realocar no Senior: ${p.links.ok}`,
          `  2) Já realocado no Senior: ${p.links.realocado}`,
          `  3) Não concordo com a contestação: ${p.links.discordo}`,
        ]
      : []),
    ...(link ? ["", `Ou na tela Aprovações do sistema: ${link}`] : []),
    "OK e realocado registram o andamento; o ajuste no Senior é feito pelo financeiro (o sistema não altera o Senior).",
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
  if (status === "REALOCADA") return { title: "Custo realocado", body: `${quem} realocou no Senior: ${descricaoDoLancamento(c)}.${parecer ? ` Observação: ${parecer}` : ""}` };
  const acao = status === "ACEITA" ? "aceitou" : "rejeitou";
  const fim = status === "ACEITA" ? " O financeiro ajusta o lançamento no Senior; quando estiver realocado, o status muda aqui." : "";
  return { title: `Contestação ${status === "ACEITA" ? "aceita" : "rejeitada"}`, body: `${quem} ${acao} a contestação de ${descricaoDoLancamento(c)}.${parecer ? ` Parecer: ${parecer}` : ""}${fim}` };
}
