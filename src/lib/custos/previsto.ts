// Previsto x Realizado do Controle de Custos (replica do relatorio "ANALISE DAS PREVISOES" / painel gerencial das planilhas
// CONTROLE DE CUSTOS dos coordenadores). Funcoes PURAS (sem React nem banco), testaveis: pacote da conta, comparacao por
// pacote > conta, series mensais, assertividade e projecao simples.
//
// Regras copiadas das planilhas (conferidas nas formulas):
//   Realizado x Previsto = Realizado - Previsto            (coluna "REALIZADO x PREVISTO")
//   %                   = Realizado / Previsto - 1         ("-" quando o previsto e' zero)
//   Desvio %            = (Realizado - Previsto) / Previsto
//   Assertividade       = 1 - |Desvio %|                   (a planilha usa 1 - Desvio % com sinal, o que da >100% quando o
//                                                            custo fica ABAIXO do previsto; aqui o desvio e' em modulo, e a
//                                                            assertividade nunca passa de 100% nem fica abaixo de 0%)
// O PACOTE de uma conta e' o cabecalho de nivel 2 do plano financeiro do Senior (ex.: "DESPESAS COM PESSOAL") -- conferido
// conta a conta contra a aba "Plano de Contas CNS" das planilhas: 148 de 148 contas iguais.

import { PLANO_SENIOR } from "./planoContasSenior";
import { eReembolsavel, grupoDaConta, nomeConta } from "./planoContas";
import { chaveMes, serieDaConta, soma, type ContaDoContrato, type ContratoCusto } from "./agregacao";

export type LinhaPrevisto = {
  id: string;
  conta: number;
  /** "2026-04" ou null (previsto sem mes definido) */
  competencia: string | null;
  valor: number;
  descricao: string | null;
  fornecedor: string | null;
  origem: string;
};

// ---------------------------------------------------------------- pacote da conta
const CABECALHOS_NIVEL2 = new Map<string, string>();
for (const [, nome, clafin, nivel] of PLANO_SENIOR) if (nivel === 2) CABECALHOS_NIVEL2.set(clafin, nome);

export type Pacote = { codigo: string; nome: string };

/** Pacote como no plano do Senior e nas planilhas (cabecalho de nivel 2): "Despesas Reembolsaveis" fica em DESPESAS COM PESSOAL. */
export function pacoteSenior(cod: string | number): Pacote {
  const n = Number(cod);
  const conta = PLANO_SENIOR.find((c) => c[0] === n);
  if (!conta) return { codigo: "outros", nome: "OUTRAS CONTAS" };
  const familia = conta[2].slice(0, 3);
  return { codigo: familia, nome: CABECALHOS_NIVEL2.get(familia) ?? "OUTRAS CONTAS" };
}

/** Pacote (cabecalho de nivel 2 do plano financeiro). Reembolsaveis ficam em pacotes proprios, como na tela de custo. */
export function pacoteDaConta(cod: string | number): Pacote {
  const g = grupoDaConta(cod);
  if (g.codigo === "reemb") return { codigo: "reemb", nome: "REEMBOLSÁVEIS · CONTA ANTIGA" };
  if (g.codigo === "reembR") return { codigo: "reembR", nome: "REEMBOLSÁVEIS · CONTAS R" };
  return pacoteSenior(cod);
}

// ---------------------------------------------------------------- formulas da planilha
/** Realizado - Previsto */
export const diferenca = (realizado: number, previsto: number) => realizado - previsto;

/** Realizado / Previsto - 1; null quando o previsto e' zero (a planilha mostra "-"). */
export function pctSobrePrevisto(realizado: number, previsto: number): number | null {
  if (!previsto) return null;
  return realizado / previsto - 1;
}

/** Assertividade do previsto: 1 - |desvio %|, entre 0 e 1. null quando nao ha previsto. */
export function assertividade(realizado: number, previsto: number): number | null {
  if (!previsto) return null;
  return Math.min(1, Math.max(0, 1 - Math.abs((realizado - previsto) / previsto)));
}

