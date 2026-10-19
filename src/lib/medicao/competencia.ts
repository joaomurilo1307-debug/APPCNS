// Mes (competencia) de cada medicao. Ordem de confianca, sem inventar nada:
//   1. BOLETIM: o campo PEDCLI do pedido traz o boletim de medicao e o mes, ex.: "BM35 01.2026" = boletim 35 do mes 01/2026 (confirmado em
//      19/10/2026 no contrato MRN CT 3687/2023: os 39 pedidos conferem com o faturamento e com a regra de emissao menos 1 mes).
//   2. EMISSAO: quando o PEDCLI nao traz o mes, vale a regra ja validada no Rito de Gestao: emissao menos 1 mes, com o corte de dia por
//      contrato (CORTE_DIA_POR_CCU) para os poucos clientes que fogem dela. Fica marcado como "emissao" para nao parecer certeza.
//   Um mes de boletim fora do razoavel (depois da emissao, ou mais de 18 meses antes) e' ignorado e cai na regra da emissao.

export type OrigemCompetencia = "BOLETIM" | "EMISSAO";
export type Competencia = { competencia: string; origem: OrigemCompetencia; boletim: string | null; inconsistente: boolean };

/** Corte de dia por centro de custo (calibrado no Rito contra a planilha do financeiro). Ausente = sempre "emissao menos 1 mes". */
export const CORTE_DIA_POR_CCU: Readonly<Record<string, number>> = { "270": 1, "370": 22, "170": 24 };
const CORTE_PADRAO = 32;

const pad = (n: number) => String(n).padStart(2, "0");
export const somaMes = (aaaamm: string, n: number): string => {
  const [a, m] = aaaamm.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
};
const indice = (aaaamm: string) => Number(aaaamm.slice(0, 4)) * 12 + Number(aaaamm.slice(5, 7));

/**
 * "BM35 01.2026" -> { boletim: "BM35", mes: "2026-01" }. Formatos reais encontrados no Senior (19/10/2026): "BM 21 12.24" (ano com 2 digitos),
 * "BM08 01 2021" (espaco no lugar do ponto), "BM 15 MSG 02.25" (texto no meio). O numero do boletim e' retirado antes de procurar o mes, para
 * "BM 21 12.24" nao confundir 21 com o mes. Sem mes reconhecivel -> mes null ("BM01/BM08", "ACUMULADOS", "PRODUTO 06" nao viram mes).
 */
export function lerBoletim(pedCli: string | null | undefined): { boletim: string | null; mes: string | null } {
  const t = (pedCli ?? "").toUpperCase().replace(/\s+/g, " ").trim();
  if (!t) return { boletim: null, mes: null };
  const reBm = /\b(?:BM|MED(?:I[CÇ][AÃ]O)?)\s*(?:N[O°º.]?\s*)?0*(\d{1,3})\b/;
  const bm = reBm.exec(t);
  const boletim = bm ? `BM${Number(bm[1])}` : null;
  const resto = t.replace(/\b(?:BM|MED(?:I[CÇ][AÃ]O)?)\s*(?:N[O°º.]?\s*)?0*\d{1,3}\b/g, " ");
  // mes/ano: 01.2026, 1/2026, 01-2026, "01 2026" ou ano com 2 digitos (12.24). O ano de 2 digitos so' vale entre 2020 e 2039.
  const ma = /(?:^|[^\d])(0?[1-9]|1[0-2])\s*[./\- ]\s*(20\d{2}|[23]\d)(?!\d)/.exec(resto);
  if (!ma) return { boletim, mes: null };
  const ano = ma[2].length === 2 ? 2000 + Number(ma[2]) : Number(ma[2]);
  return { boletim, mes: `${ano}-${pad(Number(ma[1]))}` };
}

/** "dd/mm/aaaa" ou "aaaa-mm-dd" -> { y, m, d } */
function partes(data: string): { y: number; m: number; d: number } | null {
  let m = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(data);
  if (m) return { d: Number(m[1]), m: Number(m[2]), y: Number(m[3]) };
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

export function competenciaPorEmissao(dataEmissao: string, ccu: string | null): string | null {
  const p = partes(dataEmissao);
  if (!p) return null;
  const doMes = `${p.y}-${pad(p.m)}`;
  const corte = (ccu && CORTE_DIA_POR_CCU[ccu]) || CORTE_PADRAO;
  return p.d >= corte ? doMes : somaMes(doMes, -1);
}

export function competenciaDoPedido(a: { pedCli: string | null | undefined; dataEmissao: string; ccu: string | null }): Competencia | null {
  const emissao = partes(a.dataEmissao);
  if (!emissao) return null;
  const mesEmissao = `${emissao.y}-${pad(emissao.m)}`;
  const { boletim, mes } = lerBoletim(a.pedCli);
  let inconsistente = false;
  if (mes) {
    const atras = indice(mesEmissao) - indice(mes);
    if (atras >= 0 && atras <= 18) return { competencia: mes, origem: "BOLETIM", boletim, inconsistente: false };
    inconsistente = true; // mes do boletim depois da emissao ou muito antigo: nao confiar
  }
  const c = competenciaPorEmissao(a.dataEmissao, a.ccu);
  return c ? { competencia: c, origem: "EMISSAO", boletim, inconsistente } : null;
}
