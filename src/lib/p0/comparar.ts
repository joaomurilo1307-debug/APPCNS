// Comparacao do P0 (previsto) com o realizado do Senior, por mes e por conta -- puro (sem React), testavel.
//
// Regra dos reembolsaveis (decisao do Joao, 27/10/2026): ate set/2026 o Senior lancava todo o reembolsavel numa conta so' ("Despesas Reembolsaveis",
// conta antiga); a partir do plano novo existem varias contas "R - ...". O P0 ja' vem com as contas R. Em cada mes:
//   - se o realizado AINDA esta na conta antiga (nenhuma conta R lancada no mes) -> TODO o reembolsavel do P0 (contas R e, se o P0 tambem usa a conta antiga, ela) e' SOMADO e comparado com a conta unica;
//   - se o realizado ja' tem contas R no mes -> compara conta R a conta R (linha a linha); o que sobrar na conta antiga aparece a' parte.
// O criterio e' decidido pelo proprio dado de cada mes, nunca por uma data digitada.

import { contaPassa, soma, variacao, type ContaDoContrato, type Filtros } from "../custos/agregacao";

export const TOLERANCIA = 0.005;

export type StatusComparacao = "igual" | "acima" | "abaixo" | "sem_previsao" | "nao_realizado";
export type ModoReembolsavel = "linha" | "agregado";

export type LinhaComparacao = {
  chave: string;
  nome: string;
  grupoCodigo: string;
  grupoNome: string;
  reembolsavel: boolean;
  previsto: number;
  realizado: number;
  /** realizado - previsto: positivo = gastou mais do que o P0 previa */
  delta: number;
  /** delta / previsto (null quando nao ha previsto) */
  pct: number | null;
  status: StatusComparacao;
  nota?: string;
};

export type GrupoComparacao = {
  grupoCodigo: string;
  grupoNome: string;
  previsto: number;
  realizado: number;
  delta: number;
  pct: number | null;
  linhas: LinhaComparacao[];
};

export type ComparacaoDoMes = {
  mes: string;
  /** o mes esta dentro do periodo coberto pelo P0 */
  temP0: boolean;
  modoReembolsavel: ModoReembolsavel;
  previsto: number;
  realizado: number;
  delta: number;
  pct: number | null;
  grupos: GrupoComparacao[];
  contagem: Record<StatusComparacao, number>;
};

type Filtro = Pick<Filtros, "tipo" | "grupo">;

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const chaveDaConta = (c: ContaDoContrato) => (c.codigo != null ? `c${c.codigo}` : `n${semAcento(c.contaFinanceira)}`);
const centavos = (v: number) => Math.round(v * 100) / 100;

/** Valor da conta no mes ("aaaa-mm"); varias entradas no mesmo mes somam. */
export function valorNoMes(c: ContaDoContrato, mes: string): number {
  let t = 0;
  for (const m of c.meses) if (m.competencia.slice(0, 7) === mes) t += m.valor;
  return t;
}

function passa(c: ContaDoContrato, f: Filtro, busca: string): boolean {
  if (!contaPassa(c, f)) return false;
  const termo = busca.trim().toLowerCase();
  return !termo || c.contaFinanceira.toLowerCase().includes(termo);
}

function statusDe(previsto: number, realizado: number): StatusComparacao {
  const p = Math.abs(previsto) >= TOLERANCIA;
  const r = Math.abs(realizado) >= TOLERANCIA;
  if (!p && r) return "sem_previsao";
  if (p && !r) return "nao_realizado";
  if (Math.abs(realizado - previsto) < TOLERANCIA) return "igual";
  return realizado > previsto ? "acima" : "abaixo";
}

/** O Senior ja' lancou alguma conta R (plano novo de reembolsaveis) neste mes? */
export function mesJaTemContasR(realizado: ReadonlyArray<ContaDoContrato>, mes: string): boolean {
  return realizado.some((c) => c.grupoCodigo === "reembR" && Math.abs(valorNoMes(c, mes)) >= TOLERANCIA);
}

