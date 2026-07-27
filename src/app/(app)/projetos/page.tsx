"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  team: { id: string; name: string };
  owner: { name: string };
  _count: { tasks: number };
  percentComplete: number;
};

type Team = { id: string; name: string };

const statusLabel: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
};

export default function ProjetosPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [p, t] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
    ]);
    setProjects(p);
    setTeams(t);
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!teamId) return;
    await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, teamId }),
    });
    setName("");
    setShowForm(false);
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projetos</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Novo projeto
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input
            required
            placeholder="Nome do projeto"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            required
            value={teamId}
            onChange={(e) => setTeamId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Selecione a equipe</option>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Criar
          </button>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projetos/${p.id}`}
            className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm hover:border-brand"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 className="font-semibold">{p.name}</h2>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                {statusLabel[p.status]}
              </span>
            </div>
            <p className="text-xs text-gray-400">{p.team.name}</p>
            <div className="mt-3 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-brand" style={{ width: `${p.percentComplete}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-500">{p.percentComplete}%</span>
            </div>
            <p className="mt-2 text-sm text-gray-500">{p._count.tasks} tarefa(s)</p>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-sm text-gray-400">Nenhum projeto ainda.</p>}
      </div>
    </div>
  );
}
