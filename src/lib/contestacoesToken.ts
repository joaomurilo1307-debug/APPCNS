// Links de resposta por e-mail da contestacao de custo (PURO, so' node:crypto). Quem recebe o e-mail (a Monica) responde com um clique, sem login: cada link leva o id da
// contestacao, a acao e a validade, assinados com HMAC-SHA256 (segredo do servidor). Adulterar qualquer parte invalida o link. A pagina de destino pede confirmacao (um botao),
// para que leitores/antivirus de e-mail que "abrem" os links nao decidam nada sozinhos.

import { createHmac, timingSafeEqual } from "node:crypto";

export const ACOES_POR_EMAIL = { ok: "ACEITA", realocado: "REALOCADA", discordo: "REJEITADA" } as const;
export type AcaoEmail = keyof typeof ACOES_POR_EMAIL;
export const ROTULO_ACAO: Record<AcaoEmail, string> = { ok: "OK, vou realocar no Senior", realocado: "Já realocado no Senior", discordo: "Não concordo com a contestação" };
export const VALIDADE_DO_LINK_MS = 45 * 24 * 60 * 60 * 1000;

export const eAcaoEmail = (v: string | null | undefined): v is AcaoEmail => v === "ok" || v === "realocado" || v === "discordo";

function assinatura(segredo: string, id: string, acao: string, exp: number): string {
  return createHmac("sha256", segredo).update(`${id}|${acao}|${exp}`).digest("hex");
}

/** Caminho (com query) do link de uma acao; `base` = https://dominio. */
export function linkDaAcao(base: string, segredo: string, id: string, acao: AcaoEmail, agora = Date.now()): string {
  const exp = agora + VALIDADE_DO_LINK_MS;
  const q = new URLSearchParams({ id, acao, exp: String(exp), t: assinatura(segredo, id, acao, exp) });
  return `${base}/api/contestacoes/resposta?${q.toString()}`;
}

export type ResultadoDoLink = "ok" | "expirado" | "invalido";

export function verificarLink(segredo: string, p: { id?: string | null; acao?: string | null; exp?: string | null; t?: string | null }, agora = Date.now()): ResultadoDoLink {
  if (!segredo || !p.id || !eAcaoEmail(p.acao) || !p.exp || !p.t || !/^\d{10,16}$/.test(p.exp)) return "invalido";
  const esperado = Buffer.from(assinatura(segredo, p.id, p.acao, Number(p.exp)), "hex");
  const recebido = /^[0-9a-f]{64}$/.test(p.t) ? Buffer.from(p.t, "hex") : null;
  if (!recebido || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) return "invalido";
  return agora > Number(p.exp) ? "expirado" : "ok";
}
