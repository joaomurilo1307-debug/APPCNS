"use client";

import { useMemo, useState } from "react";
import TaskDetailModal from "./TaskDetailModal";
import { buildWbsHierarchy } from "@/lib/wbs";

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
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
  const dayWidth = ZOOM_LEVELS[zoom];
  const labelPx = LABEL_WIDTHS[labelWidth];

  const withDates = useMemo(() => tasks.filter((t) => t.startDate && t.dueDate), [tasks]);

  // A hierarquia (numeração WBS + indentação) precisa vir de TODAS as tarefas, não só as
  // com data — senão subtarefa sem data some da lista inteira, não só perde a barra. A barra
  // em si continua só desenhada pra quem tem início+prazo (ver render abaixo).
  const groups = useMemo(() => {
    if (!groupByProject) return [{ label: null as string | null, rows: buildWbsHierarchy(tasks) }];
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const key = t.groupLabel ?? "Sem projeto";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([label, ts]) => ({ label, rows: buildWbsHierarchy(ts) }));
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

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div style={{ minWidth: totalDays * dayWidth + labelPx }}>
          <div className="flex border-b border-gray-100">
            <div
              style={{ width: labelPx }}
              className="shrink-0 border-r border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500"
            >
              Projeto / Tarefa
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                style={{ width: dayWidth }}
                className="shrink-0 border-r border-gray-50 py-2 text-center text-[10px] text-gray-400"
              >
                {d.getDate()}/{d.getMonth() + 1}
              </div>
            ))}
          </div>
          {groups.map((group) => (
            <div key={group.label ?? "all"}>
              {groupByProject && (
                <div className="flex border-b border-gray-100 bg-gray-50">
                  <div style={{ width: labelPx }} className="shrink-0 px-3 py-2 text-xs font-semibold">
                    {group.label}
                  </div>
                  <div style={{ width: totalDays * dayWidth }} />
                </div>
              )}
              {group.rows.map(({ task: t, depth, wbs }) => {
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
                    </div>
                    <div className="relative" style={{ width: totalDays * dayWidth, height: 32 }}>
                      {hasDates ? (
                        <div
                          onClick={() => setOpenTaskId(t.id)}
                          className={`group absolute top-1.5 h-4 cursor-pointer rounded ${statusColor[t.status]}`}
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
