// Timesheet AUTOMATICO -- motor de calculo (v2). Deduz, das tarefas de uma pessoa, as horas e o percentual de dedicacao por centro de custo.
// MEMORIAL COMPLETO: grupo-consominas-engenharia/memorial_calculo_timesheet_automatico.md (premissas, formulas, invariantes e brechas fechadas).
//
// Resumo do modelo ("alocacao por capacidade diaria com ancoragem nas horas declaradas"):
//   CAPACIDADE   Cada dia TRABALHADO da pessoa vale `horasPorDia` (jornada). Dia trabalhado = segunda a sexta, menos feriado (nacional/BH) e menos falta/ausencia.
//                Ausencia, falta e feriado nao entram: quem os controla e' o ponto/folha; o timesheet e' o percentual do que a pessoa TRABALHOU.
//   ATIVIDADE    Uma tarefa so' conta se foi INICIADA, e so' nos dias em que esteve "Fazendo" (historico de status; sem historico, do inicio real ao fim real),
//                e so' no periodo em que era DESTA pessoa (historico de responsavel). Tarefa so' planejada (datas previstas) nunca conta.
//   ESFORCO      A pessoa nao pode "dobrar": em cada dia a soma das horas de todas as suas tarefas nao passa da jornada. O dia e' dividido entre as tarefas ativas.
//                Quando a tarefa tem HORAS DEDICADAS (declaradas), o total declarado e' espalhado pelos dias em que ela esteve ativa por ajuste proporcional
//                iterativo (RAS/IPF): cada tarefa fecha o seu total e cada dia respeita a jornada. Tarefa sem horas declaradas ocupa o que sobrar do dia, por igual.
//   PERCENTUAL   % de cada centro de custo = horas alocadas ao centro / horas alocadas no periodo. Capacidade sem tarefa/apontamento aparece a parte.
//
// PURO (sem banco, sem relogio): tudo entra por parametro, para ser testado.

export type Iso = string; // YYYY-MM-DD (dia no fuso de Sao Paulo)
export type StatusTarefa = "A_FAZER" | "FAZENDO" | "BLOQUEADO" | "FEITO";
export type Fonte = "declarado" | "estimado";
export type Confianca = "alta" | "media" | "baixa";

export type EventoStatus = { em: Iso; de: StatusTarefa | null; para: StatusTarefa };
export type Mandato = { de: Iso | null; ate: Iso | null }; // periodo em que a tarefa era da pessoa (null = sem limite)

export type TarefaTS = {
  id: string;
  titulo: string;
  projetoId: string | null;
  projetoNome: string | null;
  codccu: string | null;
  status: StatusTarefa;
  criadaEm: Iso;
  atualizadaEm: Iso;
  actualStartedAt: Iso | null;
  actualEndedAt: Iso | null;
  /** horas que ESTA pessoa declarou para a tarefa (null = nao declarou). Com troca de responsavel, cada dono tem as suas (ver `horasDoDono`) */
  horasDedicadas: number | null;
  /** ultimo dia em que a pessoa informou as horas: numa tarefa ainda em andamento, as horas valem ate esse dia (os dias seguintes sao estimados) */
  horasDedicadasEm: Iso | null;
  isEntrega: boolean;
  /** a pessoa tem subtarefa desta tarefa: entao so' as subtarefas contam */
  temSubtarefaDaPessoa: boolean;
  eventos: EventoStatus[];
  /** periodos em que era da pessoa; null = sempre foi (sem historico de troca de responsavel) */
  mandatos: Mandato[] | null;
};

export type Ausencia = { de: Iso; ate: Iso };
export type Janela = { de: Iso; ate: Iso };
export type CelulaTS = { d: Iso; t: string; h: number };
export type MetaTarefa = { titulo: string; projetoId: string | null; projetoNome: string | null; codccu: string | null };

export type EntradaCalculo = {
  /** periodo do relatorio (inclusivo) */
  de: Iso;
  ate: Iso;
  hoje: Iso;
  /** primeiro dia contado (ativacao; pode ser retroativo) */
  desde: Iso;
  /** a partir daqui o sistema "vale"; dias anteriores sao retroativos (reconstituidos) */
  inicioOficial: Iso;
  horasPorDia: number;
  ausencias: ReadonlyArray<Ausencia>;
  tarefas: ReadonlyArray<TarefaTS>;
  /** meses fechados (AAAA-MM): as celulas gravadas valem no lugar do calculo ao vivo */
  congelados?: Readonly<Record<string, { matriz: CelulaTS[]; metas: Record<string, MetaTarefa> }>>;
};

