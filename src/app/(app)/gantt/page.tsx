"use client";

import { useEffect, useState } from "react";
import GanttChart from "@/components/GanttChart";

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  project: { id: string; name: string } | null;
};

export default function GanttPage() {
  const [tasks, setTasks] = useState<Task[]>([]);

  async function load() {
    const res = await fetch("/api/tasks");
    setTasks(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  const withGroupLabel = tasks.map((t) => ({ ...t, groupLabel: t.project?.name ?? "Sem projeto" }));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Gantt</h1>
      <p className="mb-6 text-sm text-gray-500">
        Só aparecem tarefas com data de início e prazo preenchidos.
      </p>

      <GanttChart tasks={withGroupLabel} groupByProject onChanged={load} />
    </div>
  );
}
