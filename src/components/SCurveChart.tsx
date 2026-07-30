"use client";

import { useMemo } from "react";

type Task = {
  id: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  actualEndedAt?: string | null;
};

const W = 760;
const H = 160;
const PAD_L = 34;
const PAD_B = 20;
const PAD_T = 10;

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

// Curva S: % planejado (previsão de entrega acumulada) vs % real (concluído acumulado até hoje).
export default function SCurveChart({ tasks }: { tasks: Task[] }) {
  const scheduled = useMemo(() => tasks.filter((t) => t.startDate && t.dueDate), [tasks]);

  const { rangeStart, rangeEnd, totalDays, points, todayPct, plannedTodayPct } = useMemo(() => {
    if (scheduled.length === 0) {
      return { rangeStart: null as Date | null, rangeEnd: null as Date | null, totalDays: 0, points: [], todayPct: 0, plannedTodayPct: 0 };
    }
    const starts = scheduled.map((t) => new Date(t.startDate!).getTime());
    const ends = scheduled.map((t) => new Date(t.dueDate!).getTime());
    const min = new Date(Math.min(...starts));
    const max = new Date(Math.max(...ends));
    const days = Math.max(1, Math.round((max.getTime() - min.getTime()) / 86400000));
    const today = new Date();
    const total = scheduled.length;

    const pts: { day: number; planned: number; real: number | null }[] = [];
    for (let d = 0; d <= days; d++) {
      const cursor = new Date(min);
      cursor.setDate(min.getDate() + d);
      const plannedDone = scheduled.filter((t) => new Date(t.dueDate!).getTime() <= cursor.getTime()).length;
      const isPast = cursor.getTime() <= today.getTime();
      const realDone = isPast
        ? scheduled.filter((t) => t.status === "FEITO" && t.actualEndedAt && new Date(t.actualEndedAt).getTime() <= cursor.getTime()).length
        : null;
      pts.push({
        day: d,
        planned: Math.round((plannedDone / total) * 100),
        real: realDone === null ? null : Math.round((realDone / total) * 100),
      });
    }
    const doneNow = scheduled.filter((t) => t.status === "FEITO").length;
    const nowOffset = Math.max(0, Math.min(days, Math.round((today.getTime() - min.getTime()) / 86400000)));
    return {
      rangeStart: min,
      rangeEnd: max,
      totalDays: days,
      points: pts,
      todayPct: Math.round((doneNow / total) * 100),
      plannedTodayPct: pts[nowOffset]?.planned ?? 0,
    };
  }, [scheduled]);

  if (!rangeStart || !rangeEnd || totalDays === 0) {
    return <p className="text-xs text-gray-400">Sem tarefas com data suficientes para desenhar a curva de acompanhamento.</p>;
  }

  const xFor = (day: number) => PAD_L + (day / totalDays) * (W - PAD_L - 10);
  const yFor = (pct: number) => PAD_T + (1 - pct / 100) * (H - PAD_T - PAD_B);

  const plannedPath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.day)} ${yFor(p.planned)}`).join(" ");
  const realPoints = points.filter((p) => p.real !== null);
  const realPath = realPoints.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(p.day)} ${yFor(p.real!)}`).join(" ");

  const delta = todayPct - plannedTodayPct;
  const gridLines = [0, 25, 50, 75, 100];
  const dateTicks = [0, Math.round(totalDays / 2), totalDays];

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-gray-600">📈 Curva de acompanhamento (planejado × real)</p>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
            delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-600"
          }`}
        >
          {delta >= 0 ? `🟢 ${delta}pp adiantado` : `🔴 ${Math.abs(delta)}pp atrasado`} · {todayPct}% concluído hoje
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
        {gridLines.map((g) => (
          <g key={g}>
            <line x1={PAD_L} x2={W - 10} y1={yFor(g)} y2={yFor(g)} stroke="#f1f5f9" strokeWidth={1} />
            <text x={PAD_L - 6} y={yFor(g) + 3} textAnchor="end" fontSize={9} fill="#9ca3af">
              {g}%
            </text>
          </g>
        ))}
        {dateTicks.map((d) => {
          const dt = new Date(rangeStart);
          dt.setDate(rangeStart.getDate() + d);
          return (
            <text key={d} x={xFor(d)} y={H - 4} textAnchor="middle" fontSize={9} fill="#9ca3af">
              {fmtDate(dt)}
            </text>
          );
        })}
        <path d={plannedPath} fill="none" stroke="#93c5fd" strokeWidth={2} strokeDasharray="4 3" />
        {realPath && <path d={realPath} fill="none" stroke="#059669" strokeWidth={2.5} />}
        {realPoints.length > 0 && (
          <circle cx={xFor(realPoints[realPoints.length - 1].day)} cy={yFor(realPoints[realPoints.length - 1].real!)} r={3.5} fill="#059669" />
        )}
      </svg>
      <div className="mt-1 flex items-center gap-4 text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 border-t-2 border-dashed border-blue-300" /> Planejado</span>
        <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-emerald-600" /> Real</span>
      </div>
    </div>
  );
}
