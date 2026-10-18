// Agregacoes puras da tela Custo por Contrato (sem React, testaveis): periodo, filtros, series mensais, grupos,
// variacao e cores estaveis por grupo. A tela so' desenha o que sai daqui.

export type MesValor = { competencia: string; valor: number };
export type ContaDoContrato = {
  contaFinanceira: string;
  codigo: number | null;
  grupoCodigo: string;
  grupoNome: string;
  reembolsavel: boolean;
  inativa?: boolean;
  total: number;
  /** Custo por data de pagamento (padrao): cada parcela no mes em que foi paga. */
  meses: MesValor[];
  /** Custo por competencia: a compra inteira no mes da nota. Ausente = ainda nao ha detalhe com competencia. */
  mesesCompetencia?: MesValor[];
};
export type ContratoCusto = {
  codccu: string;
  contrato: string;
  nome: string;
  teamId: string | null;
  teamName: string | null;
  projectName: string | null;
  totalGeral: number;
  ultimaCompetencia: string | null;
  contas: ContaDoContrato[];
};

export type TipoCusto = "todos" | "proprio" | "reembolsavel";
/** Mes de referencia das series: data de pagamento (parcela a parcela) ou competencia (a compra inteira, no mes da nota). */
export type BaseMes = "pagamento" | "competencia";

/** Contratos com a serie mensal da base escolhida (as telas so' leem `conta.meses`, entao trocar a base nao muda mais nada). */
export function contratosNaBase(contratos: ReadonlyArray<ContratoCusto>, base: BaseMes): ContratoCusto[] {
  if (base === "pagamento") return contratos as ContratoCusto[];
  return contratos.map((c) => ({
    ...c,
    contas: c.contas.map((x) => ({ ...x, meses: x.mesesCompetencia ?? x.meses })),
  }));
}
export type Filtros = { de: string; ate: string; tipo: TipoCusto; grupo: string };

/** "2026-04-01T00:00:00.000Z" -> "2026-04" */
export const chaveMes = (iso: string) => iso.slice(0, 7);
export const isoDoMes = (chave: string) => `${chave}-01T00:00:00.000Z`;

/** Meses (chaves, do mais antigo ao mais novo) de `de` ate `ate`, restritos aos meses disponiveis. */
export function mesesDoPeriodo(todosAsc: ReadonlyArray<string>, de: string, ate: string): string[] {
  return todosAsc.filter((m) => m >= de && m <= ate);
}

export function contaPassa(c: ContaDoContrato, f: Pick<Filtros, "tipo" | "grupo">): boolean {
  if (f.tipo === "reembolsavel" && !c.reembolsavel) return false;
  if (f.tipo === "proprio" && c.reembolsavel) return false;
  if (f.grupo !== "todos" && c.grupoCodigo !== f.grupo) return false;
  return true;
}

/** Valor da conta em cada mes do periodo (alinhado a `meses`). */
export function serieDaConta(c: ContaDoContrato, meses: ReadonlyArray<string>): number[] {
  const porMes = new Map(c.meses.map((m) => [chaveMes(m.competencia), m.valor]));
  return meses.map((m) => porMes.get(m) ?? 0);
}

export const soma = (xs: ReadonlyArray<number>) => xs.reduce((s, x) => s + x, 0);

export type LinhaConta = { conta: ContaDoContrato; serie: number[]; total: number };

export function linhasDoContrato(contrato: ContratoCusto, f: Filtros, meses: ReadonlyArray<string>, busca = ""): LinhaConta[] {
  const termo = busca.trim().toLowerCase();
  return contrato.contas
    .filter((c) => contaPassa(c, f) && (!termo || c.contaFinanceira.toLowerCase().includes(termo)))
    .map((conta) => {
      const serie = serieDaConta(conta, meses);
      return { conta, serie, total: soma(serie) };
    })
    .filter((l) => l.serie.some((v) => v !== 0))
    .sort((a, b) => b.total - a.total);
}

export type LinhaGrupo = { grupoCodigo: string; grupoNome: string; linhas: LinhaConta[]; serie: number[]; total: number };

export function agruparPorGrupo(linhas: ReadonlyArray<LinhaConta>, nMeses: number): LinhaGrupo[] {
  const mapa = new Map<string, LinhaGrupo>();
  for (const l of linhas) {
    let g = mapa.get(l.conta.grupoCodigo);
    if (!g) {
      g = { grupoCodigo: l.conta.grupoCodigo, grupoNome: l.conta.grupoNome, linhas: [], serie: new Array(nMeses).fill(0), total: 0 };
      mapa.set(l.conta.grupoCodigo, g);
    }
    g.linhas.push(l);
    g.total += l.total;
    l.serie.forEach((v, i) => (g!.serie[i] += v));
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total);
}

export type LinhaContrato = { contrato: ContratoCusto; serie: number[]; total: number; media: number };

export function linhasDoPortfolio(contratos: ReadonlyArray<ContratoCusto>, f: Filtros, meses: ReadonlyArray<string>, busca = ""): LinhaContrato[] {
  const termo = busca.trim().toLowerCase();
  return contratos
    .filter((c) => !termo || c.nome.toLowerCase().includes(termo) || c.codccu.includes(termo) || (c.teamName ?? "").toLowerCase().includes(termo))
    .map((contrato) => {
      const serie = meses.map(() => 0);
      for (const c of contrato.contas) {
        if (!contaPassa(c, f)) continue;
        const s = serieDaConta(c, meses);
        s.forEach((v, i) => (serie[i] += v));
      }
      const total = soma(serie);
      return { contrato, serie, total, media: meses.length ? total / meses.length : 0 };
    })
    .filter((l) => l.serie.some((v) => v !== 0))
    .sort((a, b) => b.total - a.total);
}

