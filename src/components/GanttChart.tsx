"use client";

import { useMemo, useState } from "react";
import TaskDetailModal from "./TaskDetailModal";

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
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

export default function GanttChart({ tasks, onChanged }: { tasks: Task[]; onChanged?: () => void }) {
  const [zoom, setZoom] = useState<keyof typeof ZOOM_LEVELS>("médio");
  const [labelWidth, setLabelWidth] = useState<keyof typeof LABEL_WIDTHS>("estreita");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const dayWidth = ZOOM_LEVELS[zoom];
  const labelPx = LABEL_WIDTHS[labelWidth];

  const withDates = useMemo(() => tasks.filter((t) => t.startDate && t.dueDate), [tasks]);

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

  if (withDates.length === 0) {
    return <p className="text-sm text-gray-400">Nenhuma tarefa com data de início e prazo definidos ainda.</p>;
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
          {withDates.map((t) => {
            const start = offsetDays(t.startDate!);
            const end = offsetDays(t.dueDate!);
            const width = Math.max(1, end - start + 1) * dayWidth;
            return (
              <div key={t.id} className="flex border-b border-gray-50 hover:bg-gray-50/60">
                <div
                  style={{ width: labelPx }}
                  title={t.title}
                  onClick={() => setOpenTaskId(t.id)}
                  className="shrink-0 cursor-pointer truncate px-3 py-2 text-xs hover:text-brand-dark hover:underline"
                >
                  {t.title}
                </div>
                <div className="relative" style={{ width: totalDays * dayWidth, height: 32 }}>
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
                </div>
              </div>
            );
          })}
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
