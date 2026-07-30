"use client";

import { useMemo, useState } from "react";
import TaskDetailModal from "./TaskDetailModal";
import { computeCPM, type DependencyType } from "@/lib/cpm";

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
  priority?: string;
  parentTaskId?: string | null;
  groupLabel?: string | null;
  predecessorLinks?: DependencyLink[];
};

const statusColor: Record<string, string> = {
  A_FAZER: "bg-gray-400",
  FAZENDO: "bg-blue-500",
  BLOQUEADO: "bg-red-500",
  FEITO: "bg-emerald-500",
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

const ZOOM_LEVELS = { compacto: 18, médio: 28, largo: 44 } as const;
const LABEL_WIDTHS = { estreita: 220, larga: 340 } as const;
const ROW_H = 34;

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit" });
}

function buildHierarchy(tasks: Task[]) {
  const byParent = new Map<string | null, Task[]>();
  for (const t of tasks) {
    const key = t.parentTaskId && tasks.some((x) => x.id === t.parentTaskId) ? t.parentTaskId : null;
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key)!.push(t);
  }
  const result: { task: Task; depth: number }[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const t of byParent.get(parentId) ?? []) {
      result.push({ task: t, depth });
      walk(t.id, depth + 1);
    }
  }
  walk(null, 0);
  return result;
}