/** Somatorio de centavos sem ruido de ponto flutuante. */
const arred = (v: number) => Math.round(v * 100) / 100;

// ---------------------------------------------------------------- comparacao por pacote > conta
export type ContaComparada = {
  conta: number | null;
  nome: string;
  pacoteCodigo: string;
  reembolsavel: boolean;
  previsto: number;
  realizado: number;
  diferenca: number;
  pct: number | null;
  /** so tem previsto (nenhum realizado) ou so tem realizado (nenhum previsto) */
  situacao: "ambos" | "so_previsto" | "so_realizado";
};
export type PacoteComparado = {
  codigo: string;
  nome: string;
  previsto: number;
  realizado: number;
  diferenca: number;
  pct: number | null;
  contas: ContaComparada[];
};
export type Comparativo = {
  pacotes: PacoteComparado[];
  previsto: number;
  realizado: number;
  diferenca: number;
  pct: number | null;
  assertividade: number | null;
  /** previsto lancado sem mes definido (entra no total quando `incluirSemMes`) */
  previstoSemMes: number;
};

export type OpcoesComparativo = {
  /** meses do periodo (chaves "AAAA-MM") */
  meses: ReadonlyArray<string>;
  /** soma o previsto sem mes definido no total? (a planilha o deixa de fora quando ha filtro de periodo) */
  incluirSemMes?: boolean;
  /** filtro por conta/pacote/tipo ja aplicado ao realizado: mesma regra tem que valer para o previsto */
  contaPassa?: (c: { conta: number | null; pacoteCodigo: string; reembolsavel: boolean }) => boolean;
  /** true = agrupa como nas planilhas e no plano do Senior (reembolsaveis dentro do pacote DESPESAS COM PESSOAL); false = grupos proprios */
  comoNaPlanilha?: boolean;
};

export function comparar(contrato: Pick<ContratoCusto, "contas">, previsto: ReadonlyArray<LinhaPrevisto>, op: OpcoesComparativo): Comparativo {
  const meses = new Set(op.meses);
  const passa = op.contaPassa ?? (() => true);
  const pacoteDe = op.comoNaPlanilha ? pacoteSenior : pacoteDaConta;
  const porConta = new Map<string, ContaComparada>();

  const chave = (conta: number | null, nome: string) => (conta !== null ? `c${conta}` : `n${nome}`);
  const obter = (conta: number | null, nome: string, pacoteCodigo: string, reembolsavel: boolean) => {
    const k = chave(conta, nome);
    let c = porConta.get(k);
    if (!c) {
      c = { conta, nome, pacoteCodigo, reembolsavel, previsto: 0, realizado: 0, diferenca: 0, pct: null, situacao: "ambos" };
      porConta.set(k, c);
    }
    return c;
  };

  // realizado (Senior), pela mesma serie que a tela de custo usa
  const mesesLista = Array.from(op.meses);
  for (const c of contrato.contas as ContaDoContrato[]) {
    const pacote = c.codigo !== null ? pacoteDe(c.codigo) : { codigo: c.grupoCodigo, nome: c.grupoNome.toUpperCase() };
    if (!passa({ conta: c.codigo, pacoteCodigo: pacote.codigo, reembolsavel: c.reembolsavel })) continue;
    const total = soma(serieDaConta(c, mesesLista));
    if (!total) continue;
    obter(c.codigo, c.contaFinanceira, pacote.codigo, c.reembolsavel).realizado += total;
  }

  // previsto (digitado/importado)
  let previstoSemMes = 0;
  for (const p of previsto) {
    const nome = nomeConta(p.conta) ?? `Conta ${p.conta}`;
    const pacote = pacoteDe(p.conta);
    const reemb = eReembolsavel(p.conta);
    if (!passa({ conta: p.conta, pacoteCodigo: pacote.codigo, reembolsavel: reemb })) continue;
    if (p.competencia === null) {
      previstoSemMes += p.valor;
      if (!op.incluirSemMes) continue;
    } else if (!meses.has(p.competencia)) continue;
    obter(p.conta, nome, pacote.codigo, reemb).previsto += p.valor;
  }

  const porPacote = new Map<string, PacoteComparado>();
  for (const c of porConta.values()) {
    c.previsto = arred(c.previsto);
    c.realizado = arred(c.realizado);
    c.diferenca = arred(diferenca(c.realizado, c.previsto));
    c.pct = pctSobrePrevisto(c.realizado, c.previsto);
    c.situacao = c.previsto && !c.realizado ? "so_previsto" : !c.previsto && c.realizado ? "so_realizado" : "ambos";
    if (!c.previsto && !c.realizado) continue;
    const nome = c.conta !== null ? pacoteDe(c.conta).nome : c.pacoteCodigo.toUpperCase();
    let p = porPacote.get(c.pacoteCodigo);
    if (!p) {
      p = { codigo: c.pacoteCodigo, nome, previsto: 0, realizado: 0, diferenca: 0, pct: null, contas: [] };
      porPacote.set(c.pacoteCodigo, p);
    }
    p.contas.push(c);
    p.previsto += c.previsto;
    p.realizado += c.realizado;
  }
  const pacotes = Array.from(porPacote.values()).map((p) => {
    const previstoP = arred(p.previsto);
    const realizadoP = arred(p.realizado);
    return {
      ...p,
      previsto: previstoP,
      realizado: realizadoP,
      diferenca: arred(diferenca(realizadoP, previstoP)),
      pct: pctSobrePrevisto(realizadoP, previstoP),
      contas: p.contas.sort((a, b) => Math.max(b.previsto, b.realizado) - Math.max(a.previsto, a.realizado)),
    };
  });
  pacotes.sort((a, b) => Math.max(b.previsto, b.realizado) - Math.max(a.previsto, a.realizado));

  const prev = arred(soma(pacotes.map((p) => p.previsto)));
  const real = arred(soma(pacotes.map((p) => p.realizado)));
  return {
    pacotes,
    previsto: prev,
    realizado: real,
    diferenca: arred(diferenca(real, prev)),
    pct: pctSobrePrevisto(real, prev),
    assertividade: assertividade(real, prev),
    previstoSemMes: arred(previstoSemMes),
  };
}

