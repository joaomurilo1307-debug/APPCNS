"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Team = {
  id: string;
  name: string;
  description: string | null;
  members: { user: { id: string; name: string; email: string }; role: string }[];
  _count: { projects: number };
};

export default function EquipesPage() {
  const { data: session } = useSession();
  const isAdmin = (session?.user as any)?.role === "ADMIN";

  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/teams");
    setTeams(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/teams", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    setName("");
    setDescription("");
    setLoading(false);
    load();
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-semibold">Equipes</h1>

      {isAdmin && (
        <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input
            required
            placeholder="Nome da equipe"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Descrição (opcional)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            disabled={loading}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Criar equipe
          </button>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {teams.map((team) => (
          <div key={team.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="font-semibold">{team.name}</h2>
            {team.description && <p className="mt-1 text-sm text-gray-500">{team.description}</p>}
            <p className="mt-3 text-xs text-gray-400">{team._count.projects} projeto(s)</p>
            <ul className="mt-3 space-y-1">
              {team.members.map((m) => (
                <li key={m.user.id} className="text-sm text-gray-600">
                  {m.user.name} <span className="text-xs text-gray-400">({m.role})</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
        {teams.length === 0 && <p className="text-sm text-gray-400">Nenhuma equipe ainda.</p>}
      </div>
    </div>
  );
}
