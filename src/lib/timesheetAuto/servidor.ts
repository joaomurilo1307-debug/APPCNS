// Camada de banco do timesheet automatico: monta a entrada do calculo (src/lib/timesheetAuto/calculo.ts, pura) a partir das tarefas da pessoa, aplica o
// fechamento do mes e decide quem pode ver o timesheet de quem.

import { prisma } from "@/lib/prisma";
import { manageablePdiUserIds } from "@/lib/permissions";
import { NOME_PROJETO_EXEMPLO } from "@/lib/projetos/exemplo";
import { calcular, diaSP, horasDoDono, mandatosDaPessoa, primeiroDia, somaDias, ultimoDia, type CelulaTS, type MetaTarefa, type Relatorio, type StatusTarefa, type TarefaTS } from "./calculo";

export const COMPETENCIA_VALIDA = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
export const hojeSP = () => diaSP(new Date());
export const competenciaAtual = () => hojeSP().slice(0, 7);
/** Campo so' de data (inicio/prazo da tarefa, ausencia) fica gravado em meia-noite UTC: o dia e' o da data UTC. */
export const diaDaData = (d: Date) => d.toISOString().slice(0, 10);
const paraDataUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const DIAS_ANTES_DA_ATIVACAO = 90;
const SEM_LIMITE_PASSADO = "2000-01-01";

export type ConfigTimesheet = {
  ativo: boolean;
  desde: string;
  horasPorDia: number;
  ativadoEm: string;
  desativadoEm: string | null;
  ausencias: { id: string; de: string; ate: string; motivo: string | null }[];
};

export async function configDaPessoa(userId: string): Promise<ConfigTimesheet | null> {
  const c = await prisma.timesheetAuto.findUnique({ where: { userId } });
  if (!c) return null;
  const aus = await prisma.timesheetAutoAusencia.findMany({ where: { userId }, orderBy: { de: "asc" } });
  return {
    ativo: c.ativo,
    desde: diaDaData(c.desde),
    horasPorDia: c.horasPorDia,
    ativadoEm: c.ativadoEm.toISOString(),
    desativadoEm: c.desativadoEm ? diaSP(c.desativadoEm) : null,
    ausencias: aus.map((a) => ({ id: a.id, de: diaDaData(a.de), ate: diaDaData(a.ate), motivo: a.motivo })),
  };
}

/**
 * As tarefas da pessoa que podem tocar o periodo, no formato do calculo: as que sao dela hoje e as que ja foram (troca de responsavel). Vao tambem as que
 * terminaram pouco antes da ativacao, porque dividiam o dia com as demais.
 */
export async function tarefasParaCalculo(userId: string, desde: string): Promise<TarefaTS[]> {
  const corte = paraDataUtc(somaDias(desde, -DIAS_ANTES_DA_ATIVACAO));
  // sem filtro pela data de criacao do registro: trabalho passado lancado depois (data real retroativa) tem de contar
  const linhas = await prisma.task.findMany({
    where: {
      isEntrega: false,
      AND: [
        { OR: [{ assigneeId: userId }, { responsavelEventos: { some: { OR: [{ deUserId: userId }, { paraUserId: userId }] } } }] },
        { OR: [{ status: { not: "FEITO" } }, { updatedAt: { gte: corte } }, { actualEndedAt: { gte: corte } }] },
      ],
    },
    select: {
      id: true, title: true, projectId: true, status: true, actualStartedAt: true, actualEndedAt: true, horasDedicadas: true, horasDedicadasEm: true, assigneeId: true,
      createdAt: true, updatedAt: true, isEntrega: true,
      project: { select: { name: true, codccu: true } },
      subtasks: { select: { assigneeId: true } },
      statusEventos: { orderBy: { em: "asc" }, select: { em: true, de: true, para: true } },
      responsavelEventos: { orderBy: { em: "asc" }, select: { em: true, deUserId: true, paraUserId: true, horasDoAnterior: true } },
    },
  });
  // o projeto de teste que o sistema cria para quem esta aprendendo nao e' trabalho: nao entra na conta
  return linhas.filter((t) => t.project?.name !== NOME_PROJETO_EXEMPLO).map((t) => ({
    id: t.id,
    titulo: t.title,
    projetoId: t.projectId,
    projetoNome: t.project?.name ?? null,
    codccu: t.project?.codccu ?? null,
    status: t.status as StatusTarefa,
    criadaEm: diaSP(t.createdAt),
    atualizadaEm: diaSP(t.updatedAt),
    actualStartedAt: t.actualStartedAt ? diaSP(t.actualStartedAt) : null,
    actualEndedAt: t.actualEndedAt ? diaSP(t.actualEndedAt) : null,
    // as horas sao de quem as informou: com troca de responsavel cada dono tem as suas
    horasDedicadas: horasDoDono(userId, t.assigneeId, t.horasDedicadas, t.responsavelEventos.map((e) => ({ em: diaSP(e.em), de: e.deUserId, para: e.paraUserId, horasDoAnterior: e.horasDoAnterior }))),
    horasDedicadasEm: t.assigneeId === userId && t.horasDedicadasEm ? diaSP(t.horasDedicadasEm) : null,
    isEntrega: t.isEntrega,
    temSubtarefaDaPessoa: t.subtasks.some((s) => s.assigneeId === userId),
    eventos: t.statusEventos.map((e) => ({ em: diaSP(e.em), de: e.de as StatusTarefa | null, para: e.para as StatusTarefa })),
    mandatos: mandatosDaPessoa(userId, t.responsavelEventos.map((e) => ({ em: diaSP(e.em), de: e.deUserId, para: e.paraUserId }))),
  }));
}