export type LinhaTarefa = {
  id: string;
  titulo: string;
  horas: number;
  dias: number;
  fonte: Fonte;
  confianca: Confianca;
  declarado: number | null;
  /** horas declaradas que nao couberam na jornada dos dias em que a tarefa esteve ativa */
  excesso: number;
  status: StatusTarefa | null;
};
export type LinhaProjeto = { projetoId: string | null; nome: string; horas: number; tarefas: LinhaTarefa[] };
export const SEM_CENTRO = "__sem_cc__";
export const SEM_PROJETO = "__sem_projeto__";
export type LinhaCentro = {
  chave: string;
  codccu: string | null;
  horas: number;
  percentual: number;
  identificado: boolean;
  projetos: LinhaProjeto[];
};
export type Aviso = { tipo: "SEM_CENTRO" | "SEM_HORAS" | "EXCESSO" | "PARADA" | "ESTIMADO" | "NAO_CONTADA"; tarefaId: string | null; projetoId: string | null; texto: string };
export type Agora = { dia: Iso; tarefas: { id: string; titulo: string; codccu: string | null; chave: string; fracao: number }[]; centros: { chave: string; codccu: string | null; fracao: number }[] };

export type Relatorio = {
  de: Iso;
  ate: Iso;
  horasPorDia: number;
  /** dias do periodo (a partir da ativacao) que foram trabalhados / de ausencia / de feriado */
  diasTrabalhados: number;
  diasAusencia: number;
  diasFeriado: number;
  diasRetroativos: number;
  retroativo: boolean;
  horasDisponiveis: number;
  horasAlocadas: number;
  /** capacidade dos dias trabalhados que nao foi para nenhuma tarefa (sem tarefa ou sem horas apontadas) */
  horasSemApontamento: number;
  diasSemTarefa: Iso[];
  centros: LinhaCentro[];
  horasIdentificadas: number;
  percentualIdentificado: number;
  avisos: Aviso[];
  agora: Agora | null;
  /** hora a hora (dia x tarefa), base para filtros, graficos e para o fechamento do mes */
  matriz: CelulaTS[];
  metas: Record<string, MetaTarefa>;
  convergiu: boolean;
};

// ---------------------------------------------------------------- datas

const MS_DIA = 86_400_000;
const paraData = (iso: Iso) => new Date(`${iso}T00:00:00.000Z`);
const paraIso = (d: Date): Iso => d.toISOString().slice(0, 10);
export const somaDias = (iso: Iso, n: number): Iso => paraIso(new Date(paraData(iso).getTime() + n * MS_DIA));
export const diaDaSemana = (iso: Iso): number => paraData(iso).getUTCDay();
export const primeiroDia = (competencia: string): Iso => `${competencia}-01`;
export function ultimoDia(competencia: string): Iso {
  const [a, m] = competencia.split("-").map(Number);
  return paraIso(new Date(Date.UTC(a, m, 0)));
}
export function diaSP(d: Date): Iso {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
}
const menor = (a: Iso, b: Iso) => (a <= b ? a : b);
const maior = (a: Iso, b: Iso) => (a >= b ? a : b);
const r2 = (n: number) => Math.round(n * 100) / 100;

function pascoa(ano: number): Iso {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return paraIso(new Date(Date.UTC(ano, mes - 1, dia)));
}

/** Feriados sem expediente (Belo Horizonte/MG): nacionais, mais Assuncao (15/08) e Imaculada Conceicao (08/12). Carnaval e Corpus Christi: a pessoa marca ausencia. */
export function feriados(ano: number): Map<Iso, string> {
  const f = new Map<Iso, string>();
  const fixo = (md: string, nome: string) => f.set(`${ano}-${md}`, nome);
  fixo("01-01", "Confraternização Universal");
  f.set(somaDias(pascoa(ano), -2), "Sexta-feira Santa");
  fixo("04-21", "Tiradentes");
  fixo("05-01", "Dia do Trabalho");
  fixo("09-07", "Independência");
  fixo("10-12", "Nossa Senhora Aparecida");
  fixo("11-02", "Finados");
  fixo("11-15", "Proclamação da República");
  if (ano >= 2024) fixo("11-20", "Consciência Negra");
  fixo("12-25", "Natal");
  fixo("08-15", "Assunção de Nossa Senhora (Belo Horizonte)");
  fixo("12-08", "Imaculada Conceição (Belo Horizonte)");
  return f;
}

