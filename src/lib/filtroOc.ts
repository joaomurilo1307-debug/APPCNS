// Filtros PUROS da tela de Aprovacoes de OC (periodo de emissao, faixa de valor e contrato), sem banco nem tela.
export type PeriodoOc = "30" | "90" | "ano" | "todos" | "datas";

export const ROTULO_PERIODO: Record<PeriodoOc, string> = {
  "30": "Últimos 30 dias",
  "90": "Últimos 90 dias",
  ano: "Este ano",
  todos: "Todo o período",
  datas: "Escolher datas",
};

const dia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());

/** A data de emissao (ISO) cai no periodo escolhido? `de`/`ate` (aaaa-mm-dd) so' valem em "datas"; vazio = sem limite daquele lado. */
export function dentroDoPeriodo(emissaoIso: string | null | undefined, periodo: PeriodoOc, de: string, ate: string, hoje: Date = new Date()): boolean {
  if (periodo === "todos") return true;
  if (!emissaoIso) return false;
  const emissao = new Date(emissaoIso);
  if (Number.isNaN(emissao.getTime())) return false;
  const e = dia(emissao);
  const h = dia(hoje);
  if (periodo === "30" || periodo === "90") return e >= h - Number(periodo) * 86400000 && e <= h;
  if (periodo === "ano") return emissao.getUTCFullYear() === hoje.getUTCFullYear();
  const ini = de ? Date.parse(de) : -Infinity;
  const fim = ate ? Date.parse(ate) : Infinity;
  return e >= ini && e <= fim;
}

/** Faixa de valor; campo vazio ou invalido = sem limite. Aceita "1.500,50". */
export function lerValor(txt: string): number | null {
  const t = txt.trim();
  if (!t) return null;
  const n = Number(t.includes(",") ? t.replace(/\./g, "").replace(",", ".") : t);
  return Number.isFinite(n) ? n : null;
}
export function dentroDoValor(valor: number, min: string, max: string): boolean {
  const a = lerValor(min);
  const b = lerValor(max);
  return (a === null || valor >= a) && (b === null || valor <= b);
}

/** Centros de custo de uma OC: os do rateio (JSON) e, se nao houver, o codccu da propria OC. */
export function ccusDaOc(rateioDetalhe: string | null | undefined, codccu: string | null | undefined): string[] {
  const out = new Set<string>();
  if (rateioDetalhe) {
    try {
      const r = JSON.parse(rateioDetalhe);
      if (Array.isArray(r)) for (const i of r) if (i && i.codccu !== undefined && i.codccu !== null && String(i.codccu).trim()) out.add(String(i.codccu).trim());
    } catch { /* rateio ilegivel: cai no codccu */ }
  }
  if (out.size === 0 && codccu) out.add(String(codccu).trim());
  return Array.from(out);
}

/** Filtro "Contratos" da tela (cookie): sem escolha (null) tudo passa; com escolha, a OC passa se algum dos seus centros de custo foi escolhido. */
export function ocNoFiltroDeContratos(ccus: string[], selecao: string[] | null | undefined): boolean {
  if (!selecao) return true;
  const s = new Set(selecao);
  return ccus.some((c) => s.has(c));
}
