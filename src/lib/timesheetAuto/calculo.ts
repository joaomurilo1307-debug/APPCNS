// Timesheet AUTOMATICO: deduz, das tarefas de uma pessoa, as horas e o percentual de dedicacao dela por centro de custo (contrato, administrativo, proposta...).
// Cada projeto pertence a um centro de custo (Project.codccu); a tarefa herda o centro do projeto.
//
// REGRA (uma so', explicavel, sem "achismo"):
//   1. Cada DIA UTIL contado da pessoa vale `horasPorDia` (padrao 8 h). Dia util = segunda a sexta, menos feriado nacional, feriado de Belo Horizonte e as
//      ausencias que a pessoa marcou (ferias, atestado...). So' contam os dias a partir da ativacao e, no mes corrente, ate hoje.
//   2. Em cada dia, olha-se quais tarefas dela estavam EM ANDAMENTO naquele dia (ver `janelasDaTarefa`) e as horas do dia se dividem IGUALMENTE entre elas.
//   3. Dia sem nenhuma tarefa em andamento vira "horas sem tarefa" (nao vai para nenhum centro de custo; o relatorio mostra o buraco para a pessoa corrigir).
//   4. Soma-se por projeto e por centro de custo; o percentual e' sobre as horas alocadas. Tarefa de projeto sem centro de custo aparece a parte
//      ("Sem centro de custo"), nunca e' jogada em um centro por palpite.
//
// Quando uma tarefa esta "em andamento" (do sinal mais confiavel para o menos):
//   - HISTORICO: a pessoa mudou o status no sistema; conta so' os dias em que o status foi "Fazendo" (pausa em "Bloqueado"/"A fazer" nao conta);
//   - DATAS REAIS: inicio real e fim real da tarefa (o inicio real e' gravado quando ela vai para "Fazendo");
//   - DATAS PREVISTAS: tarefa que nao foi iniciada no sistema conta pelas datas previstas (inicio e prazo), se a pessoa nao desligar essa opcao;
//   - CONCLUSAO: tarefa concluida sem nenhuma data conta no dia em que foi concluida.
// Tarefas marcadas como entrega (marco, sem esforco) nunca entram. Tarefa-mae so' entra se a pessoa nao tiver subtarefa dela (evita contar duas vezes).
//
// Este arquivo e' PURO (sem banco, sem relogio): tudo entra por parametro, para ser testado.

export type Iso = string; // YYYY-MM-DD (dia no fuso de Sao Paulo)
export type StatusTarefa = "A_FAZER" | "FAZENDO" | "BLOQUEADO" | "FEITO";
export type Origem = "historico" | "datas_reais" | "datas_previstas" | "conclusao";

export type EventoStatus = { em: Iso; de: StatusTarefa | null; para: StatusTarefa };

export type TarefaTS = {
  id: string;
  titulo: string;
  projetoId: string | null;
  projetoNome: string | null;
  codccu: string | null;
  status: StatusTarefa;
  startDate: Iso | null;
  dueDate: Iso | null;
  durationDays: number | null;
  actualStartedAt: Iso | null;
  actualEndedAt: Iso | null;
  criadaEm: Iso;
  atualizadaEm: Iso;
  isEntrega: boolean;
  /** a pessoa tem subtarefa desta tarefa: entao so' as subtarefas contam */
  temSubtarefaDaPessoa: boolean;
  eventos: EventoStatus[];
};

export type Ausencia = { de: Iso; ate: Iso };
export type Janela = { de: Iso; ate: Iso; origem: Origem };

export type EntradaCalculo = {
  competencia: string; // YYYY-MM
  hoje: Iso;
  /** primeiro dia contado (a ativacao); dias anteriores nao entram */
  desde: Iso;
  horasPorDia: number;
  ausencias: ReadonlyArray<Ausencia>;
  tarefas: ReadonlyArray<TarefaTS>;
  /** conta as datas previstas das tarefas nao iniciadas (padrao: sim) */
  usarPrevistas?: boolean;
};