/** Por que o dia nao e' trabalhado (null = dia trabalhado). "ausência" cobre falta, ferias e atestado marcados pela pessoa. */
export function motivoDiaNaoUtil(dia: Iso, ausencias: ReadonlyArray<Ausencia>): string | null {
  const dow = diaDaSemana(dia);
  if (dow === 0) return "domingo";
  if (dow === 6) return "sábado";
  const feriado = feriados(Number(dia.slice(0, 4))).get(dia);
  if (feriado) return feriado;
  if (ausencias.some((a) => dia >= a.de && dia <= a.ate)) return "ausência";
  return null;
}

// ---------------------------------------------------------------- janelas de atividade

function unir(js: Janela[]): Janela[] {
  const ord = js.filter((j) => j.de <= j.ate).sort((a, b) => (a.de < b.de ? -1 : a.de > b.de ? 1 : 0));
  const saida: Janela[] = [];
  for (const j of ord) {
    const u = saida[saida.length - 1];
    if (u && j.de <= somaDias(u.ate, 1)) u.ate = maior(u.ate, j.ate);
    else saida.push({ ...j });
  }
  return saida;
}

export type EventoResponsavel = { em: Iso; de: string | null; para: string | null; horasDoAnterior?: number | null };

/**
 * Horas dedicadas que pertencem a ESTA pessoa numa tarefa. As horas sao de quem as informou: o responsavel de hoje usa o campo da tarefa (e, se ainda nao
 * informou, as que ele mesmo tinha informado antes de passar a tarefa adiante); quem ja passou a tarefa usa as que informou na hora de passar.
 */
export function horasDoDono(userId: string, responsavelAtual: string | null, horasAtuais: number | null, eventos: ReadonlyArray<EventoResponsavel>): number | null {
  const ev = [...eventos].sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0));
  const dele = [...ev].reverse().find((e) => e.de === userId && e.horasDoAnterior != null);
  if (responsavelAtual === userId) return horasAtuais ?? dele?.horasDoAnterior ?? null;
  return dele?.horasDoAnterior ?? null;
}

/**
 * Periodos (dias, inclusivos) em que a tarefa foi desta pessoa, a partir do historico de trocas de responsavel. O dia da troca e' de quem RECEBEU a tarefa.
 * null = a tarefa nunca trocou de responsavel (sempre foi dela). Lista vazia = nao foi dela em nenhum momento.
 */
export function mandatosDaPessoa(userId: string, eventos: ReadonlyArray<EventoResponsavel>): Mandato[] | null {
  if (eventos.length === 0) return null;
  const ev = [...eventos].sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0));
  const saida: Mandato[] = [];
  if (ev[0].de === userId) saida.push({ de: null, ate: somaDias(ev[0].em, -1) });
  ev.forEach((e, i) => {
    if (e.para !== userId) return;
    const prox = ev[i + 1];
    saida.push({ de: e.em, ate: prox ? somaDias(prox.em, -1) : null });
  });
  return saida.filter((m) => !(m.de && m.ate && m.de > m.ate));
}

function cortarPelosMandatos(js: Janela[], mandatos: Mandato[] | null): Janela[] {
  if (!mandatos) return js;
  const saida: Janela[] = [];
  for (const j of js) {
    for (const m of mandatos) {
      const de = m.de ? maior(j.de, m.de) : j.de;
      const ate = m.ate ? menor(j.ate, m.ate) : j.ate;
      if (de <= ate) saida.push({ de, ate });
    }
  }
  return unir(saida);
}

/**
 * Dias (inclusivos) em que a tarefa esteve em andamento. So' tarefa INICIADA conta.
 *   1) historico de status: so' os dias em "Fazendo" (Bloqueado/A fazer pausam);
 *   2) sem historico: do inicio real ao fim real (ate hoje se ainda esta Fazendo; tarefa parada conta ate a ultima movimentacao);
 *   3) tarefa concluida sem nenhuma data: no dia da conclusao.
 * Tarefa nunca iniciada (A fazer, sem inicio real) nao tem janela. O resultado ja vem cortado pelo periodo em que a tarefa era da pessoa.
 */
