// Previsao mes a mes (somente calculo, sem banco): quanto o Senior ja tem para pagar em cada mes e como isso varia de um mes para o outro.
//   - PROGRAMADO = o que ja esta lancado: titulos em aberto (parcelas, compras, contas) e OCs com data de pagamento prevista
//   - PREVISTO   = previsoes lancadas no Senior (tipo PRV), ou seja, o que ainda se espera mas nao chegou como nota
// O mes de cada lancamento e' o do vencimento (ou da previsao de pagamento da OC). Nada e' estimado aqui.

import { CATEGORIAS, categoriaDoTitulo, somaMeses, tiposDeValorDasSeries, chaveDaSerie, type CategoriaPrevisao, type TituloPrevisao } from "./previsao";

export type NaturezaPrevisao = "PROGRAMADO" | "PREVISTO";
export const SEM_DATA = "sem_data";
export const ANTES = "antes";
export const DEPOIS = "depois";
export const SEM_LINHA = "_sem_linha";
export const SEM_CCU = "_sem_cc";

export type ItemPrevisao = TituloPrevisao & { ccu: string; natureza: NaturezaPrevisao; categoria: CategoriaPrevisao };

export const naturezaDoTitulo = (t: Pick<TituloPrevisao, "tipo">): NaturezaPrevisao => (t.tipo === "PRV" ? "PREVISTO" : "PROGRAMADO");

/** Acrescenta centro de custo, natureza, categoria e tipo de valor (fixo/variavel) a cada lancamento. */
export function prepararItens(brutos: ReadonlyArray<TituloPrevisao & { ccu: string | null }>): ItemPrevisao[] {
  const recorrentes = brutos.filter((t) => categoriaDoTitulo(t) === "RECORRENTE");
  const tipos = tiposDeValorDasSeries(recorrentes);
  return brutos.map((t) => {
    const categoria = categoriaDoTitulo(t);
    return { ...t, ccu: t.ccu ?? SEM_CCU, natureza: naturezaDoTitulo(t), categoria, valorTipo: categoria === "RECORRENTE" ? tipos.get(chaveDaSerie(t)) ?? null : undefined };
  });
}

export const mesDoItem = (i: Pick<TituloPrevisao, "vencimento">): string => (i.vencimento ? i.vencimento.slice(0, 7) : SEM_DATA);

export function mesesEntre(de: string, ate: string, maximo = 36): string[] {
  const lista: string[] = [];
  for (let m = de; m <= ate && lista.length < maximo; m = somaMeses(m, 1)) lista.push(m);
  return lista;
}

export type FiltrosMensal = { de: string; ate: string; ccu?: string | null; conta?: string | null; categoria?: CategoriaPrevisao | null; natureza?: NaturezaPrevisao | null; q?: string | null };

const normaliza = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

function bate(i: ItemPrevisao, f: FiltrosMensal, ignorar: "ccu" | "conta" | "categoria" | null, q: string): boolean {
  if (ignorar !== "ccu" && f.ccu && i.ccu !== f.ccu) return false;
  if (ignorar !== "conta" && f.conta && (f.conta === SEM_LINHA ? !!i.ctaFin : i.ctaFin !== f.conta)) return false;
  if (ignorar !== "categoria" && f.categoria && i.categoria !== f.categoria) return false;
  if (f.natureza && i.natureza !== f.natureza) return false;
  if (q) {
    const alvo = normaliza([i.fornecedorNome ?? "", i.descricao ?? "", i.numTit, i.numOcp ?? "", i.contaNome ?? ""].join(" "));
    if (!q.split(/\s+/).filter(Boolean).every((p) => alvo.includes(p))) return false;
  }
  return true;
}

/** Itens que passam nos filtros (sem olhar o periodo): base da planilha mes a mes. */
export function filtrarItens(todos: ReadonlyArray<ItemPrevisao>, f: FiltrosMensal): ItemPrevisao[] {
  const q = normaliza((f.q ?? "").trim());
  return todos.filter((i) => bate(i, f, null, q));
}

