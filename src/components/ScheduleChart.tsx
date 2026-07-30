"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import TaskDetailModal from "./TaskDetailModal";
import { computeCPM, type DependencyType } from "@/lib/cpm";
import { buildWbsHierarchy } from "@/lib/wbs";

type DependencyLink = {
  id: string;
  predecessorId: string;
  type: DependencyType;
  lagDays: number;
  predecessor: { id: string; title: string };
};

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  actualStartedAt?: string | null;
  actualEndedAt?: string | null;
  status: string;
  parentTaskId?: string | null;
  predecessorLinks?: DependencyLink[];
};

const statusLabel: Record<string, string> = {
  A_FAZER: "A fazer",
  FAZENDO: "Fazendo",
  BLOQUEADO: "Bloqueado",
  FEITO: "Feito",
};

const dependencyTypeLabel: Record<DependencyType, string> = {
  FS: "Término → Início",
  SS: "Início → Início",
  FF: "Término → Término",
  SF: "Início → Término",
};

const ZOOM_LEVELS = { compacto: 16, médio: 26, largo: 42 } as const;
const NAME_WIDTHS = { estreita: 200, larga: 320 } as const;
const ROW_H = 36;
const WBS_W = 40;
const DUR_W = 58;
const START_W = 92;
const END_W = 92;
const REAL_W = 118;
const PCT_W = 48;
const FLOAT_W = 60;
const PRED_W = 92;

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}
function toDateInput(iso: string | null | undefined) {
  return iso ? iso.slice(0, 10) : "";
}
function addDays(iso: string, days: number) {
  const d = new Date(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString();
}
function durationOf(t: Task) {
  if (!t.startDate || !t.dueDate) return null;
  return Math.max(0, Math.round((new Date(t.dueDate).getTime() - new Date(t.startDate).getTime()) / 86400000));
}
function percentComplete(t: Task) {
  if (t.status === "FEITO") return 100;
  if (t.status === "FAZENDO" && (t.actualStartedAt || t.startDate) && t.dueDate) {
    const start = new Date(t.actualStartedAt ?? t.startDate!).getTime();
    const end = new Date(t.dueDate).getTime();
    const planned = Math.max(1, end - start);
    const elapsed = Math.max(0, Date.now() - start);
    return Math.min(95, Math.max(5, Math.round((elapsed / planned) * 100)));
  }
  return 0;
}

export default function ScheduleChart({
  tasks,
  onChanged,
  canManage,
}: {
  tasks: Task[];
  onChanged?: () => void;
  canManage?: boolean;
}) {
  const [zoom, setZoom] = useState<keyof typeof ZOOM_LEVELS>("médio");
  const [nameWidth, setNameWidth] = useState<keyof typeof NAME_WIDTHS>("estreita");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [depPanelFor, setDepPanelFor] = useState<string | null>(null);
  const [newPredId, setNewPredId] = useState("");
  const [newType, setNewType] = useState<DependencyType>("FS");
  const [newLag, setNewLag] = useState("0");
  const [savingDep, setSavingDep] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);
  const [drag, setDrag] = useState<{ taskId: string; mode: "move" | "resize"; startClientX: number; deltaDays: number } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const draggedRef = useRef(false);

  const dayWidth = ZOOM_LEVELS[zoom];
  const namePx = NAME_WIDTHS[nameWidth];
  const TABLE_W = WBS_W + namePx + DUR_W + START_W + END_W + REAL_W + PCT_W + FLOAT_W + PRED_W;

  const withDates = useMemo(() => tasks.filter((t) => t.startDate && t.dueDate), [tasks]);

  const allDependencies = useMemo(() => {
    const list: { predecessorId: string; successorId: string; type: DependencyType; lagDays: number }[] = [];
    for (const t of tasks) {
      for (const link of t.predecessorLinks ?? []) {
        list.push({ predecessorId: link.predecessorId, successorId: t.id, type: link.type, lagDays: link.lagDays });
      }
    }
    return list;
  }, [tasks]);

  const cpm = useMemo(() => computeCPM(withDates, allDependencies), [withDates, allDependencies]);

  const rows = useMemo(() => buildWbsHierarchy(tasks), [tasks]);
  const wbsById = useMemo(() => new Map(rows.map((r) => [r.task.id, r.wbs])), [rows]);
  const byId = useMemo(() => new Map(tasks.map((t) => [t.id, t])), [tasks]);

  const { rangeStart, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    withDates.forEach((t) => {
      if (t.startDate) allDates.push(new Date(t.startDate));
      if (t.dueDate) allDates.push(new Date(t.dueDate));
      if (t.actualStartedAt) allDates.push(new Date(t.actualStartedAt));
      if (t.actualEndedAt) allDates.push(new Date(t.actualEndedAt));
    });
    allDates.push(new Date());
    if (allDates.length === 1) {
      return { rangeStart: new Date(), totalDays: 30 };
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
  const todayOffset = offsetDays(new Date().toISOString());

  const rowIndex = new Map<string, number>();
  rows.forEach((r, i) => rowIndex.set(r.task.id, i));

  function toggleDepPanel(taskId: string) {
    setDepPanelFor((prev) => (prev === taskId ? null : taskId));
    setNewPredId("");
    setNewType("FS");
    setNewLag("0");
    setDepError(null);
  }

  async function patchTask(taskId: string, data: any) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    onChanged?.();
  }

  function handleStartChange(t: Task, value: string) {
    if (!value) return;
    const newStartIso = new Date(value + "T00:00:00.000Z").toISOString();
    const dur = durationOf(t) ?? 1;
    patchTask(t.id, { startDate: newStartIso, dueDate: addDays(newStartIso, dur) });
  }

  function handleDurationChange(t: Task, value: string) {
    if (!t.startDate) return;
    const dur = Math.max(0, parseInt(value, 10) || 0);
    patchTask(t.id, { dueDate: addDays(t.startDate, dur) });
  }

  // Arrastar a barra do Gantt pra mudar a duração (borda direita) ou mover a tarefa inteira
  // (corpo da barra) — a manipulação direta que Project/Primavera têm e a tabela sozinha não dá.
  function handleBarPointerDown(e: React.PointerEvent, t: Task, mode: "move" | "resize") {
    if (!canManage || !t.startDate || !t.dueDate) return;
    e.preventDefault();
    e.stopPropagation();
    draggedRef.current = false;
    setDrag({ taskId: t.id, mode, startClientX: e.clientX, deltaDays: 0 });
  }

  useEffect(() => {
    if (!drag) return;
    function onMove(e: PointerEvent) {
      const current = dragRef.current;
      if (!current) return;
      const deltaDays = Math.round((e.clientX - current.startClientX) / dayWidth);
      if (deltaDays !== current.deltaDays) {
        if (deltaDays !== 0) draggedRef.current = true;
        setDrag({ ...current, deltaDays });
      }
    }
    function onUp() {
      const current = dragRef.current;
      setDrag(null);
      if (!current || current.deltaDays === 0) return;
      const t = byId.get(current.taskId);
      if (!t || !t.startDate || !t.dueDate) return;
      if (current.mode === "resize") {
        const dur = Math.max(0, (durationOf(t) ?? 0) + current.deltaDays);
        patchTask(t.id, { dueDate: addDays(t.startDate, dur) });
      } else {
        patchTask(t.id, { startDate: addDays(t.startDate, current.deltaDays), dueDate: addDays(t.dueDate, current.deltaDays) });
      }
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!drag, dayWidth]);

  async function handleAddDependency(successorId: string) {
    if (!newPredId) return;
    setSavingDep(true);
    setDepError(null);
    const res = await fetch(`/api/tasks/${successorId}/dependencies`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ predecessorId: newPredId, type: newType, lagDays: Number(newLag) || 0 }),
    });
    setSavingDep(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setDepError(typeof data?.error === "string" ? data.error : "Não foi possível criar a dependência.");
      return;
    }
    setNewPredId("");
    setNewLag("0");
    onChanged?.();
  }

  async function handleRemoveDependency(dependencyId: string) {
    await fetch(`/api/task-dependencies/${dependencyId}`, { method: "DELETE" });
    onChanged?.();
  }

  if (rows.length === 0) {
    return <p className="text-sm text-gray-400">Nenhuma tarefa neste projeto ainda.</p>;
  }

  const criticalCount = Array.from(cpm.results.values()).filter((r) => r.isCritical).length;
  const conflictCount = Array.from(cpm.results.values()).filter((r) => r.hasConflict).length;

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-gray-500">
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
          <span>Nome:</span>
          {(Object.keys(NAME_WIDTHS) as (keyof typeof NAME_WIDTHS)[]).map((w) => (
            <button
              key={w}
              onClick={() => setNameWidth(w)}
              className={`rounded-md border px-2 py-1 capitalize ${nameWidth === w ? "border-brand bg-brand text-white" : "border-gray-300 hover:bg-gray-50"}`}
            >
              {w}
            </button>
          ))}
        </div>
        {cpm.hasCycle ? (
          <span className="rounded-full bg-rose-100 px-2.5 py-1 font-medium text-rose-700">
            ⚠️ Ciclo de dependências detectado — caminho crítico não pôde ser calculado
          </span>
        ) : (
          <>
            <span className="rounded-full bg-brand/10 px-2.5 py-1 font-medium text-brand">⏱️ Caminho crítico: {cpm.projectDurationDays} dia(s)</span>
            <span className="rounded-full bg-rose-50 px-2.5 py-1 font-medium text-rose-600">🔴 {criticalCount} tarefa(s) crítica(s)</span>
            {conflictCount > 0 && (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 font-medium text-amber-700">
                ⚠️ {conflictCount} conflito(s) de dependência
              </span>
            )}
          </>
        )}
        {canManage && <span className="text-gray-400">Arraste a barra pra mover · segure a borda direita pra mudar a duração</span>}
      </div>

      <div className="overflow-auto rounded-xl border border-gray-200 bg-white" style={{ maxHeight: "72vh" }}>
        <div style={{ width: TABLE_W + totalDays * dayWidth }}>
          {/* cabeçalho */}
          <div className="flex" style={{ height: ROW_H }}>
            <div
              className="sticky left-0 top-0 z-30 flex shrink-0 items-center border-b border-r border-gray-200 bg-gray-50 text-[10px] font-semibold uppercase tracking-wide text-gray-500"
              style={{ width: TABLE_W }}
            >
              <div style={{ width: WBS_W }} className="px-1.5 text-center">#</div>
              <div style={{ width: namePx }} className="px-2">Tarefa</div>
              <div style={{ width: DUR_W }} className="px-1.5 text-center">Dur.</div>
              <div style={{ width: START_W }} className="px-1.5 text-center">Início prev.</div>
              <div style={{ width: END_W }} className="px-1.5 text-center">Término prev.</div>
              <div style={{ width: REAL_W }} className="px-1.5 text-center">Execução real</div>
              <div style={{ width: PCT_W }} className="px-1.5 text-center">%</div>
              <div style={{ width: FLOAT_W }} className="px-1.5 text-center">Folga</div>
              <div style={{ width: PRED_W }} className="px-1.5 text-center">Predec.</div>
            </div>
            <div className="sticky top-0 z-20 flex shrink-0 border-b border-gray-200 bg-gray-50">
              {days.map((d, i) => {
                const isToday = i === todayOffset;
                const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                return (
                  <div
                    key={i}
                    style={{ width: dayWidth }}
                    className={`shrink-0 border-r border-gray-100 py-2 text-center text-[10px] ${
                      isToday ? "bg-brand/10 font-semibold text-brand-dark" : isWeekend ? "bg-gray-100/70 text-gray-300" : "text-gray-400"
                    }`}
                  >
                    {d.getDate()}/{d.getMonth() + 1}
                  </div>
                );
              })}
            </div>
          </div>

          {/* corpo */}
          <div className="relative">
            <svg
              className="pointer-events-none absolute left-0 top-0 z-0"
              width={totalDays * dayWidth}
              height={rows.length * ROW_H}
              style={{ marginLeft: TABLE_W }}
            >
              <defs>
                <marker id="sched-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                </marker>
                <marker id="sched-arrow-crit" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#e11d48" />
                </marker>
              </defs>
              {/* linha de "hoje" */}
              <line
                x1={todayOffset * dayWidth}
                x2={todayOffset * dayWidth}
                y1={0}
                y2={rows.length * ROW_H}
                stroke="#6366f1"
                strokeWidth={1.5}
                strokeDasharray="4 3"
                opacity={0.5}
              />
              {rows.map(({ task: t }) =>
                (t.predecessorLinks ?? []).map((link) => {
                  const pred = byId.get(link.predecessorId);
                  if (!pred || !pred.startDate || !pred.dueDate || !t.startDate || !t.dueDate) return null;
                  const predRow = rowIndex.get(pred.id);
                  const succRow = rowIndex.get(t.id);
                  if (predRow === undefined || succRow === undefined) return null;
                  const predResult = cpm.results.get(pred.id);
                  const succResult = cpm.results.get(t.id);
                  const isCritEdge = !cpm.hasCycle && predResult?.isCritical && succResult?.isCritical;
                  const x1 = offsetDays(pred.dueDate) * dayWidth + dayWidth;
                  const y1 = predRow * ROW_H + ROW_H / 2;
                  const x2 = offsetDays(t.startDate) * dayWidth;
                  const y2 = succRow * ROW_H + ROW_H / 2;
                  const midX = (x1 + x2) / 2;
                  return (
                    <path
                      key={link.id}
                      d={`M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`}
                      stroke={isCritEdge ? "#e11d48" : "#94a3b8"}
                      strokeWidth={isCritEdge ? 2 : 1.5}
                      fill="none"
                      markerEnd={isCritEdge ? "url(#sched-arrow-crit)" : "url(#sched-arrow)"}
                      opacity={isCritEdge ? 0.85 : 0.55}
                    />
                  );
                })
              )}
            </svg>

            {rows.map(({ task: t, depth, wbs }) => {
              const hasDates = !!(t.startDate && t.dueDate);
              const dur = durationOf(t);
              const result = cpm.results.get(t.id);
              const isCritical = !!result?.isCritical && !cpm.hasCycle;
              const hasConflict = !!result?.hasConflict && !cpm.hasCycle;
              const pct = percentComplete(t);
              const isMilestone = hasDates && dur === 0;
              const predText = (t.predecessorLinks ?? [])
                .map((l) => wbsById.get(l.predecessorId) ?? "?")
                .join(", ");

              const isDragging = drag?.taskId === t.id;
              let start = 0;
              let width = 0;
              if (hasDates) {
                start = offsetDays(t.startDate!);
                const end = offsetDays(t.dueDate!);
                width = Math.max(1, end - start + 1) * dayWidth;
                if (isDragging && drag.mode === "move") {
                  start += drag.deltaDays;
                } else if (isDragging && drag.mode === "resize") {
                  width = Math.max(dayWidth, width + drag.deltaDays * dayWidth);
                }
              }
              const actualStart = t.actualStartedAt ? offsetDays(t.actualStartedAt) : null;
              const actualEnd = t.actualEndedAt ? offsetDays(t.actualEndedAt) : t.actualStartedAt ? offsetDays(new Date().toISOString()) : null;

              return (
                <div key={t.id} className="group relative flex border-b border-gray-50" style={{ height: ROW_H }}>
                  <div
                    className="sticky left-0 z-10 flex shrink-0 items-center border-r border-gray-200 bg-white text-[11px] group-hover:bg-gray-50/80"
                    style={{ width: TABLE_W }}
                  >
                    <div style={{ width: WBS_W }} className="shrink-0 truncate px-1.5 text-center font-mono text-[10px] text-gray-400">
                      {wbs}
                    </div>
                    <div style={{ width: namePx, paddingLeft: 6 + depth * 14 }} className="flex shrink-0 items-center gap-1 truncate pr-1">
                      {depth > 0 && <span className="shrink-0 text-gray-300">↳</span>}
                      <span title={t.title} onClick={() => setOpenTaskId(t.id)} className="cursor-pointer truncate hover:text-brand-dark hover:underline">
                        {t.title}
                      </span>
                      {isCritical && <span className="shrink-0" title="No caminho crítico (folga zero)">🔴</span>}
                      {hasConflict && <span className="shrink-0" title="Conflito: início planejado antes do permitido pela rede">⚠️</span>}
                    </div>
                    <div style={{ width: DUR_W }} className="shrink-0 px-1">
                      <input
                        type="number"
                        min={0}
                        disabled={!canManage || !t.startDate}
                        defaultValue={dur ?? ""}
                        onBlur={(e) => e.target.value !== "" && handleDurationChange(t, e.target.value)}
                        title={t.startDate ? "Duração em dias — preenche o término automaticamente" : "Defina o início primeiro"}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-center hover:border-gray-200 focus:border-brand disabled:text-gray-300"
                      />
                    </div>
                    <div style={{ width: START_W }} className="shrink-0 px-1">
                      <input
                        type="date"
                        disabled={!canManage}
                        defaultValue={toDateInput(t.startDate)}
                        onBlur={(e) => handleStartChange(t, e.target.value)}
                        className="w-full rounded border border-transparent bg-transparent px-1 py-1 text-[10px] hover:border-gray-200 focus:border-brand disabled:text-gray-400"
                      />
                    </div>
                    <div style={{ width: END_W }} className="shrink-0 truncate px-1.5 text-center text-[10px] text-gray-500">
                      {t.dueDate ? fmtDate(new Date(t.dueDate)) : "—"}
                    </div>
                    <div style={{ width: REAL_W }} className="shrink-0 truncate px-1.5 text-center text-[10px] text-gray-500">
                      {t.actualStartedAt
                        ? `${fmtDate(new Date(t.actualStartedAt))} – ${t.actualEndedAt ? fmtDate(new Date(t.actualEndedAt)) : "..."}`
                        : "—"}
                    </div>
                    <div style={{ width: PCT_W }} className="shrink-0 px-1 text-center text-[10px] font-medium text-gray-500">
                      {pct}%
                    </div>
                    <div style={{ width: FLOAT_W }} className="shrink-0 px-1 text-center text-[10px]">
                      {result && !cpm.hasCycle ? (
                        isCritical ? <span className="font-medium text-rose-600">crítica</span> : <span className="text-gray-400">{result.float}d</span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
                    </div>
                    <div style={{ width: PRED_W }} className="shrink-0 px-1">
                      <button
                        onClick={() => toggleDepPanel(t.id)}
                        title="Gerenciar dependências"
                        className={`w-full truncate rounded px-1 py-1 text-left text-[10px] hover:bg-gray-100 ${
                          depPanelFor === t.id ? "bg-brand/10 text-brand-dark" : "text-gray-500"
                        }`}
                      >
                        {predText || "—"} 🔗
                      </button>
                    </div>
                  </div>

                  <div className="relative shrink-0 group-hover:bg-gray-50/40" style={{ width: totalDays * dayWidth, height: ROW_H }}>
                    {hasDates && !isMilestone && (
                      <>
                        <div
                          onPointerDown={(e) => handleBarPointerDown(e, t, "move")}
                          onClick={() => {
                            if (draggedRef.current) return;
                            setOpenTaskId(t.id);
                          }}
                          className={`group/bar absolute top-[9px] h-[18px] rounded-md border ${
                            canManage ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"
                          } ${isCritical ? "border-rose-400 bg-rose-50" : "border-gray-300 bg-gray-100"} ${
                            isDragging ? "shadow-lg ring-2 ring-brand/40" : ""
                          }`}
                          style={{ left: start * dayWidth, width }}
                        >
                          <div
                            className={`pointer-events-none h-full rounded-[5px] ${isCritical ? "bg-rose-400" : "bg-brand/70"}`}
                            style={{ width: `${pct}%` }}
                          />
                          {canManage && (
                            <div
                              onPointerDown={(e) => handleBarPointerDown(e, t, "resize")}
                              title="Arraste pra mudar a duração"
                              className="absolute -right-1 top-0 h-full w-3 cursor-ew-resize opacity-0 group-hover/bar:opacity-100"
                            >
                              <div className="mx-auto h-full w-1 rounded-full bg-gray-500/60" />
                            </div>
                          )}
                          <div className="pointer-events-none absolute -top-9 left-0 z-20 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover/bar:block">
                            <span className="font-medium">{t.title}</span>
                            <span className="ml-1 text-gray-300">
                              · {fmtDate(new Date(t.startDate!))} – {fmtDate(new Date(t.dueDate!))} · {statusLabel[t.status]} · {pct}%
                              {result && !cpm.hasCycle && (isCritical ? " · crítica" : ` · folga ${result.float}d`)}
                              {isDragging && drag.deltaDays !== 0 && (
                                <strong className="text-brand-light"> · {drag.deltaDays > 0 ? "+" : ""}{drag.deltaDays}d</strong>
                              )}
                            </span>
                          </div>
                        </div>
                        {actualStart !== null && actualEnd !== null && (
                          <div
                            className="absolute top-[3px] h-1 rounded-full bg-gray-700"
                            style={{ left: actualStart * dayWidth, width: Math.max(2, (actualEnd - actualStart + 1) * dayWidth) }}
                            title="Execução real"
                          />
                        )}
                      </>
                    )}
                    {isMilestone && (
                      <div
                        onClick={() => setOpenTaskId(t.id)}
                        className={`absolute top-[8px] h-4 w-4 rotate-45 cursor-pointer ${isCritical ? "bg-rose-500" : "bg-brand"}`}
                        style={{ left: start * dayWidth - 8 }}
                        title={`${t.title} · marco`}
                      />
                    )}
                  </div>

                  {depPanelFor === t.id && (
                    <div className="shadow-elevated absolute left-0 right-0 top-full z-30 border border-gray-100 bg-white px-4 py-3 text-xs" style={{ width: TABLE_W + totalDays * dayWidth }}>
                      <p className="mb-1.5 font-semibold text-gray-600">Predecessoras de "{t.title}"</p>
                      <div className="mb-2 flex flex-col gap-1">
                        {(t.predecessorLinks ?? []).map((link) => (
                          <div key={link.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                            <span className="flex-1 truncate">{wbsById.get(link.predecessorId)} · {link.predecessor.title}</span>
                            <span className="text-gray-400">{dependencyTypeLabel[link.type]}</span>
                            {link.lagDays !== 0 && <span className="text-gray-400">({link.lagDays > 0 ? "+" : ""}{link.lagDays}d)</span>}
                            <button onClick={() => handleRemoveDependency(link.id)} className="text-gray-300 hover:text-red-500">✕</button>
                          </div>
                        ))}
                        {(t.predecessorLinks ?? []).length === 0 && <p className="text-gray-400">Nenhuma predecessora.</p>}
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select value={newPredId} onChange={(e) => setNewPredId(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1">
                          <option value="">Escolher tarefa predecessora...</option>
                          {withDates
                            .filter((o) => o.id !== t.id)
                            .map((o) => (
                              <option key={o.id} value={o.id}>{wbsById.get(o.id)} · {o.title}</option>
                            ))}
                        </select>
                        <select value={newType} onChange={(e) => setNewType(e.target.value as DependencyType)} className="rounded-md border border-gray-300 px-2 py-1">
                          {(Object.keys(dependencyTypeLabel) as DependencyType[]).map((v) => (
                            <option key={v} value={v}>{dependencyTypeLabel[v]}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          value={newLag}
                          onChange={(e) => setNewLag(e.target.value)}
                          title="Antecedência/folga em dias"
                          className="w-16 rounded-md border border-gray-300 px-2 py-1"
                        />
                        <button
                          onClick={() => handleAddDependency(t.id)}
                          disabled={!newPredId || savingDep}
                          className="rounded-md bg-brand px-2.5 py-1 font-medium text-white hover:bg-brand-dark disabled:opacity-50"
                        >
                          Adicionar
                        </button>
                      </div>
                      <p className="mt-1.5 text-gray-400">Só tarefas com início e prazo definidos aparecem na lista — sem data, a dependência não entra no cálculo do caminho crítico.</p>
                      {depError && <p className="mt-1.5 text-rose-600">{depError}</p>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="mt-2 flex items-center gap-4 text-[11px] text-gray-400">
        <span className="flex items-center gap-1"><span className="h-3 w-4 rounded border border-gray-300 bg-gray-100" /> Planejado</span>
        <span className="flex items-center gap-1"><span className="h-1.5 w-4 rounded-full bg-brand/70" /> % concluído</span>
        <span className="flex items-center gap-1"><span className="h-1 w-4 rounded-full bg-gray-700" /> Real</span>
        <span className="flex items-center gap-1"><span className="h-3 w-4 rounded border border-rose-400 bg-rose-50" /> Crítica</span>
        <span className="flex items-center gap-1"><span className="h-3 w-3 rotate-45 bg-brand" /> Marco</span>
        <span className="flex items-center gap-1"><span className="h-3 w-0 border-l-2 border-dashed border-indigo-400" /> Hoje</span>
      </div>

      {openTaskId && <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={() => onChanged?.()} />}
    </div>
  );
}