export type LinhaTarefa = { id: string; titulo: string; horas: number; dias: number; origem: Origem };
export type LinhaProjeto = { projetoId: string | null; nome: string; horas: number; tarefas: LinhaTarefa[] };
export const SEM_CENTRO = "__sem_cc__";
export const SEM_PROJETO = "__sem_projeto__";
export type LinhaCentro = {
  chave: string; // codccu, SEM_CENTRO ou SEM_PROJETO
  codccu: string | null;
  horas: number;
  /** % das horas alocadas (todas as linhas somam 100) */
  percentual: number;
  /** false nas linhas sem centro de custo: nao podem ser distribuidas para custo */
  identificado: boolean;
  projetos: LinhaProjeto[];
};
export type DiaDetalhe = { dia: Iso; semTarefa: boolean; tarefas: { id: string; horas: number }[] };
export type ResultadoMes = {
  competencia: string;
  de: Iso;
  ate: Iso;
  horasPorDia: number;
  diasUteis: number;
  horasDisponiveis: number;
  horasAlocadas: number;
  horasSemTarefa: number;
  diasSemTarefa: Iso[];
  /** dias do periodo que nao contaram, com o motivo (fim de semana nao entra aqui) */
  diasIgnorados: { dia: Iso; motivo: string }[];
  centros: LinhaCentro[];
  /** soma das horas de linhas identificadas (com centro de custo) e o seu percentual sobre o total alocado */
  horasIdentificadas: number;
  percentualIdentificado: number;
  porDia: DiaDetalhe[];
};

// ---------------------------------------------------------------- datas

const MS_DIA = 86_400_000;
const paraData = (iso: Iso) => new Date(`${iso}T00:00:00.000Z`);
const paraIso = (d: Date): Iso => d.toISOString().slice(0, 10);
export const somaDias = (iso: Iso, n: number): Iso => paraIso(new Date(paraData(iso).getTime() + n * MS_DIA));
export const diaDaSemana = (iso: Iso): number => paraData(iso).getUTCDay(); // 0 = domingo
export const primeiroDia = (competencia: string): Iso => `${competencia}-01`;
export function ultimoDia(competencia: string): Iso {
  const [a, m] = competencia.split("-").map(Number);
  return paraIso(new Date(Date.UTC(a, m, 0)));
}
/** O dia no fuso de Sao Paulo (usado pelo servidor para converter os carimbos do banco). */
export function diaSP(d: Date): Iso {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(d);
}
const menor = (a: Iso, b: Iso) => (a <= b ? a : b);
const maior = (a: Iso, b: Iso) => (a >= b ? a : b);

/** Domingo de Pascoa (algoritmo de Meeus/Jones/Butcher). */
function pascoa(ano: number): Iso {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return paraIso(new Date(Date.UTC(ano, mes - 1, dia)));
}

/**
 * Feriados em que a empresa (Belo Horizonte/MG) nao tem expediente: nacionais (Confraternizacao, Sexta-feira Santa, Tiradentes, Trabalho, Independencia,
 * Aparecida, Finados, Republica, Consciencia Negra desde 2024, Natal) e os de Belo Horizonte (Assuncao, 15/08, e Imaculada Conceicao, 08/12).
 * Carnaval e Corpus Christi sao ponto facultativo: se a empresa parar, a pessoa marca como ausencia.
 */
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

/** Por que o dia nao e' util (null = dia util). Fim de semana, feriado ou ausencia da pessoa. */
export function motivoDiaNaoUtil(dia: Iso, ausencias: ReadonlyArray<Ausencia>): string | null {
  const dow = diaDaSemana(dia);
  if (dow === 0) return "domingo";
  if (dow === 6) return "sábado";
  const feriado = feriados(Number(dia.slice(0, 4))).get(dia);
  if (feriado) return feriado;
  if (ausencias.some((a) => dia >= a.de && dia <= a.ate)) return "ausência";
  return null;
}

// ---------------------------------------------------------------- janelas de cada tarefa

function unir(janelas: Janela[]): Janela[] {
  const ordenadas = janelas.filter((j) => j.de <= j.ate).sort((a, b) => (a.de < b.de ? -1 : a.de > b.de ? 1 : 0));
  const saida: Janela[] = [];
  for (const j of ordenadas) {
    const ultima = saida[saida.length - 1];
    if (ultima && j.de <= somaDias(ultima.ate, 1)) ultima.ate = maior(ultima.ate, j.ate);
    else saida.push({ ...j });
  }
  return saida;
}

/**
 * Os intervalos de dias (inclusivos) em que a tarefa esteve em andamento, do sinal mais confiavel para o menos. Tarefa BLOQUEADA sem historico nao conta
 * dias que nao se sabe; tarefa ainda aberta so' conta ate `hoje`.
 */
