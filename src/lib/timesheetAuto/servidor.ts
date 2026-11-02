// Camada de banco do timesheet automatico: monta a entrada do calculo (src/lib/timesheetAuto/calculo.ts, pura) a partir das tarefas da pessoa, aplica o
// fechamento do mes e decide quem pode ver o timesheet de quem.

import { prisma } from "@/lib/prisma";
import { manageablePdiUserIds } from "@/lib/permissions";
import { calcularMes, diaSP, primeiroDia, ultimoDia, somaDias, type EntradaCalculo, type ResultadoMes, type StatusTarefa, type TarefaTS } from "./calculo";

export const COMPETENCIA_VALIDA = /^\d{4}-(0[1-9]|1[0-2])$/;
export const DIA_VALIDO = /^\d{4}-\d{2}-\d{2}$/;
export const hojeSP = () => diaSP(new Date());
export const competenciaAtual = () => hojeSP().slice(0, 7);
/** Campo so' de data (inicio/prazo da tarefa) fica gravado em meia-noite UTC: o dia e' o da data UTC. */
const diaDaData = (d: Date) => d.toISOString().slice(0, 10);
const paraDataUtc = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

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

/** As tarefas da pessoa que podem tocar o mes, no formato do calculo. */
export async function tarefasParaCalculo(userId: string, competencia: string): Promise<TarefaTS[]> {
  const inicio = paraDataUtc(primeiroDia(competencia));
  const depoisDoFim = paraDataUtc(somaDias(ultimoDia(competencia), 2));
  const linhas = await prisma.task.findMany({
    where: {
      assigneeId: userId,
      isEntrega: false,
      createdAt: { lt: depoisDoFim },
      OR: [{ status: { not: "FEITO" } }, { updatedAt: { gte: inicio } }, { dueDate: { gte: inicio } }, { actualEndedAt: { gte: inicio } }],
    },
    select: {
      id: true, title: true, projectId: true, status: true, startDate: true, dueDate: true, durationDays: true, actualStartedAt: true, actualEndedAt: true,
      createdAt: true, updatedAt: true, isEntrega: true,
      project: { select: { name: true, codccu: true } },
      subtasks: { select: { assigneeId: true } },
      statusEventos: { orderBy: { em: "asc" }, select: { em: true, de: true, para: true } },
    },
  });
  return linhas.map((t) => ({
    id: t.id,
    titulo: t.title,
    projetoId: t.projectId,
    projetoNome: t.project?.name ?? null,
    codccu: t.project?.codccu ?? null,
    status: t.status as StatusTarefa,
    startDate: t.startDate ? diaDaData(t.startDate) : null,
    dueDate: t.dueDate ? diaDaData(t.dueDate) : null,
    durationDays: t.durationDays,
    actualStartedAt: t.actualStartedAt ? diaSP(t.actualStartedAt) : null,
    actualEndedAt: t.actualEndedAt ? diaSP(t.actualEndedAt) : null,
    criadaEm: diaSP(t.createdAt),
    atualizadaEm: diaSP(t.updatedAt),
    isEntrega: t.isEntrega,
    temSubtarefaDaPessoa: t.subtasks.some((s) => s.assigneeId === userId),
    eventos: t.statusEventos.map((e) => ({ em: diaSP(e.em), de: e.de as StatusTarefa | null, para: e.para as StatusTarefa })),
  }));
}

export type RespostaMes = { config: ConfigTimesheet; resultado: ResultadoMes; fechado: boolean; fechadoEm: string | null };

/** O relatorio do mes de uma pessoa (null = ela nunca ativou). Mes fechado devolve a fotografia gravada. */
export async function relatorioDaPessoa(userId: string, competencia: string): Promise<RespostaMes | null> {
  const config = await configDaPessoa(userId);
  if (!config) return null;
  const fechamento = await prisma.timesheetAutoFechamento.findUnique({ where: { userId_competencia: { userId, competencia } } });
  if (fechamento) return { config, resultado: fechamento.resultado as unknown as ResultadoMes, fechado: true, fechadoEm: fechamento.fechadoEm.toISOString() };
  const hoje = hojeSP();
  // desativou: nada conta depois do dia em que desativou
  const hojeEfetivo = !config.ativo && config.desativadoEm && config.desativadoEm < hoje ? config.desativadoEm : hoje;
  const entrada: EntradaCalculo = {
    competencia,
    hoje: hojeEfetivo,
    desde: config.desde,
    horasPorDia: config.horasPorDia,
    ausencias: config.ausencias.map((a) => ({ de: a.de, ate: a.ate })),
    tarefas: await tarefasParaCalculo(userId, competencia),
  };
  return { config, resultado: calcularMes(entrada), fechado: false, fechadoEm: null };
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

/** Aviso para o projeto novo: quem usa o timesheet precisa ligar o projeto a um centro de custo (senao as horas dele nao entram em nenhum). */
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