export type Congelados = Record<string, { matriz: CelulaTS[]; metas: Record<string, MetaTarefa> }>;

export async function mesesFechadosDaPessoa(userId: string): Promise<{ congelados: Congelados; fechadoEm: Record<string, string> }> {
  const fs = await prisma.timesheetAutoFechamento.findMany({ where: { userId } });
  const congelados: Congelados = {};
  const fechadoEm: Record<string, string> = {};
  for (const f of fs) {
    const r = f.resultado as unknown as Partial<Relatorio> | null;
    if (r && Array.isArray(r.matriz) && r.metas) congelados[f.competencia] = { matriz: r.matriz, metas: r.metas };
    fechadoEm[f.competencia] = f.fechadoEm.toISOString();
  }
  return { congelados, fechadoEm };
}

/** Periodo pedido na URL: `competencia=AAAA-MM` (mes inteiro) ou `de` + `ate` (qualquer intervalo, ate 366 dias). Sem nada, o mes corrente. */
export function periodoDaRequisicao(sp: URLSearchParams): { de: string; ate: string; competencia: string | null } | { erro: string } {
  const de = sp.get("de");
  const ate = sp.get("ate");
  if (de || ate) {
    if (!de || !ate || !DIA_VALIDO.test(de) || !DIA_VALIDO.test(ate)) return { erro: "Informe o período completo (de e ate, no formato AAAA-MM-DD)" };
    if (ate < de) return { erro: "A data final não pode ser antes da inicial" };
    if (somaDias(de, 366) < ate) return { erro: "O período pode ter no máximo 1 ano" };
    return { de, ate, competencia: null };
  }
  const competencia = sp.get("competencia") ?? competenciaAtual();
  if (!COMPETENCIA_VALIDA.test(competencia)) return { erro: "Competência inválida (use AAAA-MM)" };
  return { de: primeiroDia(competencia), ate: ultimoDia(competencia), competencia };
}

/** Competencias (AAAA-MM) tocadas por um periodo. */
export function mesesDoPeriodo(de: string, ate: string): string[] {
  const out: string[] = [];
  let m = de.slice(0, 7);
  while (m <= ate.slice(0, 7)) {
    out.push(m);
    const [a, mm] = m.split("-").map(Number);
    m = mm === 12 ? `${a + 1}-01` : `${a}-${String(mm + 1).padStart(2, "0")}`;
  }
  return out;
}

export type RespostaPeriodo = { config: ConfigTimesheet; resultado: Relatorio; mesesFechados: string[]; fechadoEm: Record<string, string> };

/**
 * O relatorio de uma pessoa para QUALQUER periodo (mes, semana, intervalo livre; passado ou presente) -- null = ela nunca ativou.
 * Meses fechados valem pela fotografia; o resto e' recalculado na hora, entao corrigir um dado antigo (horas, status, ausencia) ja reflete aqui.
 * `semCongelar` ignora a fotografia de um mes (usado ao fechar/refazer o fechamento).
 */
export async function relatorioDaPessoa(userId: string, de: string, ate: string, opcoes: { semCongelar?: string[] } = {}): Promise<RespostaPeriodo | null> {
  const config = await configDaPessoa(userId);
  if (!config) return null;
  const { congelados, fechadoEm } = await mesesFechadosDaPessoa(userId);
  for (const m of opcoes.semCongelar ?? []) delete congelados[m];
  const hoje = hojeSP();
  // desativou: nada conta depois do dia em que desativou
  const hojeEfetivo = !config.ativo && config.desativadoEm && config.desativadoEm < hoje ? config.desativadoEm : hoje;
  const meses = mesesDoPeriodo(de, ate);
  const tudoFechado = meses.every((m) => congelados[m]);
  const resultado = calcular({
    de,
    ate,
    hoje: hojeEfetivo,
    desde: config.desde,
    inicioOficial: diaSP(new Date(config.ativadoEm)),
    horasPorDia: config.horasPorDia,
    ausencias: config.ausencias.map((a) => ({ de: a.de, ate: a.ate })),
    tarefas: tudoFechado ? [] : await tarefasParaCalculo(userId, config.desde),
    congelados,
  });
  if (!config.ativo) resultado.agora = null;
  return { config, resultado, mesesFechados: meses.filter((m) => congelados[m]), fechadoEm };
}

