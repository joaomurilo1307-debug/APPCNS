"use client";

import { useEffect, useState } from "react";
import KanbanBoard from "@/components/KanbanBoard";

type Project = { id: string; name: string };

export default function TarefasPage() {
  const [title, setTitle] = useState("");
  const [projectId, setProjectId] = useState("");
  const [isRotina, setIsRotina] = useState(false);
  const [frequencia, setFrequencia] = useState("SEMANAL");
  const [projects, setProjects] = useState<Project[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    fetch("/api/projects")
      .then((r) => r.json())
      .then(setProjects);
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        projectId: projectId || null,
        isRotina,
        rotinaFrequencia: isRotina ? frequencia : null,
      }),
    });
    setTitle("");
    setShowForm(false);
    setRefreshKey((k) => k + 1);
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Tarefas e Rotinas</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Nova tarefa
        </button>
      </div>

      {showForm && (
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
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={isRotina} onChange={(e) => setIsRotina(e.target.checked)} />
            É rotina recorrente
          </label>
          {isRotina && (
            <select
              value={frequencia}
              onChange={(e) => setFrequencia(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="DIARIA">Diária</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
            </select>
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
