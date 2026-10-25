"use client";

import { useMemo, useState } from "react";
import TaskDetailModal from "./TaskDetailModal";
import { buildWbsHierarchy } from "@/lib/wbs";
import { resumirGrupo, type ResumoGrupo } from "@/lib/ganttResumo";

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  isEntrega?: boolean;
  groupLabel?: string | null;
  parentTaskId?: string | null;
};

const statusColor: Record<string, string> = {
  A_FAZER: "bg-gray-400",
  FAZENDO: "bg-blue-500",
  BLOQUEADO: "bg-red-500",
  FEITO: "bg-green-500",
};

const statusLabel: Record<string, string> = {
  A_FAZER: "A fazer",
  FAZENDO: "Fazendo",
  BLOQUEADO: "Bloqueado",
  FEITO: "Feito",
};

const ZOOM_LEVELS = { compacto: 18, médio: 28, largo: 44 } as const;
const LABEL_WIDTHS = { estreita: 200, larga: 320 } as const;
const MONTH_ROW_H = 20;
const MONTH_NAMES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

export default function GanttChart({
  tasks,
  onChanged,
  groupByProject,
}: {
  tasks: Task[];
  onChanged?: () => void;
  groupByProject?: boolean;
}) {
  const [zoom, setZoom] = useState<keyof typeof ZOOM_LEVELS>("médio");
  const [labelWidth, setLabelWidth] = useState<keyof typeof LABEL_WIDTHS>("estreita");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  // Gantt geral (todos os projetos): cada projeto e' um bloco que abre e fecha; comeca recolhido para nao ficar tudo embolado
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const dayWidth = ZOOM_LEVELS[zoom];
  const labelPx = LABEL_WIDTHS[labelWidth];

  const withDates = useMemo(() => tasks.filter((t) => t.startDate && t.dueDate), [tasks]);

  // A hierarquia (numeração WBS + indentação) precisa vir de TODAS as tarefas, não só as
  // com data — senão subtarefa sem data some da lista inteira, não só perde a barra. A barra
  // em si continua só desenhada pra quem tem início+prazo (ver render abaixo).
  const groups = useMemo(() => {
    if (!groupByProject) return [{ label: null as string | null, rows: buildWbsHierarchy(tasks), resumo: null as ResumoGrupo | null }];
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const key = t.groupLabel ?? "Sem projeto";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([label, ts]) => ({ label: label as string | null, rows: buildWbsHierarchy(ts), resumo: resumirGrupo(ts) as ResumoGrupo | null }));
  }, [tasks, groupByProject]);

  const { rangeStart, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    withDates.forEach((t) => {
      if (t.startDate) allDates.push(new Date(t.startDate));
      if (t.dueDate) allDates.push(new Date(t.dueDate));
    });
    if (allDates.length === 0) {
      const today = new Date();
      return { rangeStart: today, totalDays: 30 };
    }
    const min = new Date(Math.min(...allDates.map((d) => d.getTime())));
    const max = new Date(Math.max(...allDates.map((d) => d.getTime())));
    const days = Math.max(14, Math.ceil((max.getTime() - min.getTime()) / 86400000) + 4);
    min.setDate(min.getDate() - 2);
    return { rangeStart: min, totalDays: days };
  }, [withDates]);

  function offsetDays(dateStr: string) {
    return Math.round((new Date(dateStr).getTime() - rangeStart.getTime()) / 86400000);
  }

  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(rangeStart);
    d.setDate(rangeStart.getDate() + i);
    return d;
  });

  // Cabeçalho em 2 linhas (mês + dia) — evita "25/7" ficar mais largo que a coluna e
  // sobrepor o vizinho quando o zoom é compacto.
  const monthGroups: { label: string; count: number }[] = [];
  for (const d of days) {
    const label = `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
    const last = monthGroups[monthGroups.length - 1];
    if (last && last.label === label) last.count += 1;
    else monthGroups.push({ label, count: 1 });
  }

  const alternar = (label: string) => setAbertos((s) => { const n = new Set(s); if (n.has(label)) n.delete(label); else n.add(label); return n; });
  const nomesDosGrupos = groups.map((g) => g.label).filter((l): l is string => !!l);
  const hojeOff = offsetDays(new Date().toISOString());
  const totalRows = groups.reduce((sum, g) => sum + g.rows.length, 0);
  if (totalRows === 0) {
    return <p className="text-sm text-gray-400">Nenhuma tarefa neste projeto ainda.</p>;
  }

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <div className="flex items-center gap-1">
          <span>Zoom:</span>
          {(Object.keys(ZOOM_LEVELS) as (keyof typeof ZOOM_LEVELS)[]).map((z) => (
            <button
              key={z}
              onClick={() => setZoom(z)}
              className={`rounded-md border px-2 py-1 capitalize ${zoom === z ? "border-brand bg-brand text-white" : "border-gray-300 hover:bg-gray-50"}`}
            >
              {z}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          <span>Nome da tarefa:</span>
          {(Object.keys(LABEL_WIDTHS) as (keyof typeof LABEL_WIDTHS)[]).map((w) => (
            <button
              key={w}
              onClick={() => setLabelWidth(w)}
              className={`rounded-md border px-2 py-1 capitalize ${labelWidth === w ? "border-brand bg-brand text-white" : "border-gray-300 hover:bg-gray-50"}`}
            >
              {w}
            </button>
          ))}
        </div>
      </div>

      {groupByProject && (
        <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
          <button onClick={() => setAbertos(new Set(nomesDosGrupos))} className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-50">Expandir todos os projetos</button>
          <button onClick={() => setAbertos(new Set())} className="rounded-md border border-gray-300 px-2 py-1 hover:bg-gray-50">Recolher todos</button>
          <span className="text-gray-400">{nomesDosGrupos.length} projeto(s). Clique no nome do projeto para abrir as tarefas dele.</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white [scrollbar-width:auto] [&::-webkit-scrollbar]:h-3 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-gray-300 [&::-webkit-scrollbar-thumb]:hover:bg-gray-400 [&::-webkit-scrollbar-track]:bg-gray-100">
        <div style={{ minWidth: totalDays * dayWidth + labelPx }}>
          <div className="flex border-b border-gray-100" style={{ height: MONTH_ROW_H + 32 }}>
            <div
              style={{ width: labelPx, height: MONTH_ROW_H + 32 }}
              className="flex shrink-0 items-end border-r border-gray-100 px-3 pb-2 text-xs font-semibold text-gray-500"
            >
              Projeto / Tarefa
            </div>
            <div className="flex flex-col">
              <div className="flex" style={{ height: MONTH_ROW_H }}>
                {monthGroups.map((g, i) => (
                  <div
                    key={i}
                    style={{ width: g.count * dayWidth }}
                    className="shrink-0 truncate border-b border-r border-gray-100 px-1.5 text-center text-[10px] font-semibold capitalize text-gray-500"
                  >
                    {g.label}
                  </div>
                ))}
              </div>
              <div className="flex" style={{ height: 32 }}>
                {days.map((d, i) => (
                  <div
                    key={i}
                    style={{ width: dayWidth }}
                    className="shrink-0 border-r border-gray-50 py-2 text-center text-[10px] text-gray-400"
                  >
                    {d.getDate()}
                  </div>
                ))}
              </div>
            </div>
          </div>
          {groups.map((group) => (
            <div key={group.label ?? "all"}>
              {groupByProject && group.label && (
                <div className="flex cursor-pointer border-b border-gray-200 bg-gray-50 hover:bg-gray-100/80" onClick={() => alternar(group.label!)} role="button" aria-expanded={abertos.has(group.label)}>
                  <div style={{ width: labelPx }} className="flex shrink-0 items-start gap-1.5 px-3 py-2 text-xs">
                    <span className="mt-0.5 inline-block w-3 text-gray-400">{abertos.has(group.label) ? "▾" : "▸"}</span>
                    <div className="min-w-0">
                      <div className="truncate font-semibold" title={group.label}>{group.label}</div>
                      {group.resumo && (
                        <div className="truncate text-[11px] text-gray-500">
                          {group.resumo.pct}% · {group.resumo.feitas}/{group.resumo.total} tarefas
                          {group.resumo.atrasadas > 0 && <b className="ml-1 text-rose-600">· {group.resumo.atrasadas} atrasada(s)</b>}
                          {!group.resumo.inicio && <span className="ml-1 text-gray-400">· sem datas</span>}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="relative" style={{ width: totalDays * dayWidth, minHeight: 44 }}>
                    {hojeOff >= 0 && hojeOff < totalDays && <div className="pointer-events-none absolute top-0 h-full w-px bg-rose-400/60" style={{ left: hojeOff * dayWidth + dayWidth / 2 }} title="Hoje" />}
                    {group.resumo && group.resumo.inicio && group.resumo.fim && (
                      <div
                        className="absolute top-3.5 h-4 overflow-hidden rounded bg-slate-300"
                        title={`${group.resumo.pct}% concluído`}
                        style={{ left: offsetDays(group.resumo.inicio) * dayWidth, width: Math.max(1, offsetDays(group.resumo.fim) - offsetDays(group.resumo.inicio) + 1) * dayWidth }}
                      >
                        <div className="h-full bg-emerald-500" style={{ width: `${group.resumo.pct}%` }} />
                      </div>
                    )}
                  </div>
                </div>
              )}
              {(!groupByProject || (group.label && abertos.has(group.label))) && group.rows.map(({ task: t, depth, wbs }) => {
                const hasDates = !!(t.startDate && t.dueDate);
                const start = hasDates ? offsetDays(t.startDate!) : 0;
                const end = hasDates ? offsetDays(t.dueDate!) : 0;
                const width = Math.max(1, end - start + 1) * dayWidth;
                return (
                  <div key={t.id} className="flex border-b border-gray-50 hover:bg-gray-50/60">
                    <div
                      style={{ width: labelPx, paddingLeft: 12 + depth * 16 }}
                      title={t.title}
                      onClick={() => setOpenTaskId(t.id)}
                      className="flex shrink-0 cursor-pointer items-center gap-1.5 truncate py-2 pr-2 text-xs hover:text-brand-dark hover:underline"
                    >
                      <span className="shrink-0 font-mono text-[10px] text-gray-400">{wbs}</span>
                      {depth > 0 && <span className="shrink-0 text-gray-300">↳</span>}
                      <span className="truncate">{t.title}</span>
                      {t.isEntrega && <span className="shrink-0" title="Entrega">🏁</span>}
                    </div>
                    <div className="relative" style={{ width: totalDays * dayWidth, height: 32 }}>
                      {hojeOff >= 0 && hojeOff < totalDays && <div className="pointer-events-none absolute top-0 h-full w-px bg-rose-400/60" style={{ left: hojeOff * dayWidth + dayWidth / 2 }} title="Hoje" />}
                      {hasDates ? (
                        <div
                          onClick={() => setOpenTaskId(t.id)}
                          className={`group absolute top-1.5 h-4 cursor-pointer rounded ${t.isEntrega ? "bg-violet-500" : statusColor[t.status]}`}
                          style={{ left: start * dayWidth, width }}
                        >
                          <div className="pointer-events-none absolute -top-9 left-0 z-10 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                            <span className="font-medium">{t.title}</span>
                            <span className="ml-1 text-gray-300">
                              · {fmtDate(new Date(t.startDate!))} – {fmtDate(new Date(t.dueDate!))} · {statusLabel[t.status]}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <span
                          onClick={() => setOpenTaskId(t.id)}
                          className="absolute top-2 cursor-pointer text-[10px] text-gray-300 hover:text-gray-400"
                          style={{ left: 4 }}
                        >
                          sem data
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onChanged={() => onChanged?.()}
        />
      )}
    </div>
  );
}
