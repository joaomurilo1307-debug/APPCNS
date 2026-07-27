"use client";

import { useEffect, useState } from "react";

type Project = {
  id: string;
  name: string;
  description: string | null;
  approvalStatus: string;
  team: { name: string };
  owner: { name: string };
};

const statusStyle: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-700",
  APROVADO: "bg-green-100 text-green-700",
  REJEITADO: "bg-red-100 text-red-700",
  NAO_REQUER: "bg-gray-100 text-gray-500",
};

export default function AprovacoesPage() {
  const [projects, setProjects] = useState<Project[]>([]);

  async function load() {
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function decide(id: string, decision: "APROVADO" | "REJEITADO") {
    await fetch(`/api/projects/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    load();
  }

  const pendentes = projects.filter((p) => p.approvalStatus === "PENDENTE");
  const decididos = projects.filter((p) => p.approvalStatus === "APROVADO" || p.approvalStatus === "REJEITADO");

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Aprovações</h1>
      <p className="mb-6 text-sm text-gray-500">Projetos aguardando sua decisão.</p>

      <h2 className="mb-3 text-sm font-semibold text-gray-600">Pendentes ({pendentes.length})</h2>
      <div className="mb-8 grid gap-3">
        {pendentes.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
            <div>
              <p className="font-medium">{p.name}</p>
              <p className="text-xs text-gray-500">{p.team.name} · Responsável: {p.owner.name}</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => decide(p.id, "APROVADO")}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Aprovar
              </button>
              <button
                onClick={() => decide(p.id, "REJEITADO")}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Rejeitar
              </button>
            </div>
          </div>
        ))}
        {pendentes.length === 0 && <p className="text-sm text-gray-400">Nada pendente. 🎉</p>}
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-600">Histórico</h2>
      <div className="grid gap-2">
        {decididos.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-2 text-sm">
            <span>{p.name}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[p.approvalStatus]}`}>
              {p.approvalStatus}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