// ---------------------------------------------------------------- series mensais (matriz "TABELA")
export type SerieMensal = { meses: string[]; previsto: number[]; realizado: number[] };

/** Previsto e realizado mes a mes (mesmos filtros do comparativo). */
export function serieMensal(
  contrato: Pick<ContratoCusto, "contas">,
  previsto: ReadonlyArray<LinhaPrevisto>,
  meses: ReadonlyArray<string>,
  contaPassa: OpcoesComparativo["contaPassa"] = () => true
): SerieMensal {
  const idx = new Map(meses.map((m, i) => [m, i]));
  const prev = meses.map(() => 0);
  const real = meses.map(() => 0);
  for (const c of contrato.contas as ContaDoContrato[]) {
    const pacote = c.codigo !== null ? pacoteDaConta(c.codigo) : { codigo: c.grupoCodigo, nome: c.grupoNome };
    if (!contaPassa({ conta: c.codigo, pacoteCodigo: pacote.codigo, reembolsavel: c.reembolsavel })) continue;
    serieDaConta(c, meses).forEach((v, i) => (real[i] += v));
  }
  for (const p of previsto) {
    if (p.competencia === null) continue;
    const i = idx.get(p.competencia);
    if (i === undefined) continue;
    const pacote = pacoteDaConta(p.conta);
    if (!(contaPassa ?? (() => true))({ conta: p.conta, pacoteCodigo: pacote.codigo, reembolsavel: eReembolsavel(p.conta) })) continue;
    prev[i] += p.valor;
  }
  return { meses: Array.from(meses), previsto: prev.map(arred), realizado: real.map(arred) };
}

// ---------------------------------------------------------------- projecao / tendencia
export type Projecao = {
  /** previsto total do contrato (todos os meses com previsto, inclusive os futuros) */
  previstoTotal: number;
  realizadoAteAgora: number;
  /** previsto dos meses ainda por vir (apos o mes de referencia) */
  previstoRestante: number;
  /** realizado ate agora + previsto restante: onde o custo termina se o que falta sair como previsto */
  projetadoNoFim: number;
  /** projetadoNoFim - previstoTotal (positivo = estouro) */
  desvioProjetado: number;
  consumido: number | null;
};

