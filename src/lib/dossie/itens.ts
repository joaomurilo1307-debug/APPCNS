// Itens, rateio e "Reembolsavel" do dossie, com os dados da OC na Senior (itens do fluxo: E420IPO/E420ISO; rateio: E420RAT).
//
// Rateio (11/11/2026): o dossie mostrava o valor cheio em linhas que deveriam ser uma fatia. A Senior grava UMA linha de
// rateio por item e centro de custo (SEQIPO/SEQISO), e os campos de percentual nem sempre somam 100 dentro do item -- na
// OC 15857, por exemplo, cada item tem duas linhas com PERRAT = 100 e o VLRRAT de cada uma e' a fatia. Por isso o valor de
// cada linha e' sempre recalculado como fatia do VALOR DO ITEM (ou da OC, para linha sem item), nesta ordem de criterio:
//   1. percentuais (PERCTA x PERRAT) quando somam 100% dentro do item;
//   2. senao, a proporcao dos valores gravados (VLRRAT, depois VLRCTA);
//   3. senao, partes iguais.
// A soma das linhas de um item fecha com o valor do item (a sobra de centavos vai para a ultima linha).
//
// Reembolsavel: conta financeira >= 180 (regra do financeiro, 29/10/2026). Linha de rateio: pela propria conta. Item: SIM
// se alguma linha de rateio dele (ou, sem linha propria, alguma linha geral da OC) for reembolsavel. USU_REEMB = 'S' na OC
// marca todos os itens como SIM.

import type { LinhaSenior } from "@/lib/senior/getDbInfo";
import { numeroSenior } from "@/lib/senior/ocsConferencia";
import { esc, moeda, percentual, quantidade } from "./formatar";

/** Conta financeira a partir da qual a despesa e' reembolsavel (regra do financeiro, 29/10/2026). */
export const CONTA_REEMBOLSAVEL_A_PARTIR_DE = 180;

export type TipoItem = "PRODUTO" | "SERVICO";
export type ItemOc = {
  tipo: TipoItem;
  sequencia: number | null;
  codigo: string;
  descricao: string;
  unidade: string;
  quantidade: number;
  unitario: number;
  total: number;
};

export type LinhaRateio = {
  seqRat: number | null;
  tipo: TipoItem | "GERAL";
  sequencia: number | null;
  codCcu: string;
  ctaFin: number | null;
  numPrj: number;
  codFpj: number;
  perCta: number;
  perRat: number;
  vlrCta: number;
  vlrRat: number;
};

export type Criterio = "PERCENTUAL" | "VALOR" | "IGUAL";
export type RateioDistribuido = LinhaRateio & { item: ItemOc | null; percentual: number; valor: number; reembolsavel: boolean; criterio: Criterio };

export const contaReembolsavel = (conta: number | null | undefined) => typeof conta === "number" && conta >= CONTA_REEMBOLSAVEL_A_PARTIR_DE;
const ocReembolsavel = (usuReemb: string | undefined) => (usuReemb ?? "").trim().toUpperCase() === "S";
const centavos = (n: number) => Math.round(n * 100) / 100;

// ---------------------------------------------------------------- itens

/** Itens (produto + servico) da OC, como o fluxo os normalizou. */
export function itensDoFluxo(produtos: any[], servicos: any[]): ItemOc[] {
  const pegar = (...v: any[]) => v.find((x) => x !== undefined && x !== null && x !== "");
  const num = (v: unknown) => (typeof v === "number" ? v : numeroSenior(String(v ?? "")));
  const positivo = (...v: any[]) => v.find((x) => num(x) > 0) ?? 0; // OC liquidada: saldo zerado, o valor fica em original/bruto
  const linha = (i: any, ref: any, tipo: TipoItem): ItemOc => ({
    tipo,
    sequencia: Number.isFinite(Number(i.sequencia)) && Number(i.sequencia) > 0 ? Number(i.sequencia) : null,
    codigo: String(pegar(ref?.codigo, i.codigo) ?? "-"),
    descricao: String(pegar(ref?.descricao, i.descricao) ?? "-"),
    unidade: String(pegar(i.unidade, ref?.unidade) ?? "-"),
    quantidade: num(pegar(i.quantidades?.pedida, i.quantidades?.original, i.quantidades?.aberta, i.quantidade)),
    unitario: num(pegar(i.valores?.unitario, i.valorUnitario)),
    total: num(positivo(tipo === "SERVICO" ? i.valores?.liquidoServico : undefined, i.valores?.liquido, i.valores?.original, i.valores?.bruto, i.valorTotal)),
  });
  return [...(produtos ?? []).map((i) => linha(i, i.produto, "PRODUTO")), ...(servicos ?? []).map((i) => linha(i, i.servico, "SERVICO"))];
}