export function janelasDaTarefa(t: TarefaTS, hoje: Iso): { janelas: Janela[]; porHistorico: boolean } {
  let js: Janela[] = [];
  let porHistorico = false;
  if (t.eventos.length > 0) {
    porHistorico = true;
    const ev = [...t.eventos].sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0));
    if (ev[0].de === "FAZENDO") js.push({ de: t.actualStartedAt ?? t.criadaEm, ate: ev[0].em });
    ev.forEach((e, i) => {
      if (e.para !== "FAZENDO") return;
      const prox = ev[i + 1];
      js.push({ de: e.em, ate: prox ? prox.em : hoje });
    });
    js = unir(js);
    if (t.status === "FEITO" && t.actualEndedAt) js = js.map((j) => ({ de: j.de, ate: menor(j.ate, t.actualEndedAt!) })).filter((j) => j.de <= j.ate);
    if (js.length === 0 && t.status === "FEITO") {
      // concluida direto de "A fazer" para "Feito", sem nunca passar por "Fazendo": conta se ha prova do trabalho (periodo real registrado ou horas informadas)
      const fimDia = t.actualEndedAt ?? t.atualizadaEm;
      if (t.actualStartedAt && t.actualStartedAt < fimDia) js = [{ de: t.actualStartedAt, ate: fimDia }];
      else if (t.horasDedicadas !== null) js = [{ de: fimDia, ate: fimDia }];
    }
  } else if (t.actualStartedAt) {
    let fim: Iso;
    if (t.actualEndedAt) fim = t.actualEndedAt;
    else if (t.status === "FAZENDO") fim = hoje;
    else if (t.status === "FEITO") fim = t.actualStartedAt;
    else fim = t.atualizadaEm;
    js = [{ de: t.actualStartedAt, ate: maior(fim, t.actualStartedAt) }];
  } else if (t.status === "FEITO") {
    const dia = t.actualEndedAt ?? t.atualizadaEm;
    js = [{ de: dia, ate: dia }];
  }
  return { janelas: cortarPelosMandatos(js.map((j) => ({ de: j.de, ate: menor(j.ate, hoje) })).filter((j) => j.de <= j.ate), t.mandatos), porHistorico };
}

// ---------------------------------------------------------------- arredondamento sem perder horas

/** Arredonda cada valor a `casas` casas de modo que a soma seja exatamente `total` (maior resto). */
export function arredondarSomando(valores: ReadonlyArray<number>, total: number, casas = 2): number[] {
  const f = 10 ** casas;
  const alvo = Math.round(total * f);
  const bases = valores.map((v) => Math.floor(v * f + 1e-9));
  let falta = alvo - bases.reduce((s, b) => s + b, 0);
  const restos = valores.map((v, i) => ({ i, r: v * f - bases[i] })).sort((a, b) => b.r - a.r);
  for (let k = 0; falta > 0 && restos.length > 0; k = (k + 1) % restos.length, falta--) bases[restos[k].i] += 1;
  for (let k = restos.length - 1; falta < 0 && restos.length > 0; k = (k - 1 + restos.length) % restos.length, falta++) bases[restos[k].i] -= 1;
  return bases.map((b) => b / f);
}

// ---------------------------------------------------------------- distribuicao do esforco (coracao do calculo)

export type EntradaDistribuicao = {
  /** capacidade (jornada) de cada dia trabalhado */
  capacidade: ReadonlyArray<number>;
  /** por tarefa: indices dos dias (em `capacidade`) em que esteve ativa, e as horas declaradas (null = nao declarou) */
  tarefas: ReadonlyArray<{ dias: ReadonlyArray<number>; declarado: number | null }>;
};
export type SaidaDistribuicao = { horas: number[][]; excesso: number[]; convergiu: boolean };

/**
 * Distribui o esforco. Para cada dia d: a soma das horas das tarefas ativas nunca passa de capacidade[d] (ninguem dobra).
 *   1. Linha de base: o dia e' dividido por igual entre as tarefas ativas nele (capacidade / n).
 *   2. Tarefas com horas declaradas H: ajuste proporcional iterativo (RAS): escala-se cada tarefa para fechar H e, se o dia estourar a capacidade,
 *      escalam-se para baixo as declaradas daquele dia. Repete ate estabilizar. Se a soma declarada nao cabe na jornada, sobra `excesso` (nao e' inventado).
 *   3. Tarefas sem horas declaradas dividem por igual o que sobrou de cada dia.
 * Determinístico, sem aleatoriedade.
 */