export type MesPrevisao = { mes: string; programado: number; previsto: number; total: number; qtd: number; porCategoria: Record<string, number>; variacao: { valor: number; pct: number | null } | null };
export type FaixaPrevisao = { programado: number; previsto: number; total: number; qtd: number };

export type ResultadoMensal = {
  meses: MesPrevisao[];
  antes: FaixaPrevisao;
  depois: FaixaPrevisao;
  semData: FaixaPrevisao;
  totais: { programado: number; previsto: number; total: number; mediaMensal: number; maiorMes: { mes: string; total: number } | null };
  centros: { ccu: string; n: number; total: number }[];
  linhasDeCusto: { cod: string; n: number; total: number }[];
  categorias: { chave: CategoriaPrevisao; rotulo: string; n: number; total: number }[];
  drill: { mes: string; total: number; programado: number; previsto: number; qtd: number; pagina: number; paginas: number; itens: ItemPrevisao[]; porCategoria: { chave: CategoriaPrevisao; rotulo: string; n: number; total: number }[] } | null;
};

const arred = (v: number) => Math.round(v * 100) / 100;
const vazia = (): FaixaPrevisao => ({ programado: 0, previsto: 0, total: 0, qtd: 0 });
function somar(f: FaixaPrevisao, i: ItemPrevisao) {
  if (i.natureza === "PREVISTO") f.previsto += i.valorAberto;
  else f.programado += i.valorAberto;
  f.total += i.valorAberto;
  f.qtd += 1;
}
const fecha = (f: FaixaPrevisao): FaixaPrevisao => ({ programado: arred(f.programado), previsto: arred(f.previsto), total: arred(f.total), qtd: f.qtd });