export function janelasDaTarefa(t: TarefaTS, hoje: Iso, usarPrevistas = true): { janelas: Janela[]; origem: Origem | null } {
  // 1) historico de status: so' os dias em "Fazendo"
  if (t.eventos.length > 0) {
    const ev = [...t.eventos].sort((a, b) => (a.em < b.em ? -1 : a.em > b.em ? 1 : 0));
    const js: Janela[] = [];
    // antes do primeiro evento a tarefa estava no status `de` do primeiro evento; se era "Fazendo", conta do inicio real (ou da criacao) ate esse dia
    if (ev[0].de === "FAZENDO") js.push({ de: t.actualStartedAt ?? t.criadaEm, ate: ev[0].em, origem: "historico" });
    ev.forEach((e, i) => {
      if (e.para !== "FAZENDO") return;
      const proximo = ev[i + 1];
      js.push({ de: e.em, ate: proximo ? proximo.em : hoje, origem: "historico" });
    });
    // tarefa que terminou fora do sistema (fim real posterior): respeita o fim real quando ele e' anterior ao fim calculado
    const unidas = unir(js).map((j) => (t.actualEndedAt && t.status === "FEITO" ? { ...j, ate: menor(j.ate, t.actualEndedAt) } : j));
    return { janelas: unidas.filter((j) => j.de <= j.ate), origem: "historico" };
  }
  // 2) datas reais
  if (t.actualStartedAt) {
    let fim: Iso;
    if (t.actualEndedAt) fim = t.actualEndedAt;
    else if (t.status === "FAZENDO") fim = hoje;
    else if (t.status === "FEITO") fim = t.actualStartedAt;
    else fim = t.atualizadaEm; // parada (a fazer/bloqueada) sem fim real: conta ate a ultima vez que mexeram
    return { janelas: [{ de: t.actualStartedAt, ate: maior(fim, t.actualStartedAt), origem: "datas_reais" }], origem: "datas_reais" };
  }
  // 3) tarefa concluida sem data nenhuma real
  const previstas = janelaPrevista(t);
  if (t.status === "FEITO") {
    if (previstas) return { janelas: [{ ...previstas, origem: "datas_previstas" }], origem: "datas_previstas" };
    return { janelas: [{ de: t.atualizadaEm, ate: t.atualizadaEm, origem: "conclusao" }], origem: "conclusao" };
  }
  if (t.status === "BLOQUEADO") return { janelas: [], origem: null };
  // 4) nao iniciada: datas previstas (se a pessoa quiser contar)
  if (usarPrevistas && previstas) return { janelas: [{ ...previstas, origem: "datas_previstas" }], origem: "datas_previstas" };
  return { janelas: [], origem: null };
}

