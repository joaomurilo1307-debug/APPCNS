"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import KanbanBoard from "@/components/KanbanBoard";

type Project = { id: string; name: string };
type TaskOption = { id: string; title: string };

export default function TarefasPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const canCreate = role && role !== "CLIENTE" && role !== "VISUALIZADOR";

  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [parentTaskId, setParentTaskId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isRotina, setIsRotina] = useState(false);
  const [frequencia, setFrequencia] = useState("SEMANAL");
  const [rotinaAte, setRotinaAte] = useState("");
  const [projects, setProjects] = useState<Project[]>([]);
  const [topLevelTasks, setTopLevelTasks] = useState<TaskOption[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
    fetch("/api/tasks?topLevel=true")
      .then((r) => r.json())
      .then((data) => setTopLevelTasks(data.map((t: any) => ({ id: t.id, title: t.title }))));
  }, [refreshKey]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        projectId: projectId || null,
        parentTaskId: parentTaskId || null,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        isRotina,
        rotinaFrequencia: isRotina ? frequencia : null,
        rotinaAteData: isRotina && rotinaAte ? new Date(rotinaAte).toISOString() : null,
      }),
    });
    setTitle("");
    setParentTaskId("");
    setStartDate("");
    setDueDate("");
    setIsRotina(false);
    setRotinaAte("");
    setShowForm(false);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tarefas e Rotinas</h1>
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Nova tarefa
          </button>
        )}
      </div>

      {showForm && canCreate && (
        <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input
            required
            placeholder="Título da tarefa"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Sem projeto (rotina solta)</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <select
            value={parentTaskId}
            onChange={(e) => setParentTaskId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Tarefa principal (não é subtarefa)</option>
            {topLevelTasks.map((t) => (
              <option key={t.id} value={t.id}>
                Subtarefa de: {t.title}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            Início
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            Prazo
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-2 text-sm"
            />
          </label>
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={isRotina} onChange={(e) => setIsRotina(e.target.checked)} />
            É rotina recorrente
          </label>
          {isRotina && (
            <>
              <select
                value={frequencia}
                onChange={(e) => setFrequencia(e.target.value)}
                className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="DIARIA">Diária</option>
                <option value="SEMANAL">Semanal</option>
                <option value="MENSAL">Mensal</option>
              </select>
              <label className="flex items-center gap-1 text-xs text-gray-500">
                Repetir até
                <input
                  type="date"
                  value={rotinaAte}
                  onChange={(e) => setRotinaAte(e.target.value)}
                  title="Se preenchido, gera uma tarefa pra cada ocorrência até essa data"
                  className="rounded-md border border-gray-300 px-2 py-2 text-sm"
                />
              </label>
            </>
          )}
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Criar
          </button>
        </form>
      )}

      <KanbanBoard key={refreshKey} />
    </div>
  );
}
