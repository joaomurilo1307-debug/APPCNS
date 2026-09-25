"use client";

import { useEffect, useState } from "react";
import GanttChart from "@/components/GanttChart";

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  isEntrega?: boolean;
  project: { id: string; name: string } | null;
};

export default function GanttPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState("");

  async function load() {
    const res = await fetch("/api/tasks");
    setTasks(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  const projects = Array.from(
    new Map(tasks.filter((t) => t.project).map((t) => [t.project!.id, t.project!])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filtered = projectId ? tasks.filter((t) => t.project?.id === projectId) : tasks;
  const withGroupLabel = filtered.map((t) => ({ ...t, groupLabel: t.project?.name ?? "Sem projeto" }));

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Gantt</h1>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Projeto:
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Só aparecem tarefas com data de início e prazo preenchidos.
        {!projectId && " Com projetos longos, a visão de \"todos\" fica grande — filtre por projeto pra ver melhor."}
      </p>

      <GanttChart tasks={withGroupLabel} groupByProject={!projectId} onChanged={load} />
    </div>
  );
}
