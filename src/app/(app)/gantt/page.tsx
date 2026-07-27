"use client";

import { useEffect, useMemo, useState } from "react";

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  project: { id: string; name: string } | null;
};

type Project = {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
};

const statusColor: Record<string, string> = {
  A_FAZER: "bg-gray-400",
  FAZENDO: "bg-blue-500",
  BLOQUEADO: "bg-red-500",
  FEITO: "bg-green-500",
};

const DAY_WIDTH = 28;

export default function GanttPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    Promise.all([
      fetch("/api/tasks").then((r) => r.json()),
      fetch("/api/projects").then((r) => r.json()),
    ]).then(([t, p]) => {
      setTasks(t.filter((x: Task) => x.startDate && x.dueDate));
      setProjects(p);
    });
  }, []);

  const { rangeStart, totalDays } = useMemo(() => {
    const allDates: Date[] = [];
    tasks.forEach((t) => {
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
  }, [tasks]);

  function offsetDays(dateStr: string) {
    return Math.round((new Date(dateStr).getTime() - rangeStart.getTime()) / 86400000);
  }

  const byProject = useMemo(() => {
    const map = new Map<string, Task[]>();
    tasks.forEach((t) => {
      const key = t.project?.id ?? "sem-projeto";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    });
    return map;
  }, [tasks]);

  const days = Array.from({ length: totalDays }, (_, i) => {
    const d = new Date(rangeStart);
    d.setDate(rangeStart.getDate() + i);
    return d;
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Gantt</h1>
      <p className="mb-6 text-sm text-gray-500">
        Só aparecem tarefas com data de início e prazo preenchidos.
      </p>

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <div style={{ minWidth: totalDays * DAY_WIDTH + 200 }}>
          <div className="flex border-b border-gray-100">
            <div className="w-[200px] shrink-0 border-r border-gray-100 px-3 py-2 text-xs font-semibold text-gray-500">
              Projeto / Tarefa
            </div>
            {days.map((d, i) => (
              <div
                key={i}
                style={{ width: DAY_WIDTH }}
                className="shrink-0 border-r border-gray-50 py-2 text-center text-[10px] text-gray-400"
              >
                {d.getDate()}/{d.getMonth() + 1}
              </div>
            ))}
          </div>

          {Array.from(byProject.entries()).map(([projectId, projectTasks]) => {
            const project = projects.find((p) => p.id === projectId);
            return (
              <div key={projectId}>
                <div className="flex border-b border-gray-100 bg-gray-50">
                  <div className="w-[200px] shrink-0 px-3 py-2 text-xs font-semibold">
                    {project?.name ?? "Sem projeto"}
                  </div>
                  <div style={{ width: totalDays * DAY_WIDTH }} />
                </div>
                {projectTasks.map((t) => {
                  const start = offsetDays(t.startDate!);
                  const end = offsetDays(t.dueDate!);
                  const width = Math.max(1, end - start + 1) * DAY_WIDTH;
                  return (
                    <div key={t.id} className="flex border-b border-gray-50">
                      <div className="w-[200px] shrink-0 truncate px-3 py-2 text-xs">{t.title}</div>
                      <div className="relative" style={{ width: totalDays * DAY_WIDTH, height: 32 }}>
                        <div
                          className={`absolute top-1.5 h-4 rounded ${statusColor[t.status]}`}
                          style={{ left: start * DAY_WIDTH, width }}
                          title={t.title}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
          {byProject.size === 0 && (
            <p className="p-6 text-sm text-gray-400">
              Nenhuma tarefa com data de início e prazo definidos ainda.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
