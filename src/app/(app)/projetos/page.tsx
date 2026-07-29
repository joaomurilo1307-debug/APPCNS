"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProgressBar from "@/components/ProgressBar";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  team: { id: string; name: string };
  owner: { name: string };
  approver: { name: string } | null;
  approvalStatus: string;
  startDate: string | null;
  endDate: string | null;
  _count: { tasks: number };
  percentComplete: number;
  overdueCount: number;
};

type Team = { id: string; name: string };

const statusLabel: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
};

const statusColor: Record<string, string> = {
  PLANEJADO: "bg-gray-100 text-gray-600",
  EM_ANDAMENTO: "bg-blue-100 text-blue-700",
  PAUSADO: "bg-amber-100 text-amber-700",
  CONCLUIDO: "bg-emerald-100 text-emerald-700",
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

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
            className="flex flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:border-brand hover:shadow-md"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-tight">{p.name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[p.status]}`}>
                {statusLabel[p.status]}
              </span>
            </div>
            <p className="text-xs text-gray-400">
              {p.team.name} · Responsável: {p.owner.name}
            </p>
            {p.approver && (
              <p className="mt-0.5 text-xs text-gray-400">
                Aprovador: {p.approver.name} ({p.approvalStatus})
              </p>
            )}

            <div className="mt-3">
              <ProgressBar percent={p.percentComplete} size="sm" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500">{p._count.tasks} tarefa(s)</span>
              {p.overdueCount > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">
                  {p.overdueCount} atrasada(s)
                </span>
              )}
              {p.endDate && (
                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500">Prazo: {fmtDate(p.endDate)}</span>
              )}
            </div>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-sm text-gray-400">Nenhum projeto ainda.</p>}
      </div>
    </div>
  );
}