export function compararMes(args: {
  p0: ReadonlyArray<ContaDoContrato>;
  realizado: ReadonlyArray<ContaDoContrato>;
  mes: string;
  periodo: { mesIni: string; mesFim: string };
  filtros: Filtro;
  busca?: string;
}): ComparacaoDoMes {
  const { mes, periodo, filtros, busca = "" } = args;
  const temP0 = mes >= periodo.mesIni && mes <= periodo.mesFim;
  const real = args.realizado.filter((c) => passa(c, filtros, busca));
  const prev = temP0 ? args.p0.filter((c) => passa(c, filtros, busca)) : [];
  const modo: ModoReembolsavel = mesJaTemContasR(real, mes) ? "linha" : "agregado";

  type Item = { chave: string; nome: string; grupoCodigo: string; grupoNome: string; reembolsavel: boolean; previsto: number; realizado: number; nota?: string };
  const itens = new Map<string, Item>();
  const item = (c: ContaDoContrato): Item => {
    const k = chaveDaConta(c);
    let it = itens.get(k);
    if (!it) {
      it = { chave: k, nome: c.contaFinanceira, grupoCodigo: c.grupoCodigo, grupoNome: c.grupoNome, reembolsavel: c.reembolsavel, previsto: 0, realizado: 0 };
      itens.set(k, it);
    }
    return it;
  };
  const unica = (): Item => {
    let it = itens.get("reemb-unica");
    if (!it) {
      it = {
        chave: "reemb-unica",
        nome: "Reembolsáveis (conta única do Senior)",
        grupoCodigo: "reemb",
        grupoNome: "Reembolsáveis · conta antiga",
        reembolsavel: true,
        previsto: 0,
        realizado: 0,
        nota: "Soma das contas R do P0 comparada com a conta única do Senior.",
      };
      itens.set("reemb-unica", it);
    }
    return it;
  };

  for (const c of prev) {
    const v = valorNoMes(c, mes);
    if (Math.abs(v) < TOLERANCIA) continue;
    if (modo === "agregado" && (c.grupoCodigo === "reembR" || c.grupoCodigo === "reemb")) unica().previsto += v;
    else item(c).previsto += v;
  }
  for (const c of real) {
    const v = valorNoMes(c, mes);
    if (Math.abs(v) < TOLERANCIA) continue;
    if (modo === "agregado" && (c.grupoCodigo === "reemb" || c.grupoCodigo === "reembR")) unica().realizado += v;
    else {
      const it = item(c);
      it.realizado += v;
      if (modo === "linha" && c.grupoCodigo === "reemb") it.nota = "Conta antiga de reembolsável: o P0 usa as contas R.";
    }
  }

  const linhas: LinhaComparacao[] = Array.from(itens.values())
    .map((it) => ({ ...it, previsto: centavos(it.previsto), realizado: centavos(it.realizado) }))
    .filter((it) => Math.abs(it.previsto) >= TOLERANCIA || Math.abs(it.realizado) >= TOLERANCIA)
    .map((it) => {
      const delta = centavos(it.realizado - it.previsto);
      return { ...it, delta, pct: Math.abs(it.previsto) >= TOLERANCIA ? delta / Math.abs(it.previsto) : null, status: statusDe(it.previsto, it.realizado) };
    });

  const porGrupo = new Map<string, GrupoComparacao>();
  for (const l of linhas) {
    const g = porGrupo.get(l.grupoCodigo) ?? { grupoCodigo: l.grupoCodigo, grupoNome: l.grupoNome, previsto: 0, realizado: 0, delta: 0, pct: null, linhas: [] };
    g.linhas.push(l);
    g.previsto += l.previsto;
    g.realizado += l.realizado;
    porGrupo.set(l.grupoCodigo, g);
  }
  const grupos = Array.from(porGrupo.values())
    .map((g) => {
      const previsto = centavos(g.previsto);
      const realizado = centavos(g.realizado);
      const delta = centavos(realizado - previsto);
      g.linhas.sort((a, b) => Math.max(b.previsto, b.realizado) - Math.max(a.previsto, a.realizado) || a.nome.localeCompare(b.nome, "pt-BR"));
      return { ...g, previsto, realizado, delta, pct: Math.abs(previsto) >= TOLERANCIA ? delta / Math.abs(previsto) : null };
    })
    .sort((a, b) => b.previsto + b.realizado - (a.previsto + a.realizado) || a.grupoNome.localeCompare(b.grupoNome, "pt-BR"));

  const previsto = centavos(soma(linhas.map((l) => l.previsto)));
  const realizado = centavos(soma(linhas.map((l) => l.realizado)));
  const delta = centavos(realizado - previsto);
  const contagem: Record<StatusComparacao, number> = { igual: 0, acima: 0, abaixo: 0, sem_previsao: 0, nao_realizado: 0 };
  for (const l of linhas) contagem[l.status]++;
  return { mes, temP0, modoReembolsavel: modo, previsto, realizado, delta, pct: Math.abs(previsto) >= TOLERANCIA ? delta / Math.abs(previsto) : null, grupos, contagem };
}

// ---------------------------------------------------------------- series para os graficos

/** Total por mes (alinhado a `meses`, chaves "aaaa-mm") das contas que passam nos filtros. */
export function totaisPorMes(contas: ReadonlyArray<ContaDoContrato>, meses: ReadonlyArray<string>, filtros: Filtro, busca = ""): number[] {
  const lista = contas.filter((c) => passa(c, filtros, busca));
  return meses.map((m) => centavos(soma(lista.map((c) => valorNoMes(c, m)))));
}

/** Previsto por mes: numero dentro do periodo do P0 (zero = mes sem previsao, ex.: pausa do contrato) e null fora dele. */
export function previstoPorMes(p0: ReadonlyArray<ContaDoContrato>, meses: ReadonlyArray<string>, periodo: { mesIni: string; mesFim: string }, filtros: Filtro, busca = ""): (number | null)[] {
  const totais = totaisPorMes(p0, meses, filtros, busca);
  return meses.map((m, i) => (m >= periodo.mesIni && m <= periodo.mesFim ? totais[i] : null));
}

/**
 * Desvio do realizado contra o P0 em cada mes: (realizado - previsto) / previsto. Null quando nao da' para calcular: mes fora do P0, sem
 * previsto (pausa) ou mes em andamento (so' o ja' pago). Positivo = gastou mais do que o P0 previa.
 */
export function desviosContraP0(realizado: ReadonlyArray<number>, previsto: ReadonlyArray<number | null>, mesParcialIdx: number | null = null): (number | null)[] {
  return realizado.map((r, i) => {
    const p = previsto[i];
    if (p === null || p === undefined || Math.abs(p) < TOLERANCIA || i === mesParcialIdx) return null;
    return variacao(r, p);
  });
}
