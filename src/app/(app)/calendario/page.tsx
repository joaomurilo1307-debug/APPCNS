"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  title: string;
  dueDate: string | null;
  priority: string;
  project: { name: string } | null;
};

const priorityDot: Record<string, string> = {
  BAIXA: "bg-gray-400",
  MEDIA: "bg-blue-500",
  ALTA: "bg-orange-500",
  URGENTE: "bg-red-500",
};

function startOfMonthGrid(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const gridStart = new Date(year, month, 1 - startWeekday);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    return d;
  });
}

export default function CalendarioPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [cursor, setCursor] = useState(() => new Date());

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then(setTasks);
  }, []);

  const days = useMemo(() => startOfMonthGrid(cursor.getFullYear(), cursor.getMonth()), [cursor]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const key = t.dueDate.slice(0, 10);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return map;
  }, [tasks]);

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold capitalize">{monthLabel}</h1>
        <div className="flex gap-2">
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            ← Anterior
          </button>
          <button
            onClick={() => setCursor(new Date())}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Hoje
          </button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
          >
            Próximo →
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200">
        {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map((d) => (
          <div key={d} className="bg-gray-50 px-2 py-2 text-center text-xs font-semibold text-gray-500">
            {d}
          </div>
        ))}
        {days.map((d) => {
          const key = d.toISOString().slice(0, 10);
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = key === new Date().toISOString().slice(0, 10);
          const dayTasks = tasksByDay.get(key) ?? [];
          return (
            <div
              key={key}
              className={`min-h-[110px] bg-white p-2 ${!inMonth ? "opacity-40" : ""}`}
            >
              <span className={`text-xs ${isToday ? "rounded-full bg-brand px-1.5 py-0.5 text-white" : "text-gray-500"}`}>
                {d.getDate()}
              </span>
              <div className="mt-1 flex flex-col gap-1">
                {dayTasks.slice(0, 3).map((t) => (
                  <div key={t.id} className="flex items-center gap-1 truncate rounded bg-gray-50 px-1 py-0.5 text-[11px]">
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${priorityDot[t.priority]}`} />
                    <span className="truncate">{t.title}</span>
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[10px] text-gray-400">+{dayTasks.length - 3} mais</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