/**
 * Tendencia simples e transparente (sem modelo estatistico): o que ja foi realizado ate o mes de referencia (inclusive) mais
 * o previsto dos meses seguintes. `mesRef` e' a chave "AAAA-MM" do ultimo mes com realizado.
 */
export function projetar(realizadoPorMes: ReadonlyMap<string, number>, previsto: ReadonlyArray<LinhaPrevisto>, mesRef: string): Projecao {
  let realizado = 0;
  for (const [m, v] of realizadoPorMes) if (m <= mesRef) realizado += v;
  let previstoTotal = 0;
  let previstoRestante = 0;
  for (const p of previsto) {
    previstoTotal += p.valor;
    if (p.competencia !== null && p.competencia > mesRef) previstoRestante += p.valor;
  }
  const projetado = realizado + previstoRestante;
  return {
    previstoTotal: arred(previstoTotal),
    realizadoAteAgora: arred(realizado),
    previstoRestante: arred(previstoRestante),
    projetadoNoFim: arred(projetado),
    desvioProjetado: arred(projetado - previstoTotal),
    consumido: previstoTotal ? realizado / previstoTotal : null,
  };
}

/** Previsto por conta e mes (celula da grade de edicao): soma das linhas ativas. */
export function grade(previsto: ReadonlyArray<LinhaPrevisto>): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const p of previsto) {
    if (p.competencia === null) continue;
    const linha = out.get(p.conta) ?? new Map<string, number>();
    linha.set(p.competencia, arred((linha.get(p.competencia) ?? 0) + p.valor));
    out.set(p.conta, linha);
  }
  return out;
}

// ---------------------------------------------------------------- leitura em texto (valores digitados / colados)
/** "1.234,56" | "1234,56" | "1234.56" | "R$ 1.234,56" | "-50" -> number; null se nao for numero. */
export function lerValor(txt: string | number | null | undefined): number | null {
  if (typeof txt === "number") return Number.isFinite(txt) ? txt : null;
  if (!txt) return null;
  const s = String(txt).replace(/R\$/gi, "").replace(/\s/g, "");
  if (!/^-?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const virgula = s.lastIndexOf(",");
  const ponto = s.lastIndexOf(".");
  let limpo: string;
  if (virgula >= 0 && ponto >= 0) limpo = virgula > ponto ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (virgula >= 0) limpo = s.replace(",", ".");
  else if (ponto >= 0 && /^-?\d{1,3}(\.\d{3})+$/.test(s)) limpo = s.replace(/\./g, "");
  else limpo = s;
  const n = Number(limpo);
  return Number.isFinite(n) ? n : null;
}

/** "2026-04", "04/2026", "abr/26" ou data ISO -> "2026-04"; null se nao entender. */
export function lerMes(txt: string | null | undefined): string | null {
  if (!txt) return null;
  const s = String(txt).trim().toLowerCase();
  let m = /^(\d{4})-(\d{2})(-\d{2})?/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[1]}-${m[2]}`;
  m = /^(\d{1,2})\/(\d{4})$/.exec(s);
  if (m && Number(m[1]) >= 1 && Number(m[1]) <= 12) return `${m[2]}-${m[1].padStart(2, "0")}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) return `${m[3]}-${m[2].padStart(2, "0")}`;
  const nomes = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  m = /^([a-zç]{3})[a-zç]*[\/ \-]+(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const i = nomes.indexOf(m[1]);
    if (i >= 0) return `${m[2].length === 2 ? "20" + m[2] : m[2]}-${String(i + 1).padStart(2, "0")}`;
  }
  return null;
}

/** Chave "AAAA-MM" a partir de um ISO do banco (competencia = dia 1 UTC). */
export const mesDoBanco = (d: Date | string | null | undefined) => (d ? chaveMes(typeof d === "string" ? d : d.toISOString()) : null);