export function distribuirEsforco(e: EntradaDistribuicao): SaidaDistribuicao {
  const nDias = e.capacidade.length;
  const ativas: number[] = new Array(nDias).fill(0);
  e.tarefas.forEach((t) => t.dias.forEach((d) => { ativas[d] += 1; }));
  const x: number[][] = e.tarefas.map((t) => t.dias.map((d) => e.capacidade[d] / ativas[d]));
  const declaradas = e.tarefas.map((t, i) => (t.declarado !== null && t.dias.length > 0 ? i : -1)).filter((i) => i >= 0);

  let convergiu = true;
  if (declaradas.length > 0) {
    convergiu = false;
    // posicao de cada (tarefa, dia) para somar por dia rapidamente
    const porDia: { i: number; k: number }[][] = Array.from({ length: nDias }, () => []);
    declaradas.forEach((i) => e.tarefas[i].dias.forEach((d, k) => porDia[d].push({ i, k })));
    for (let it = 0; it < 2000; it++) {
      const antes = declaradas.map((i) => x[i].slice());
      for (const i of declaradas) {
        const s = x[i].reduce((a, b) => a + b, 0);
        if (s > 0) {
          const f = (e.tarefas[i].declarado as number) / s;
          for (let k = 0; k < x[i].length; k++) x[i][k] *= f;
        }
      }
      let estourou = false;
      for (let d = 0; d < nDias; d++) {
        const itens = porDia[d];
        if (itens.length === 0) continue;
        const soma = itens.reduce((a, { i, k }) => a + x[i][k], 0);
        if (soma > e.capacidade[d] + 1e-9) {
          estourou = true;
          const f = e.capacidade[d] / soma;
          for (const { i, k } of itens) x[i][k] *= f;
        }
      }
      // sem estouro de jornada, as linhas acabaram de fechar nas horas declaradas: solucao exata
      if (!estourou) { convergiu = true; break; }
      // com estouro persistente (declarado nao cabe na jornada) o ajuste estabiliza no maximo que cabe; o resto vira `excesso`
      let mudanca = 0;
      declaradas.forEach((i, j) => x[i].forEach((v, k) => { mudanca = Math.max(mudanca, Math.abs(v - antes[j][k])); }));
      if (mudanca < 1e-9) { convergiu = true; break; }
    }
  }

  // sobra de cada dia para as nao declaradas (por igual)
  const usado: number[] = new Array(nDias).fill(0);
  const livres: { i: number; k: number }[][] = Array.from({ length: nDias }, () => []);
  e.tarefas.forEach((t, i) => {
    const decl = t.declarado !== null && t.dias.length > 0;
    t.dias.forEach((d, k) => {
      if (decl) usado[d] += x[i][k];
      else livres[d].push({ i, k });
    });
  });
  for (let d = 0; d < nDias; d++) {
    const sobra = Math.max(0, e.capacidade[d] - usado[d]);
    for (const { i, k } of livres[d]) x[i][k] = sobra / livres[d].length;
  }
  const excesso = e.tarefas.map((t, i) => (t.declarado !== null ? Math.max(0, t.declarado - x[i].reduce((a, b) => a + b, 0)) : 0));
  return { horas: x, excesso, convergiu };
}

// ---------------------------------------------------------------- relatorio

const DIAS_PARADA = 7;