function janelaPrevista(t: TarefaTS): { de: Iso; ate: Iso } | null {
  if (t.startDate && t.dueDate) return t.dueDate >= t.startDate ? { de: t.startDate, ate: t.dueDate } : { de: t.dueDate, ate: t.dueDate };
  if (t.startDate) {
    const dur = t.durationDays && t.durationDays > 0 ? t.durationDays : 1;
    return { de: t.startDate, ate: somaDias(t.startDate, dur - 1) };
  }
  if (t.dueDate) {
    const dur = t.durationDays && t.durationDays > 0 ? t.durationDays : 1;
    return { de: somaDias(t.dueDate, -(dur - 1)), ate: t.dueDate };
  }
  return null;
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

// ---------------------------------------------------------------- calculo do mes

export function calcularMes(e: EntradaCalculo): ResultadoMes {
  const usarPrevistas = e.usarPrevistas !== false;
  const inicioMes = primeiroDia(e.competencia);
  const fimMes = ultimoDia(e.competencia);
  const de = maior(inicioMes, e.desde);
  const ate = menor(fimMes, e.hoje); // nada de dia futuro: o relatorio do mes corrente e' "ate hoje"

  const elegiveis = e.tarefas.filter((t) => !t.isEntrega && !t.temSubtarefaDaPessoa);
  const janelas = new Map<string, { janelas: Janela[]; origem: Origem | null }>();
  for (const t of elegiveis) janelas.set(t.id, janelasDaTarefa(t, e.hoje, usarPrevistas));

  const horasPorTarefa = new Map<string, number>();
  const diasPorTarefa = new Map<string, number>();
  const porDia: DiaDetalhe[] = [];
  const diasIgnorados: { dia: Iso; motivo: string }[] = [];
  const diasSemTarefa: Iso[] = [];
  let diasUteis = 0;

  for (let dia = de; dia <= ate; dia = somaDias(dia, 1)) {
    const motivo = motivoDiaNaoUtil(dia, e.ausencias);
    if (motivo) {
      if (motivo !== "sábado" && motivo !== "domingo") diasIgnorados.push({ dia, motivo });
      continue;
    }
    diasUteis += 1;
    const ativas = elegiveis.filter((t) => janelas.get(t.id)!.janelas.some((j) => dia >= j.de && dia <= j.ate));
    if (ativas.length === 0) {
      diasSemTarefa.push(dia);
      porDia.push({ dia, semTarefa: true, tarefas: [] });
      continue;
    }
    const parte = e.horasPorDia / ativas.length;
    porDia.push({ dia, semTarefa: false, tarefas: ativas.map((t) => ({ id: t.id, horas: parte })) });
    for (const t of ativas) {
      horasPorTarefa.set(t.id, (horasPorTarefa.get(t.id) ?? 0) + parte);
      diasPorTarefa.set(t.id, (diasPorTarefa.get(t.id) ?? 0) + 1);
    }
  }

  const horasDisponiveis = diasUteis * e.horasPorDia;
  const horasSemTarefa = diasSemTarefa.length * e.horasPorDia;
  const horasAlocadasBruto = horasDisponiveis - horasSemTarefa;

  // agrupa por centro -> projeto -> tarefa
  type Acum = { chave: string; codccu: string | null; projetos: Map<string, { projetoId: string | null; nome: string; tarefas: TarefaTS[] }> };
  const centros = new Map<string, Acum>();
  for (const t of elegiveis) {
    if (!horasPorTarefa.has(t.id)) continue;
    const chave = !t.projetoId ? SEM_PROJETO : t.codccu ? t.codccu : SEM_CENTRO;
    const c = centros.get(chave) ?? { chave, codccu: chave === SEM_PROJETO || chave === SEM_CENTRO ? null : chave, projetos: new Map() };
    const pk = t.projetoId ?? "__sem_projeto__";
    const p = c.projetos.get(pk) ?? { projetoId: t.projetoId, nome: t.projetoNome ?? "Tarefas sem projeto", tarefas: [] };
    p.tarefas.push(t);
    c.projetos.set(pk, p);
    centros.set(chave, c);
  }

  const soma = (ts: TarefaTS[]) => ts.reduce((s, t) => s + (horasPorTarefa.get(t.id) ?? 0), 0);
  const listaCentros = [...centros.values()].map((c) => ({ c, bruto: [...c.projetos.values()].reduce((s, p) => s + soma(p.tarefas), 0) }));
  listaCentros.sort((a, b) => b.bruto - a.bruto || (a.c.chave < b.c.chave ? -1 : 1));

  const horasCentro = arredondarSomando(listaCentros.map((x) => x.bruto), horasAlocadasBruto);
  const percCentro = horasAlocadasBruto > 0 ? arredondarSomando(listaCentros.map((x) => (x.bruto / horasAlocadasBruto) * 100), 100) : listaCentros.map(() => 0);

  const linhas: LinhaCentro[] = listaCentros.map(({ c }, i) => {
    const projs = [...c.projetos.values()].map((p) => ({ p, bruto: soma(p.tarefas) })).sort((a, b) => b.bruto - a.bruto);
    const horasProj = arredondarSomando(projs.map((x) => x.bruto), horasCentro[i]);
    const projetos: LinhaProjeto[] = projs.map(({ p }, j) => {
      const ts = [...p.tarefas].sort((a, b) => (horasPorTarefa.get(b.id) ?? 0) - (horasPorTarefa.get(a.id) ?? 0));
      const horasT = arredondarSomando(ts.map((t) => horasPorTarefa.get(t.id) ?? 0), horasProj[j]);
      return {
        projetoId: p.projetoId,
        nome: p.nome,
        horas: horasProj[j],
        tarefas: ts.map((t, k) => ({ id: t.id, titulo: t.titulo, horas: horasT[k], dias: diasPorTarefa.get(t.id) ?? 0, origem: janelas.get(t.id)!.origem ?? "datas_previstas" })),
      };
    });
    return { chave: c.chave, codccu: c.codccu, horas: horasCentro[i], percentual: percCentro[i], identificado: c.chave !== SEM_CENTRO && c.chave !== SEM_PROJETO, projetos };
  });

  const horasIdentificadas = linhas.filter((l) => l.identificado).reduce((s, l) => s + l.horas, 0);
  const percentualIdentificado = linhas.filter((l) => l.identificado).reduce((s, l) => s + l.percentual, 0);

  const r2 = (n: number) => Math.round(n * 100) / 100;
  return {
    competencia: e.competencia,
    de,
    ate,
    horasPorDia: e.horasPorDia,
    diasUteis,
    horasDisponiveis: r2(horasDisponiveis),
    horasAlocadas: r2(horasAlocadasBruto),
    horasSemTarefa: r2(horasSemTarefa),
    diasSemTarefa,
    diasIgnorados,
    centros: linhas,
    horasIdentificadas: r2(horasIdentificadas),
    percentualIdentificado: r2(percentualIdentificado),
    porDia: porDia.map((d) => ({ ...d, tarefas: d.tarefas.map((t) => ({ id: t.id, horas: r2(t.horas) })) })),
  };
}