/**
 * Esforco real (horas) de pessoas por tarefa, pelo MESMO modelo do Timesheet: so' tarefa iniciada, so' enquanto "Fazendo", sem dobrar o dia quando ha
 * tarefas simultaneas. Serve a qualquer tela que precise de "horas gastas" (aba Recursos), tenha a pessoa ativado o Timesheet ou nao.
 */
export type EsforcoDaPessoa = { horasPorTarefa: Map<string, number>; diasPorTarefa: Map<string, number>; semHoras: string[]; informadas: Set<string> };
export async function esforcoPorPessoa(userIds: string[], ate: string = hojeSP()): Promise<Map<string, EsforcoDaPessoa>> {
  const saida = new Map<string, EsforcoDaPessoa>();
  if (!userIds.length) return saida;
  const configs = await prisma.timesheetAuto.findMany({ where: { userId: { in: userIds } } });
  const ausencias = await prisma.timesheetAutoAusencia.findMany({ where: { userId: { in: userIds } } });
  for (const userId of userIds) {
    const cfg = configs.find((c) => c.userId === userId);
    const tarefas = await tarefasParaCalculo(userId, SEM_LIMITE_PASSADO);
    const desde = tarefas.reduce((m, t) => (t.actualStartedAt && t.actualStartedAt < m ? t.actualStartedAt : t.criadaEm < m ? t.criadaEm : m), ate);
    const r = calcular({
      de: desde,
      ate,
      hoje: ate,
      desde,
      inicioOficial: desde,
      horasPorDia: cfg?.horasPorDia ?? 8,
      ausencias: ausencias.filter((a) => a.userId === userId).map((a) => ({ de: diaDaData(a.de), ate: diaDaData(a.ate) })),
      tarefas,
    });
    const horasPorTarefa = new Map<string, number>();
    const dias = new Map<string, Set<string>>();
    for (const c of r.matriz) {
      horasPorTarefa.set(c.t, (horasPorTarefa.get(c.t) ?? 0) + c.h);
      (dias.get(c.t) ?? dias.set(c.t, new Set()).get(c.t)!).add(c.d);
    }
    saida.set(userId, {
      horasPorTarefa,
      diasPorTarefa: new Map([...dias].map(([k, v]) => [k, v.size])),
      semHoras: r.avisos.filter((a) => a.tipo === "SEM_HORAS" && a.tarefaId).map((a) => a.tarefaId as string),
      informadas: new Set(tarefas.filter((t) => t.horasDedicadas !== null).map((t) => t.id)),
    });
  }
  return saida;
}

export type Quem = { id: string; role: string };

/** Quem pode ver o timesheet de `alvoId`: a propria pessoa; Administrador e Acesso Master (todos); quem coordena/gere/dirige a pessoa (equipe dela). */
export async function podeVerTimesheetDe(u: Quem, alvoId: string): Promise<boolean> {
  if (u.id === alvoId) return true;
  if (u.role === "ADMIN" || u.role === "ACESSO_MASTER") return true;
  if (u.role === "CLIENTE" || u.role === "VISUALIZADOR") return false;
  return (await manageablePdiUserIds(u.id)).includes(alvoId);
}

/** Pessoas com timesheet ativo que o usuario pode ver (todas para Admin/Acesso Master; a equipe para quem lidera). */
export async function pessoasVisiveis(u: Quem): Promise<string[]> {
  const todos = u.role === "ADMIN" || u.role === "ACESSO_MASTER";
  const permitidos = todos ? null : await manageablePdiUserIds(u.id);
  const ativas = await prisma.timesheetAuto.findMany({ where: { ativo: true, ...(permitidos ? { userId: { in: permitidos } } : {}) }, select: { userId: true } });
  return ativas.map((a) => a.userId);
}

export async function nomesDosCentros(codccus: string[]): Promise<Record<string, string>> {
  const unicos = Array.from(new Set(codccus.filter(Boolean)));
  if (!unicos.length) return {};
  const cs = await prisma.contrato.findMany({ where: { codccu: { in: unicos } }, select: { codccu: true, nome: true } });
  return Object.fromEntries(cs.map((c) => [c.codccu, c.nome]));
}

/** Projetos da pessoa que ainda estao sem centro de custo (as horas deles nao entram em contrato nenhum). */
export async function tarefasSemCentro(userId: string): Promise<{ projetoId: string; nome: string; tarefas: number }[]> {
  const ts = await prisma.task.findMany({
    where: { assigneeId: userId, status: { not: "FEITO" }, isEntrega: false, projectId: { not: null }, project: { codccu: null } },
    select: { projectId: true, project: { select: { name: true } } },
  });
  const m = new Map<string, { projetoId: string; nome: string; tarefas: number }>();
  for (const t of ts) {
    if (!t.projectId) continue;
    const x = m.get(t.projectId) ?? { projetoId: t.projectId, nome: t.project?.name ?? "Projeto", tarefas: 0 };
    x.tarefas += 1;
    m.set(t.projectId, x);
  }
  return [...m.values()].sort((a, b) => b.tarefas - a.tarefas);
}