export function montarMensal(todos: ReadonlyArray<ItemPrevisao>, f: FiltrosMensal, mesDetalhe?: string | null, pagina = 1, tamanho = 50, celula?: ((i: ItemPrevisao) => boolean) | null): ResultadoMensal {
  const q = normaliza((f.q ?? "").trim());
  const lista = mesesEntre(f.de, f.ate);
  const noPeriodo = (i: ItemPrevisao) => {
    const m = mesDoItem(i);
    return m !== SEM_DATA && m >= f.de && m <= f.ate;
  };

  // ---- por mes
  const porMes = new Map<string, MesPrevisao>(lista.map((m) => [m, { mes: m, programado: 0, previsto: 0, total: 0, qtd: 0, porCategoria: {}, variacao: null }]));
  const antes = vazia(), depois = vazia(), semData = vazia();
  for (const i of todos) {
    if (!bate(i, f, null, q)) continue;
    const m = mesDoItem(i);
    if (m === SEM_DATA) { somar(semData, i); continue; }
    if (m < f.de) { somar(antes, i); continue; }
    if (m > f.ate) { somar(depois, i); continue; }
    const mes = porMes.get(m)!;
    if (i.natureza === "PREVISTO") mes.previsto += i.valorAberto;
    else mes.programado += i.valorAberto;
    mes.total += i.valorAberto;
    mes.qtd += 1;
    mes.porCategoria[i.categoria] = (mes.porCategoria[i.categoria] ?? 0) + i.valorAberto;
  }
  const meses = lista.map((m) => {
    const x = porMes.get(m)!;
    return { ...x, programado: arred(x.programado), previsto: arred(x.previsto), total: arred(x.total), porCategoria: Object.fromEntries(Object.entries(x.porCategoria).map(([k, v]) => [k, arred(v)])) };
  });
  meses.forEach((m, k) => {
    if (k === 0) return;
    const ant = meses[k - 1].total;
    m.variacao = { valor: arred(m.total - ant), pct: ant > 0 ? (m.total - ant) / ant : null };
  });
  const total = arred(meses.reduce((s, m) => s + m.total, 0));
  const maior = meses.reduce<{ mes: string; total: number } | null>((b, m) => (m.total > 0 && (!b || m.total > b.total) ? { mes: m.mes, total: m.total } : b), null);

  // ---- opcoes dos filtros: cada uma ignora o proprio filtro, para mostrar quanto ha em cada escolha
  const agrup = <K extends string>(ignorar: "ccu" | "conta" | "categoria", chave: (i: ItemPrevisao) => K) => {
    const m = new Map<K, { n: number; total: number }>();
    for (const i of todos) {
      if (!noPeriodo(i) || !bate(i, f, ignorar, q)) continue;
      const k = chave(i);
      const a = m.get(k) ?? { n: 0, total: 0 };
      a.n += 1; a.total += i.valorAberto;
      m.set(k, a);
    }
    return m;
  };
  const centros = [...agrup("ccu", (i) => i.ccu)].map(([ccu, v]) => ({ ccu, n: v.n, total: arred(v.total) })).sort((a, b) => b.total - a.total);
  const linhasDeCusto = [...agrup("conta", (i) => i.ctaFin ?? SEM_LINHA)].map(([cod, v]) => ({ cod, n: v.n, total: arred(v.total) })).sort((a, b) => b.total - a.total);
  const catMap = agrup("categoria", (i) => i.categoria);
  const categorias = CATEGORIAS.map((c) => ({ chave: c.chave, rotulo: c.rotulo, n: catMap.get(c.chave)?.n ?? 0, total: arred(catMap.get(c.chave)?.total ?? 0) }));

  // ---- detalhe de um mes (ou das faixas "antes", "depois" e "sem data")
  let drill: ResultadoMensal["drill"] = null;
  if (mesDetalhe) {
    const doMes = todos.filter((i) => {
      if (!bate(i, f, null, q)) return false;
      if (celula && !celula(i)) return false; // detalhe de uma celula da planilha (linha x mes)
      const m = mesDoItem(i);
      if (mesDetalhe === SEM_DATA) return m === SEM_DATA;
      if (mesDetalhe === ANTES) return m !== SEM_DATA && m < f.de;
      if (mesDetalhe === DEPOIS) return m !== SEM_DATA && m > f.ate;
      return m === mesDetalhe;
    });
    doMes.sort((a, b) => a.vencimento.localeCompare(b.vencimento) || b.valorAberto - a.valorAberto || a.numTit.localeCompare(b.numTit));
    const paginas = Math.max(1, Math.ceil(doMes.length / tamanho));
    const p = Math.min(Math.max(1, pagina), paginas);
    const faixa = vazia();
    const cat = new Map<CategoriaPrevisao, { n: number; total: number }>();
    for (const i of doMes) {
      somar(faixa, i);
      const a = cat.get(i.categoria) ?? { n: 0, total: 0 };
      a.n += 1; a.total += i.valorAberto;
      cat.set(i.categoria, a);
    }
    drill = {
      mes: mesDetalhe, total: arred(faixa.total), programado: arred(faixa.programado), previsto: arred(faixa.previsto), qtd: faixa.qtd, pagina: p, paginas,
      itens: doMes.slice((p - 1) * tamanho, p * tamanho),
      porCategoria: CATEGORIAS.map((c) => ({ chave: c.chave, rotulo: c.rotulo, n: cat.get(c.chave)?.n ?? 0, total: arred(cat.get(c.chave)?.total ?? 0) })).filter((c) => c.n > 0),
    };
  }

  return {
    meses, antes: fecha(antes), depois: fecha(depois), semData: fecha(semData),
    totais: { programado: arred(meses.reduce((s, m) => s + m.programado, 0)), previsto: arred(meses.reduce((s, m) => s + m.previsto, 0)), total, mediaMensal: lista.length ? arred(total / lista.length) : 0, maiorMes: maior },
    centros, linhasDeCusto, categorias, drill,
  };
}