export function calcular(e: EntradaCalculo): Relatorio {
  const fim = menor(e.ate, e.hoje);
  const inicioConta = maior(e.de, e.desde);
  const elegiveis = e.tarefas.filter((t) => !t.isEntrega && !t.temSubtarefaDaPessoa);

  // atividade de cada tarefa
  const base = elegiveis.map((t) => ({ t, ...janelasDaTarefa(t, e.hoje) })).filter((x) => x.janelas.length > 0);

  // horizonte: do primeiro dia de atividade (limitado a 400 dias antes da ativacao) ate HOJE, nao ate o fim do periodo consultado: o esforco de uma tarefa
  // (e a divisao do dia entre as tarefas) e' uma conta so' sobre a vida inteira dela; o periodo e' apenas um recorte, e por isso os recortes sempre somam o total
  let inicioH = inicioConta;
  for (const x of base) inicioH = menor(inicioH, x.janelas[0].de);
  inicioH = maior(inicioH, somaDias(e.desde, -400));

  // calendario de dias trabalhados no horizonte
  const dias: Iso[] = [];
  const idxDia = new Map<Iso, number>();
  const ignorados: { dia: Iso; motivo: string }[] = [];
  for (let d = inicioH; d <= e.hoje; d = somaDias(d, 1)) {
    const motivo = motivoDiaNaoUtil(d, e.ausencias);
    if (motivo) {
      if (d >= inicioConta && motivo !== "sábado" && motivo !== "domingo") ignorados.push({ dia: d, motivo });
      continue;
    }
    idxDia.set(d, dias.length);
    dias.push(d);
  }
  const capacidade = dias.map(() => e.horasPorDia);

  // dias ativos de cada tarefa (so' dias trabalhados) e distribuicao
  type Parte = { t: TarefaTS; porHistorico: boolean; idx: number[]; declarado: number | null };
  const semDiaTrabalhado: { t: TarefaTS; janelas: Janela[] }[] = [];
  const ts: Parte[] = [];
  for (const x of base) {
    const idxSet: number[] = [];
    for (const j of x.janelas) for (let d = j.de; d <= j.ate; d = somaDias(d, 1)) { const k = idxDia.get(d); if (k !== undefined) idxSet.push(k); }
    const idx = Array.from(new Set(idxSet)).sort((a, b) => a - b);
    if (idx.length === 0) { semDiaTrabalhado.push({ t: x.t, janelas: x.janelas }); continue; }
    const declarado = x.t.horasDedicadas;
    // tarefa AINDA em andamento: as horas informadas valem ate o dia em que foram informadas (sao "ate agora"); os dias depois disso sao estimados.
    // Sem essa divisao, as mesmas horas seriam espalhadas por mais dias a cada dia que passa e o passado "escorregaria".
    if (declarado !== null && x.t.status !== "FEITO" && x.t.horasDedicadasEm) {
      const antes = idx.filter((k) => dias[k] <= x.t.horasDedicadasEm!);
      const depois = idx.filter((k) => dias[k] > x.t.horasDedicadasEm!);
      if (antes.length > 0 && depois.length > 0) {
        ts.push({ t: x.t, porHistorico: x.porHistorico, idx: antes, declarado });
        ts.push({ t: x.t, porHistorico: x.porHistorico, idx: depois, declarado: null });
        continue;
      }
    }
    ts.push({ t: x.t, porHistorico: x.porHistorico, idx, declarado });
  }
  const dist = distribuirEsforco({ capacidade, tarefas: ts.map((x) => ({ dias: x.idx, declarado: x.declarado })) });

  // celulas do periodo (ao vivo) e congeladas (meses fechados)
  const diasPeriodo = dias.filter((d) => d >= inicioConta && d <= fim);
  const noPeriodo = new Set(diasPeriodo);
  const congelado = (d: Iso) => e.congelados?.[d.slice(0, 7)];
  const celulas: CelulaTS[] = [];
  const metas: Record<string, MetaTarefa> = {};
  ts.forEach((x, i) => {
    x.idx.forEach((k, j) => {
      const d = dias[k];
      if (!noPeriodo.has(d) || congelado(d)) return;
      const h = dist.horas[i][j];
      if (h > 1e-9) celulas.push({ d, t: x.t.id, h });
    });
    metas[x.t.id] = { titulo: x.t.titulo, projetoId: x.t.projetoId, projetoNome: x.t.projetoNome, codccu: x.t.codccu };
  });
  const meses = new Set(diasPeriodo.map((d) => d.slice(0, 7)));
  meses.forEach((m) => {
    const c = e.congelados?.[m];
    if (!c) return;
    for (const cel of c.matriz) if (noPeriodo.has(cel.d)) celulas.push(cel);
    for (const [id, meta] of Object.entries(c.metas)) metas[id] = meta;
  });
  celulas.sort((a, b) => (a.d < b.d ? -1 : a.d > b.d ? 1 : a.t < b.t ? -1 : 1));

  // agregacao por tarefa
  const horasTarefa = new Map<string, number>();
  const diasTarefa = new Map<string, Set<Iso>>();
  const diasComHoras = new Set<Iso>();
  for (const c of celulas) {
    horasTarefa.set(c.t, (horasTarefa.get(c.t) ?? 0) + c.h);
    (diasTarefa.get(c.t) ?? diasTarefa.set(c.t, new Set()).get(c.t)!).add(c.d);
    diasComHoras.add(c.d);
  }
  const porId = new Map(elegiveis.map((t) => [t.id, t]));
  const idxLive = new Map<string, number>();
  ts.forEach((x, i) => { if (!idxLive.has(x.t.id)) idxLive.set(x.t.id, i); }); // a parte "informada" vem primeiro

  const alocadoBruto = [...horasTarefa.values()].reduce((s, h) => s + h, 0);
  const alocado = r2(alocadoBruto);
  const disponivel = diasPeriodo.length * e.horasPorDia;

  type Acum = { chave: string; codccu: string | null; projetos: Map<string, { projetoId: string | null; nome: string; tarefas: string[] }> };
  const centros = new Map<string, Acum>();
  for (const id of horasTarefa.keys()) {
    const m = metas[id];
    const chave = !m.projetoId ? SEM_PROJETO : m.codccu ? m.codccu : SEM_CENTRO;
    const c = centros.get(chave) ?? { chave, codccu: chave === SEM_PROJETO || chave === SEM_CENTRO ? null : chave, projetos: new Map() };
    const pk = m.projetoId ?? SEM_PROJETO;
    const p = c.projetos.get(pk) ?? { projetoId: m.projetoId, nome: m.projetoNome ?? "Tarefas sem projeto", tarefas: [] };
    p.tarefas.push(id);
    c.projetos.set(pk, p);
    centros.set(chave, c);
  }
  const somaT = (ids: string[]) => ids.reduce((s, id) => s + (horasTarefa.get(id) ?? 0), 0);
  const listaC = [...centros.values()].map((c) => ({ c, bruto: [...c.projetos.values()].reduce((s, p) => s + somaT(p.tarefas), 0) })).sort((a, b) => b.bruto - a.bruto || (a.c.chave < b.c.chave ? -1 : 1));
  const hC = arredondarSomando(listaC.map((x) => x.bruto), alocadoBruto);
  const pC = alocadoBruto > 0 ? arredondarSomando(listaC.map((x) => (x.bruto / alocadoBruto) * 100), 100) : listaC.map(() => 0);

  const confiancaDe = (t: TarefaTS | undefined, porHist: boolean): Confianca => {
    const decl = !!t && t.horasDedicadas !== null;
    return decl && porHist ? "alta" : decl || porHist ? "media" : "baixa";
  };
  const linhas: LinhaCentro[] = listaC.map(({ c }, i) => {
    const projs = [...c.projetos.values()].map((p) => ({ p, bruto: somaT(p.tarefas) })).sort((a, b) => b.bruto - a.bruto);
    const hP = arredondarSomando(projs.map((x) => x.bruto), hC[i]);
    const projetos: LinhaProjeto[] = projs.map(({ p }, j) => {
      const ids = [...p.tarefas].sort((a, b) => (horasTarefa.get(b) ?? 0) - (horasTarefa.get(a) ?? 0));
      const hT = arredondarSomando(ids.map((id) => horasTarefa.get(id) ?? 0), hP[j]);
      return {
        projetoId: p.projetoId,
        nome: p.nome,
        horas: hP[j],
        tarefas: ids.map((id, k) => {
          const t = porId.get(id);
          const ix = idxLive.get(id);
          const porHist = ix !== undefined ? ts[ix].porHistorico : false;
          return {
            id,
            titulo: metas[id].titulo,
            horas: hT[k],
            dias: diasTarefa.get(id)?.size ?? 0,
            fonte: t && t.horasDedicadas !== null ? "declarado" : "estimado",
            confianca: confiancaDe(t, porHist),
            declarado: t?.horasDedicadas ?? null,
            excesso: ix !== undefined ? r2(dist.excesso[ix]) : 0,
            status: t?.status ?? null,
          } as LinhaTarefa;
        }),
      };
    });
    return { chave: c.chave, codccu: c.codccu, horas: hC[i], percentual: pC[i], identificado: c.chave !== SEM_CENTRO && c.chave !== SEM_PROJETO, projetos };
  });
  const horasIdentificadas = linhas.filter((l) => l.identificado).reduce((s, l) => s + l.horas, 0);
  const percentualIdentificado = linhas.filter((l) => l.identificado).reduce((s, l) => s + l.percentual, 0);

  // contagem de dias do periodo
  let diasAusencia = 0, diasFeriado = 0;
  for (const ig of ignorados) if (ig.dia >= inicioConta && ig.dia <= fim) { if (ig.motivo === "ausência") diasAusencia++; else diasFeriado++; }
  const diasSemTarefa = diasPeriodo.filter((d) => !diasComHoras.has(d));
  const diasRetroativos = diasPeriodo.filter((d) => d < e.inicioOficial).length;

  // avisos
  const avisos: Aviso[] = [];
  for (const l of linhas) {
    if (l.chave === SEM_CENTRO) for (const p of l.projetos) avisos.push({ tipo: "SEM_CENTRO", tarefaId: null, projetoId: p.projetoId, texto: `O projeto “${p.nome}” não tem centro de custo: as ${r2(p.horas)} h dele não entram em nenhum contrato.` });
    for (const p of l.projetos) for (const t of p.tarefas) {
      const real = porId.get(t.id);
      if (t.excesso > 0.01) avisos.push({ tipo: "EXCESSO", tarefaId: t.id, projetoId: p.projetoId, texto: `“${t.titulo}” declara ${r2(t.declarado ?? 0)} h, mas só cabem ${r2((t.declarado ?? 0) - t.excesso)} h na jornada dos dias em que esteve em andamento. Confira as horas e as datas; se você faz horas extras, aumente as horas por dia em Configuração.` });
      if (real && real.status === "FEITO" && real.horasDedicadas === null) avisos.push({ tipo: "SEM_HORAS", tarefaId: t.id, projetoId: p.projetoId, texto: `“${t.titulo}” foi concluída sem horas dedicadas: as horas dela são uma estimativa.` });
      if (real && real.status === "FAZENDO" && real.atualizadaEm < somaDias(e.hoje, -DIAS_PARADA)) avisos.push({ tipo: "PARADA", tarefaId: t.id, projetoId: p.projetoId, texto: `“${t.titulo}” está em “Fazendo” há mais de ${DIAS_PARADA} dias sem movimentação e divide o seu dia com as outras. Se não está trabalhando nela, pause.` });
    }
  }

  // o que NAO entra na conta e a pessoa precisa saber (senao o trabalho some em silencio)
  const noPer = (d: Iso) => d >= inicioConta && d <= fim;
  for (const t of elegiveis) {
    const { janelas } = janelasDaTarefa(t, e.hoje);
    if (janelas.length === 0 && t.status === "FEITO" && t.horasDedicadas === null && t.eventos.length > 0 && noPer(t.actualEndedAt ?? t.atualizadaEm)) {
      avisos.push({ tipo: "NAO_CONTADA", tarefaId: t.id, projetoId: t.projetoId, texto: `“${t.titulo}” foi concluída sem nunca ter ficado em “Fazendo” e sem horas dedicadas: não entra na conta. Informe as horas dedicadas para ela contar.` });
    }
  }
  for (const x of semDiaTrabalhado) {
    if (x.janelas.some((j) => noPer(j.de) || noPer(j.ate))) {
      avisos.push({ tipo: "NAO_CONTADA", tarefaId: x.t.id, projetoId: x.t.projetoId, texto: `“${x.t.titulo}” só teve atividade em dias sem expediente (fim de semana, feriado ou ausência): essas horas não entram na conta.` });
    }
  }

  // ao vivo: o que esta em "Fazendo" hoje e como o dia de hoje se divide
  let agora: Agora | null = null;
  if (idxDia.has(e.hoje)) {
    const k = idxDia.get(e.hoje)!;
    const ativasHoje = ts.filter((x) => x.idx.includes(k) && x.t.status === "FAZENDO");
    if (ativasHoje.length > 0) {
      const f = 1 / ativasHoje.length;
      const porCentro = new Map<string, { chave: string; codccu: string | null; fracao: number }>();
      const arr = ativasHoje.map((x) => {
        const chave = !x.t.projetoId ? SEM_PROJETO : x.t.codccu ? x.t.codccu : SEM_CENTRO;
        const c = porCentro.get(chave) ?? { chave, codccu: chave === SEM_PROJETO || chave === SEM_CENTRO ? null : chave, fracao: 0 };
        c.fracao += f;
        porCentro.set(chave, c);
        return { id: x.t.id, titulo: x.t.titulo, codccu: x.t.codccu, chave, fracao: f };
      });
      agora = { dia: e.hoje, tarefas: arr, centros: [...porCentro.values()].sort((a, b) => b.fracao - a.fracao) };
    }
  }

  return {
    de: inicioConta,
    ate: fim,
    horasPorDia: e.horasPorDia,
    diasTrabalhados: diasPeriodo.length,
    diasAusencia,
    diasFeriado,
    diasRetroativos,
    retroativo: diasRetroativos > 0,
    horasDisponiveis: r2(disponivel),
    horasAlocadas: alocado,
    horasSemApontamento: r2(Math.max(0, disponivel - alocadoBruto)),
    diasSemTarefa,
    centros: linhas,
    horasIdentificadas: r2(horasIdentificadas),
    percentualIdentificado: r2(percentualIdentificado),
    avisos,
    agora,
    // precisao total de proposito: o mes fechado guarda estas celulas e, ao reler, as somas tem de dar exatamente o que foi visto ao fechar (arredondar aqui
    // faria os totais do mes fechado divergirem em centavos); quem exibe formata
    matriz: celulas.map((c) => ({ d: c.d, t: c.t, h: c.h })),
    metas,
    convergiu: dist.convergiu,
  };
}