export default function ScheduleChart({
  tasks,
  onChanged,
  groupByProject,
  canManage,
}: {
  tasks: Task[];
  onChanged?: () => void;
  groupByProject?: boolean;
  canManage?: boolean;
}) {
  const [zoom, setZoom] = useState<keyof typeof ZOOM_LEVELS>("médio");
  const [labelWidth, setLabelWidth] = useState<keyof typeof LABEL_WIDTHS>("estreita");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [depPanelFor, setDepPanelFor] = useState<string | null>(null);
  const [newPredId, setNewPredId] = useState("");
  const [newType, setNewType] = useState<DependencyType>("FS");
  const [newLag, setNewLag] = useState("0");
  const [savingDep, setSavingDep] = useState(false);
  const [depError, setDepError] = useState<string | null>(null);

  const dayWidth = ZOOM_LEVELS[zoom];
  const labelPx = LABEL_WIDTHS[labelWidth];

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

  const groups = useMemo(() => {
    if (!groupByProject) return [{ label: null as string | null, rows: buildHierarchy(withDates) }];
    const map = new Map<string, Task[]>();
    withDates.forEach((t) => {
      const key = t.groupLabel ?? "Sem projeto";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return Array.from(map.entries()).map(([label, ts]) => ({ label, rows: buildHierarchy(ts) }));
  }, [withDates, groupByProject]);

  const { rangeStart, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    withDates.forEach((t) => {
      if (t.startDate) allDates.push(new Date(t.startDate));
      if (t.dueDate) allDates.push(new Date(t.dueDate));
      if (t.actualStartedAt) allDates.push(new Date(t.actualStartedAt));
      if (t.actualEndedAt) allDates.push(new Date(t.actualEndedAt));
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

  const allRows = groups.flatMap((g) => g.rows.map((r) => r.task));
  const rowIndex = new Map<string, number>();
  let idx = 0;
  for (const g of groups) {
    if (groupByProject) idx += 1;
    for (const r of g.rows) {
      rowIndex.set(r.task.id, idx);
      idx += 1;
    }
  }
  const byId = new Map(tasks.map((t) => [t.id, t]));

  function toggleDepPanel(taskId: string) {
    setDepPanelFor((prev) => (prev === taskId ? null : taskId));
    setNewPredId("");
    setNewType("FS");
    setNewLag("0");
    setDepError(null);
  }

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

  if (withDates.length === 0) {
    return <p className="text-sm text-gray-400">Nenhuma tarefa com data de início e prazo definidos ainda.</p>;
  }

  const criticalCount = Array.from(cpm.results.values()).filter((r) => r.isCritical).length;
  const conflictCount = Array.from(cpm.results.values()).filter((r) => r.hasConflict).length;

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
        <span className="ml-auto flex items-center gap-3 text-[11px] text-gray-400">
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-gray-300" /> Planejado</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded bg-gray-700" /> Real</span>
          <span className="flex items-center gap-1"><span className="h-2 w-4 rounded border-2 border-rose-500" /> Crítica</span>
        </span>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div style={{ minWidth: totalDays * dayWidth + labelPx }}>
          <div className="flex border-b border-gray-100">
            <div style={{ width: labelPx }} className="shrink-0 border-r border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
              Projeto / Tarefa
            </div>
            {days.map((d, i) => (
              <div key={i} style={{ width: dayWidth }} className="shrink-0 border-r border-gray-50 py-2 text-center text-[10px] text-gray-400">
                {d.getDate()}/{d.getMonth() + 1}
              </div>
            ))}
          </div>

          <div className="relative">
            {/* setas de dependência, desenhadas por cima de tudo */}
            <svg
              className="pointer-events-none absolute left-0 top-0 z-10"
              width={totalDays * dayWidth}
              height={allRows.length * ROW_H}
              style={{ marginLeft: labelPx }}
            >
              <defs>
                <marker id="sched-arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#94a3b8" />
                </marker>
              </defs>
              {allRows.map((t) =>
                (t.predecessorLinks ?? []).map((link) => {
                  const pred = byId.get(link.predecessorId);
                  if (!pred || !pred.startDate || !pred.dueDate || !t.startDate || !t.dueDate) return null;
                  const predRow = rowIndex.get(pred.id);
                  const succRow = rowIndex.get(t.id);
                  if (predRow === undefined || succRow === undefined) return null;
                  const x1 = offsetDays(pred.dueDate) * dayWidth + dayWidth;
                  const y1 = predRow * ROW_H + ROW_H / 2;
                  const x2 = offsetDays(t.startDate) * dayWidth;
                  const y2 = succRow * ROW_H + ROW_H / 2;
                  const midX = (x1 + x2) / 2;
                  return (
                    <path
                      key={link.id}
                      d={`M ${x1} ${y1} C ${midX} ${y1} ${midX} ${y2} ${x2} ${y2}`}
                      stroke="#94a3b8"
                      strokeWidth={1.5}
                      fill="none"
                      markerEnd="url(#sched-arrow)"
                      opacity={0.6}
                    />
                  );
                })
              )}
            </svg>

            {groups.map((group) => (
              <div key={group.label ?? "all"}>
                {groupByProject && (
                  <div className="flex border-b border-gray-100 bg-gray-50" style={{ height: ROW_H }}>
                    <div style={{ width: labelPx }} className="shrink-0 px-3 py-2 text-xs font-semibold">
                      {group.label}
                    </div>
                    <div style={{ width: totalDays * dayWidth }} />
                  </div>
                )}
                {group.rows.map(({ task: t, depth }) => {
                  const start = offsetDays(t.startDate!);
                  const end = offsetDays(t.dueDate!);
                  const width = Math.max(1, end - start + 1) * dayWidth;
                  const result = cpm.results.get(t.id);
                  const isCritical = !!result?.isCritical && !cpm.hasCycle;
                  const hasConflict = !!result?.hasConflict && !cpm.hasCycle;

                  const actualStart = t.actualStartedAt ? offsetDays(t.actualStartedAt) : null;
                  const actualEndRaw = t.actualEndedAt
                    ? offsetDays(t.actualEndedAt)
                    : t.actualStartedAt
                    ? offsetDays(new Date().toISOString())
                    : null;
                  const actualWidth = actualStart !== null && actualEndRaw !== null ? Math.max(1, actualEndRaw - actualStart + 1) * dayWidth : 0;

                  return (
                    <div key={t.id} className="relative">
                      <div className="flex border-b border-gray-50 hover:bg-gray-50/60" style={{ height: ROW_H }}>
                        <div style={{ width: labelPx, paddingLeft: 12 + depth * 16 }} className="flex shrink-0 items-center gap-1 pr-2 text-xs">
                          {depth > 0 && <span className="text-gray-300">↳</span>}
                          <span title={t.title} onClick={() => setOpenTaskId(t.id)} className="cursor-pointer truncate hover:text-brand-dark hover:underline">
                            {t.title}
                          </span>
                          {isCritical && <span title="No caminho crítico (folga zero)">🔴</span>}
                          {hasConflict && <span title="Conflito: início planejado antes do permitido pela rede de dependências">⚠️</span>}
                          {canManage && (
                            <button
                              onClick={() => toggleDepPanel(t.id)}
                              title="Gerenciar dependências"
                              className={`ml-auto shrink-0 ${depPanelFor === t.id ? "text-brand-dark" : "text-gray-300 hover:text-brand-dark"}`}
                            >
                              🔗
                            </button>
                          )}
                        </div>
                        <div className="relative" style={{ width: totalDays * dayWidth, height: ROW_H }}>
                          {actualStart !== null && (
                            <div
                              className="absolute top-[3px] h-1.5 rounded bg-gray-700"
                              style={{ left: actualStart * dayWidth, width: actualWidth }}
                            />
                          )}
                          <div
                            onClick={() => setOpenTaskId(t.id)}
                            className={`group absolute top-2 h-4 cursor-pointer rounded ${statusColor[t.status]} ${
                              isCritical ? "ring-2 ring-rose-500" : ""
                            }`}
                            style={{ left: start * dayWidth, width }}
                          >
                            <div className="pointer-events-none absolute -top-9 left-0 z-20 hidden whitespace-nowrap rounded-md bg-gray-900 px-2 py-1 text-[11px] text-white shadow-lg group-hover:block">
                              <span className="font-medium">{t.title}</span>
                              <span className="ml-1 text-gray-300">
                                · {fmtDate(new Date(t.startDate!))} – {fmtDate(new Date(t.dueDate!))} · {statusLabel[t.status]}
                                {result && !cpm.hasCycle && (isCritical ? " · crítica" : ` · folga ${result.float}d`)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      {depPanelFor === t.id && (
                        <div className="shadow-elevated absolute left-0 right-0 top-full z-30 border border-gray-100 bg-white px-4 py-3 text-xs">
                          <p className="mb-1.5 font-semibold text-gray-600">Predecessoras de "{t.title}"</p>
                          <div className="mb-2 flex flex-col gap-1">
                            {(t.predecessorLinks ?? []).map((link) => (
                              <div key={link.id} className="flex items-center gap-2 rounded-md bg-gray-50 px-2 py-1.5">
                                <span className="flex-1 truncate">{link.predecessor.title}</span>
                                <span className="text-gray-400">{dependencyTypeLabel[link.type]}</span>
                                {link.lagDays !== 0 && <span className="text-gray-400">({link.lagDays > 0 ? "+" : ""}{link.lagDays}d)</span>}
                                <button onClick={() => handleRemoveDependency(link.id)} className="text-gray-300 hover:text-red-500">✕</button>
                              </div>
                            ))}
                            {(t.predecessorLinks ?? []).length === 0 && <p className="text-gray-400">Nenhuma predecessora.</p>}
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            <select
                              value={newPredId}
                              onChange={(e) => setNewPredId(e.target.value)}
                              className="rounded-md border border-gray-300 px-2 py-1"
                            >
                              <option value="">Escolher tarefa predecessora...</option>
                              {withDates
                                .filter((o) => o.id !== t.id)
                                .map((o) => (
                                  <option key={o.id} value={o.id}>{o.title}</option>
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
            ))}
          </div>
        </div>
      </div>

      {openTaskId && <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={() => onChanged?.()} />}
    </div>
  );
}
