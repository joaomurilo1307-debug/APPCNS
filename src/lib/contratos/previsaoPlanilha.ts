// "Planilha" mes a mes da Previsao: linhas (linha de custo, centro de custo, categoria ou fornecedor) x meses, com cada linha abrindo nos
// lancamentos/fornecedores que a compoem. So' calculo, sem banco. Usa os mesmos filtros e a mesma definicao de programado/previsto da Previsao.

import { CATEGORIAS } from "./previsao";
import { SEM_LINHA, filtrarItens, mesDoItem, mesesEntre, SEM_DATA, type FiltrosMensal, type ItemPrevisao } from "./previsaoMensal";

export type DimPlanilha = "conta" | "ccu" | "categoria" | "fornecedor";
export const DIMENSOES: DimPlanilha[] = ["conta", "ccu", "categoria", "fornecedor"];

export type LinhaPlanilha = {
  chave: string;
  rotulo: string;
  total: number; // dentro do periodo
  programado: number;
  previsto: number;
  qtd: number;
  antes: number;
  depois: number;
  semData: number;
  porMes: Record<string, number>;
  tipoValor?: "FIXO" | "VARIAVEL" | null; // so' nas linhas de fornecedor/serie de previsao recorrente
  filhos?: LinhaPlanilha[];
};

export type Planilha = { dim: DimPlanilha; filhoDim: DimPlanilha; meses: string[]; linhas: LinhaPlanilha[]; totais: LinhaPlanilha; truncadas: number };

export type Nomes = { ccu: (c: string) => string; conta: (cod: string) => string };

/** Fornecedor "diversos" junta varias series (folha, impostos...): ali a serie da previsao (nome do titulo sem o numero) e' que identifica a despesa. */
export function rotuloDoFornecedor(i: Pick<ItemPrevisao, "fornecedorNome" | "numTit" | "tipo" | "codFor">): string {
  const nome = i.fornecedorNome ?? `código ${i.codFor ?? "?"}`;
  if (i.tipo === "PRV" && /DIVERSOS/i.test(nome)) {
    const base = i.numTit.toUpperCase().replace(/[\s_]*\d+([\s_/]\d+)*$/, "").trim() || i.numTit.toUpperCase();
    return `${base} (${nome})`;
  }
  return nome;
}

export function chaveDaDim(i: ItemPrevisao, dim: DimPlanilha): string {
  switch (dim) {
    case "conta": return i.ctaFin ?? SEM_LINHA;
    case "ccu": return i.ccu;
    case "categoria": return i.categoria;
    case "fornecedor": return rotuloDoFornecedor(i);
  }
}

const rotuloDaDim = (dim: DimPlanilha, chave: string, n: Nomes): string => {
  if (dim === "conta") return chave === SEM_LINHA ? "Sem linha de custo informada" : n.conta(chave);
  if (dim === "ccu") return n.ccu(chave);
  if (dim === "categoria") return CATEGORIAS.find((c) => c.chave === chave)?.rotulo ?? chave;
  return chave;
};

const arred = (v: number) => Math.round(v * 100) / 100;
const nova = (chave: string, rotulo: string): LinhaPlanilha => ({ chave, rotulo, total: 0, programado: 0, previsto: 0, qtd: 0, antes: 0, depois: 0, semData: 0, porMes: {} });

function somar(l: LinhaPlanilha, i: ItemPrevisao, de: string, ate: string) {
  const m = mesDoItem(i);
  l.qtd += 1; // todos os lancamentos da linha, dentro ou fora do periodo
  if (m === SEM_DATA) { l.semData += i.valorAberto; return; }
  if (m < de) { l.antes += i.valorAberto; return; }
  if (m > ate) { l.depois += i.valorAberto; return; }
  l.porMes[m] = (l.porMes[m] ?? 0) + i.valorAberto;
  l.total += i.valorAberto;
  if (i.natureza === "PREVISTO") l.previsto += i.valorAberto;
  else l.programado += i.valorAberto;
}

const fechar = (l: LinhaPlanilha): LinhaPlanilha => ({
  ...l, total: arred(l.total), programado: arred(l.programado), previsto: arred(l.previsto), antes: arred(l.antes), depois: arred(l.depois), semData: arred(l.semData),
  porMes: Object.fromEntries(Object.entries(l.porMes).map(([k, v]) => [k, arred(v)])), filhos: l.filhos?.map(fechar),
});

export function montarPlanilha(todos: ReadonlyArray<ItemPrevisao>, f: FiltrosMensal, dim: DimPlanilha, nomes: Nomes, limite = 150): Planilha {
  const filhoDim: DimPlanilha = dim === "fornecedor" ? "conta" : "fornecedor";
  const meses = mesesEntre(f.de, f.ate);
  const itens = filtrarItens(todos, f);
  const linhas = new Map<string, LinhaPlanilha>();
  const filhos = new Map<string, Map<string, LinhaPlanilha>>();
  const totais = nova("_total", "Total");
  const tipoDaSerie = new Map<string, Set<string>>();
  for (const i of itens) {
    const k = chaveDaDim(i, dim);
    const l = linhas.get(k) ?? nova(k, rotuloDaDim(dim, k, nomes));
    linhas.set(k, l);
    somar(l, i, f.de, f.ate);
    somar(totais, i, f.de, f.ate);
    const fk = chaveDaDim(i, filhoDim);
    const mapa = filhos.get(k) ?? new Map<string, LinhaPlanilha>();
    filhos.set(k, mapa);
    const c = mapa.get(fk) ?? nova(fk, rotuloDaDim(filhoDim, fk, nomes));
    mapa.set(fk, c);
    somar(c, i, f.de, f.ate);
    if (i.valorTipo) {
      const kk = `${k}|${fk}`;
      const s = tipoDaSerie.get(kk) ?? new Set<string>();
      s.add(i.valorTipo);
      tipoDaSerie.set(kk, s);
    }
  }
  const temValor = (l: LinhaPlanilha) => l.total !== 0 || l.antes !== 0 || l.depois !== 0 || l.semData !== 0;
  let lista = [...linhas.values()].filter(temValor);
  for (const l of lista) {
    l.filhos = [...(filhos.get(l.chave)?.values() ?? [])].filter(temValor).sort((a, b) => b.total + b.antes + b.depois - (a.total + a.antes + a.depois));
    for (const c of l.filhos) {
      const s = tipoDaSerie.get(`${l.chave}|${c.chave}`);
      if (s) c.tipoValor = s.size === 1 ? ([...s][0] as "FIXO" | "VARIAVEL") : "VARIAVEL";
    }
  }
  lista.sort((a, b) => b.total + b.antes + b.depois - (a.total + a.antes + a.depois));
  let truncadas = 0;
  if (lista.length > limite) {
    const resto = lista.slice(limite);
    truncadas = resto.length;
    const demais = nova("_demais", `Demais (${resto.length} linhas)`);
    for (const r of resto) {
      demais.total += r.total; demais.programado += r.programado; demais.previsto += r.previsto; demais.qtd += r.qtd; demais.antes += r.antes; demais.depois += r.depois; demais.semData += r.semData;
      for (const [m, v] of Object.entries(r.porMes)) demais.porMes[m] = (demais.porMes[m] ?? 0) + v;
    }
    lista = [...lista.slice(0, limite), demais];
  }
  return { dim, filhoDim, meses, linhas: lista.map(fechar), totais: fechar(totais), truncadas };
}