// ---------------------------------------------------------------- rateio

/** Linhas da E420RAT (SELECT *) -> rateio. Linha sem SEQIPO/SEQISO e' rateio geral da OC. */
export function lerRateios(linhas: LinhaSenior[]): LinhaRateio[] {
  return linhas.map((l) => {
    const seqIpo = numeroSenior(l.SEQIPO);
    const seqIso = numeroSenior(l.SEQISO);
    const conta = Number.parseInt((l.CTAFIN ?? "").trim(), 10);
    return {
      seqRat: numeroSenior(l.SEQRAT) || null,
      tipo: seqIpo > 0 ? "PRODUTO" : seqIso > 0 ? "SERVICO" : "GERAL",
      sequencia: seqIpo > 0 ? seqIpo : seqIso > 0 ? seqIso : null,
      codCcu: (l.CODCCU ?? "").trim(),
      ctaFin: Number.isFinite(conta) ? conta : null,
      numPrj: numeroSenior(l.NUMPRJ),
      codFpj: numeroSenior(l.CODFPJ),
      perCta: numeroSenior(l.PERCTA),
      perRat: numeroSenior(l.PERRAT),
      vlrCta: numeroSenior(l.VLRCTA),
      vlrRat: numeroSenior(l.VLRRAT),
    };
  });
}

/** Pesos de um grupo de linhas (mesmo item): ver o criterio no topo do arquivo. */
function pesos(grupo: LinhaRateio[]): { pesos: number[]; criterio: Criterio } {
  // Campo de percentual todo em branco no grupo = 100% (nao divide); em branco so' em parte das linhas = 0.
  const efetivo = (campo: "perCta" | "perRat") => {
    const algum = grupo.some((r) => r[campo] > 0);
    return grupo.map((r) => (r[campo] > 0 ? r[campo] : algum ? 0 : 100));
  };
  const cta = efetivo("perCta");
  const rat = efetivo("perRat");
  const porPercentual = grupo.map((_, i) => (cta[i] * rat[i]) / 100);
  if (Math.abs(porPercentual.reduce((s, p) => s + p, 0) - 100) <= 0.5) return { pesos: porPercentual, criterio: "PERCENTUAL" };
  for (const campo of ["vlrRat", "vlrCta"] as const) {
    const v = grupo.map((r) => Math.max(0, r[campo]));
    if (v.reduce((s, x) => s + x, 0) > 0) return { pesos: v, criterio: "VALOR" };
  }
  return { pesos: grupo.map(() => 1), criterio: "IGUAL" };
}

const chaveItem = (tipo: string, sequencia: number | null) => `${tipo}|${sequencia ?? ""}`;

/**
 * Valor e percentual de cada linha de rateio como fatia do item a que pertence (linha geral: fatia do valor da OC).
 * Linha de item que nao esta na OC (ou item sem valor): fica com o valor gravado na Senior.
 */