/** Variacao percentual entre dois valores; null quando nao ha base de comparacao. */
export function variacao(atual: number, anterior: number): number | null {
  if (!anterior) return null;
  return (atual - anterior) / Math.abs(anterior);
}

// ---------------------------------------------------------------- cores estaveis por grupo
// Paleta categorica validada (daltonismo e piso de distincao em visao normal) -- ver registro do design em
// docs/custo-por-contrato.md. A cor segue o GRUPO (nunca o ranking do momento): filtrar nao repinta os que ficaram.
export const PALETA_GRUPOS = ["#0e9f94", "#eb6834", "#2a78d6", "#eda100", "#6b4fd0", "#e87ba4"] as const;
export const COR_DEMAIS = "#9aa5b1";

/** Grupos na ordem do volume total no conjunto de dados -> cor fixa para os 6 maiores, cinza para o resto. */
export function coresDosGrupos(contratos: ReadonlyArray<ContratoCusto>): Map<string, string> {
  const total = new Map<string, number>();
  for (const c of contratos) for (const conta of c.contas) total.set(conta.grupoCodigo, (total.get(conta.grupoCodigo) ?? 0) + conta.total);
  const ordenados = Array.from(total.entries()).sort((a, b) => b[1] - a[1]);
  // o grupo das contas R (plano novo de reembolsaveis) sempre ganha cor propria, mesmo com volume pequeno no inicio
  const iR = ordenados.findIndex(([codigo]) => codigo === "reembR");
  if (iR >= PALETA_GRUPOS.length) {
    const [r] = ordenados.splice(iR, 1);
    ordenados.splice(PALETA_GRUPOS.length - 1, 0, r);
  }
  const cores = new Map<string, string>();
  ordenados.forEach(([codigo], i) => cores.set(codigo, i < PALETA_GRUPOS.length ? PALETA_GRUPOS[i] : COR_DEMAIS));
  return cores;
}

// ---------------------------------------------------------------- escala "bonita" para o eixo
export function escalaBonita(max: number, ticks = 4): { topo: number; marcas: number[] } {
  if (max <= 0) return { topo: 1, marcas: [0, 1] };
  const bruto = max / ticks;
  const exp = Math.floor(Math.log10(bruto));
  const base = Math.pow(10, exp);
  const frac = bruto / base;
  const passo = (frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10) * base;
  const marcas: number[] = [];
  for (let v = 0; v <= max + passo * 0.999; v += passo) {
    marcas.push(Math.round(v * 1e6) / 1e6);
    if (v >= max) break;
  }
  return { topo: marcas[marcas.length - 1], marcas };
}

// ---------------------------------------------------------------- acompanhamento (linhas, variacao, ponte)

/** Valores acumulados mes a mes. */
export function acumulado(valores: ReadonlyArray<number>): number[] {
  let s = 0;
  return valores.map((v) => (s += v));
}

/** Media dos meses FECHADOS (o mes em andamento fica de fora para nao puxar a media para baixo). */
export function mediaDoPeriodo(valores: ReadonlyArray<number>, ignorarUltimo: boolean): number {
  const base = ignorarUltimo ? valores.slice(0, -1) : valores;
  return base.length ? soma(base) / base.length : 0;
}

/** Media movel de `janela` meses; null onde nao ha meses suficientes ou no mes em andamento (quando `ignorarUltimo`). */
export function mediaMovel(valores: ReadonlyArray<number>, janela: number, ignorarUltimo: boolean): (number | null)[] {
  return valores.map((_, i) => {
    if (ignorarUltimo && i === valores.length - 1) return null;
    if (i < janela - 1) return null;
    return soma(valores.slice(i - janela + 1, i + 1)) / janela;
  });
}

/** Variacao de cada mes contra o anterior (null no primeiro mes, ou quando o anterior e' zero, ou no mes em andamento). */
export function variacoesMensais(valores: ReadonlyArray<number>, ignorarUltimo: boolean): (number | null)[] {
  return valores.map((v, i) => {
    if (i === 0) return null;
    if (ignorarUltimo && i === valores.length - 1) return null;
    return variacao(v, valores[i - 1]);
  });
}

export type PassoPonte = { nome: string; delta: number };

/**
 * Ponte (cascata) entre dois meses: variacao de cada item (grupo/conta/centro) do mes anterior para o mes de referencia.
 * Mostra os `n` maiores movimentos (em modulo) e junta o resto em "Demais".
 */
export function passosDaPonte(itens: ReadonlyArray<{ nome: string; anterior: number; atual: number }>, n = 5): PassoPonte[] {
  const deltas = itens.map((i) => ({ nome: i.nome, delta: i.atual - i.anterior })).filter((d) => Math.abs(d.delta) >= 0.005);
  deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  const topo = deltas.slice(0, n);
  const resto = soma(deltas.slice(n).map((d) => d.delta));
  return Math.abs(resto) >= 0.005 ? [...topo, { nome: "Demais", delta: resto }] : topo;
}

export type Movimento = { nome: string; anterior: number; atual: number; delta: number; pct: number | null };

/** Maiores altas e maiores quedas entre dois meses. */
export function maioresMovimentos(itens: ReadonlyArray<{ nome: string; anterior: number; atual: number }>, n = 6): { altas: Movimento[]; quedas: Movimento[] } {
  const todos: Movimento[] = itens
    .map((i) => ({ ...i, delta: i.atual - i.anterior, pct: variacao(i.atual, i.anterior) }))
    .filter((m) => Math.abs(m.delta) >= 0.005);
  return {
    altas: todos.filter((m) => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, n),
    quedas: todos.filter((m) => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, n),
  };
}