export function distribuirRateios(itens: ItemOc[], rateios: LinhaRateio[], valorOc: number): RateioDistribuido[] {
  const itemPorChave = new Map(itens.filter((i) => i.sequencia !== null).map((i) => [chaveItem(i.tipo, i.sequencia), i]));
  const grupos = new Map<string, LinhaRateio[]>();
  for (const r of rateios) {
    const k = chaveItem(r.tipo, r.sequencia);
    grupos.set(k, [...(grupos.get(k) ?? []), r]);
  }
  const saida = new Map<LinhaRateio, RateioDistribuido>();
  for (const [k, grupo] of grupos) {
    const item = grupo[0].tipo === "GERAL" ? null : itemPorChave.get(k) ?? null;
    const base = grupo[0].tipo === "GERAL" ? valorOc : item?.total ?? 0;
    const { pesos: p, criterio } = pesos(grupo);
    const soma = p.reduce((s, x) => s + x, 0) || 1;
    let usado = 0;
    grupo.forEach((r, i) => {
      const fatia = p[i] / soma;
      let valor: number;
      if (base > 0) {
        valor = i === grupo.length - 1 ? centavos(base - usado) : centavos(base * fatia);
        usado = centavos(usado + valor);
      } else {
        valor = r.vlrRat > 0 ? r.vlrRat : r.vlrCta; // sem valor de referencia: o que a Senior gravou
      }
      saida.set(r, { ...r, item, percentual: centavos(fatia * 100), valor, reembolsavel: contaReembolsavel(r.ctaFin), criterio });
    });
  }
  return rateios.map((r) => saida.get(r)!); // ordem original da Senior
}

/** O item e' reembolsavel? Pelas linhas de rateio dele; sem linha propria, pelas linhas gerais da OC; USU_REEMB = 'S' marca tudo. */
export function itemReembolsavel(item: ItemOc, distribuidos: RateioDistribuido[], usuReemb: string | undefined): boolean {
  if (ocReembolsavel(usuReemb)) return true;
  const proprias = distribuidos.filter((r) => r.tipo === item.tipo && r.sequencia === item.sequencia);
  const linhas = proprias.length ? proprias : distribuidos.filter((r) => r.tipo === "GERAL");
  return linhas.some((r) => r.reembolsavel);
}

export type ResumoReembolso = { situacao: "SIM" | "NAO" | "MISTA"; reembolsavel: number; naoReembolsavel: number };

/** "Despesa reembolsavel" da OC: toda, nenhuma ou mista (com os valores de cada parte, pelo rateio). */
export function resumoReembolso(itens: ItemOc[], distribuidos: RateioDistribuido[], usuReemb: string | undefined, valorOc: number): ResumoReembolso {
  const totalItens = centavos(itens.reduce((s, i) => s + i.total, 0)) || valorOc;
  if (ocReembolsavel(usuReemb)) return { situacao: "SIM", reembolsavel: totalItens, naoReembolsavel: 0 };
  if (!distribuidos.length) return { situacao: "NAO", reembolsavel: 0, naoReembolsavel: totalItens };
  const sim = centavos(distribuidos.filter((r) => r.reembolsavel).reduce((s, r) => s + r.valor, 0));
  const nao = centavos(distribuidos.filter((r) => !r.reembolsavel).reduce((s, r) => s + r.valor, 0));
  return { situacao: sim > 0 && nao > 0 ? "MISTA" : sim > 0 ? "SIM" : "NAO", reembolsavel: sim, naoReembolsavel: nao };
}

// ---------------------------------------------------------------- HTML

export const CSS_ITENS = `
.reemb-sim { font-weight: bold; }
.total-rateio td { font-weight: bold; background: #f6f6f6; }
.nota-tabela { margin-top: 4px; font-size: 8.5px; color: #555; }
`;

const simNao = (v: boolean) => (v ? `<td class="reemb-sim">SIM</td>` : `<td>NÃO</td>`);

function tabelaItens(titulo: string, itens: ItemOc[], reembolsavel: (i: ItemOc) => boolean, vazio: string): string {
  const linhas = itens.length
    ? itens
        .map(
          (i) =>
            `<tr><td>${esc(i.sequencia ?? "-")}</td><td>${esc(i.codigo)}</td><td>${esc(i.descricao)}</td><td>${esc(i.unidade)}</td><td class="num">${esc(quantidade(i.quantidade))}</td><td class="num">${esc(moeda(i.unitario))}</td><td class="num">${esc(moeda(i.total))}</td>${simNao(reembolsavel(i))}</tr>`
        )
        .join("")
    : `<tr><td colspan="8" class="vazio">${esc(vazio)}</td></tr>`;
  return `
<h2>${esc(titulo)}</h2>
<table>
<thead><tr><th>Seq.</th><th>Código</th><th>Descrição</th><th>Unidade</th><th>Quantidade</th><th>Valor Unitário</th><th>Valor Total</th><th>Reembolsável</th></tr></thead>
<tbody>${linhas}</tbody>
</table>`;
}

const rotuloItem = (r: RateioDistribuido) =>
  r.tipo === "GERAL" ? "OC (rateio geral)" : `${r.tipo === "PRODUTO" ? "Produto" : "Serviço"} ${r.sequencia ?? "?"}${r.item ? ` — ${r.item.descricao}` : " (item não encontrado na OC)"}`;

function tabelaRateios(distribuidos: RateioDistribuido[], nomes: { ccu: Map<string, string>; conta: Map<number, string> }, totalBase: number): string {
  if (!distribuidos.length) {
    return `
<h2>Rateios</h2>
<table><thead><tr><th>Seq.</th><th>Item</th><th>Centro de Custo</th><th>Conta Financeira</th><th>Projeto</th><th>% do item</th><th>Valor</th><th>Reembolsável</th></tr></thead>
<tbody><tr><td colspan="8" class="vazio">Nenhum rateio encontrado.</td></tr></tbody></table>`;
  }
  const extenso = (codigo: string | number | null, nome: string | undefined) => (codigo === null || codigo === "" ? "-" : nome ? `${codigo} - ${nome}` : String(codigo));
  const linhas = distribuidos
    .map(
      (r) =>
        `<tr><td>${esc(r.seqRat ?? "-")}</td><td>${esc(rotuloItem(r))}</td><td>${esc(extenso(r.codCcu, nomes.ccu.get(r.codCcu)))}</td><td>${esc(extenso(r.ctaFin, r.ctaFin === null ? undefined : nomes.conta.get(r.ctaFin)))}</td>` +
        `<td>${r.numPrj > 0 ? esc(`${r.numPrj} / ${r.codFpj}`) : "-"}</td><td class="num">${esc(percentual(r.percentual))}</td><td class="num">${esc(moeda(r.valor))}</td>${simNao(r.reembolsavel)}</tr>`
    )
    .join("");
  const total = centavos(distribuidos.reduce((s, r) => s + r.valor, 0));
  const diferenca = totalBase > 0 && Math.abs(total - totalBase) >= 0.01;
  return `
<h2>Rateios</h2>
<table>
<thead><tr><th>Seq.</th><th>Item</th><th>Centro de Custo</th><th>Conta Financeira</th><th>Projeto</th><th>% do item</th><th>Valor</th><th>Reembolsável</th></tr></thead>
<tbody>${linhas}<tr class="total-rateio"><td colspan="6">Total rateado</td><td class="num">${esc(moeda(total))}</td><td></td></tr></tbody>
</table>
<div class="nota-tabela">O valor de cada linha é a parte do item que cabe àquele centro de custo e conta (a soma das linhas de um item fecha com o valor do item).${
    diferenca ? ` <b>Atenção:</b> o total rateado (${esc(moeda(total))}) difere do total dos itens (${esc(moeda(totalBase))}) — há item sem rateio ou rateio sem item na OC.` : ""
  }</div>`;
}

/** Produtos, Servicos e Rateios do dossie, com a coluna Reembolsavel. */
export function montarHtmlItens(
  itens: ItemOc[],
  distribuidos: RateioDistribuido[],
  usuReemb: string | undefined,
  nomes: { ccu: Map<string, string>; conta: Map<number, string> }
): string {
  const reemb = (i: ItemOc) => itemReembolsavel(i, distribuidos, usuReemb);
  const totalItens = centavos(itens.reduce((s, i) => s + i.total, 0));
  return (
    tabelaItens("Produtos", itens.filter((i) => i.tipo === "PRODUTO"), reemb, "Nenhum produto encontrado.") +
    tabelaItens("Serviços", itens.filter((i) => i.tipo === "SERVICO"), reemb, "Nenhum serviço encontrado.") +
    tabelaRateios(distribuidos, nomes, totalItens)
  );
}
