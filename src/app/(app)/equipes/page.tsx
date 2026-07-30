"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Avatar, { AVATAR_PALETTE } from "@/components/Avatar";

type Team = {
  id: string;
  name: string;
  description: string | null;
  members: { user: { id: string; name: string; email: string; avatarColor: string; avatarUrl?: string | null; cargo?: string | null }; role: string }[];
  _count: { projects: number };
};

type UserOption = { id: string; name: string; nucleo?: { name: string } | null };

export default function EquipesPage() {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  const isAdmin = role === "ADMIN";
  const canManageMembers = role === "ADMIN" || role === "GESTOR_PROJETO";

  const [teams, setTeams] = useState<Team[]>([]);
  const [allUsers, setAllUsers] = useState<UserOption[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);
  const [addingToTeam, setAddingToTeam] = useState<string | null>(null);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedRole, setSelectedRole] = useState("MEMBRO");

  async function load() {
    const res = await fetch("/api/teams");
    setTeams(await res.json());
    if (canManageMembers) {
      const uRes = await fetch("/api/organograma");
      if (uRes.ok) setAllUsers(await uRes.json());
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManageMembers]);

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

  async function handleAddMember(teamId: string) {
    if (!selectedUserId) return;
    await fetch(`/api/teams/${teamId}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selectedUserId, role: selectedRole }),
    });
    setAddingToTeam(null);
    setSelectedUserId("");
    load();
  }

  async function handleRemoveMember(teamId: string, userId: string) {
    if (!confirm("Remover essa pessoa da equipe?")) return;
    await fetch(`/api/teams/${teamId}/members/${userId}`, { method: "DELETE" });
    load();
  }

  async function updateColor(userId: string, color: string) {
    await fetch(`/api/users/${userId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarColor: color }),
    });
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
        {teams.map((team) => {
          const memberIds = new Set(team.members.map((m) => m.user.id));
          const availableUsers = allUsers.filter((u) => !memberIds.has(u.id));
          const isThisTeamGestor = team.members.some((m) => m.user.id === myId && m.role === "GESTOR");
          const canAddToThisTeam = isAdmin || isThisTeamGestor;
          return (
            <div key={team.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{team.name}</h2>
                <Link href={`/equipes/${team.id}`} className="shrink-0 text-xs font-medium text-brand hover:underline">
                  Abrir equipe →
                </Link>
              </div>
              {team.description && <p className="mt-1 text-sm text-gray-500">{team.description}</p>}
              <p className="mt-3 text-xs text-gray-400">{team._count.projects} projeto(s)</p>

              <ul className="mt-3 space-y-2">
                {team.members.map((m) => (
                  <li key={m.user.id} className="flex items-center justify-between text-sm text-gray-600">
                    <div className="flex items-center gap-2">
                      <Avatar name={m.user.name} color={m.user.avatarColor} photoUrl={m.user.avatarUrl} />
                      {m.user.name} <span className="text-xs text-gray-400">({m.role})</span>
                    </div>
                    {canManageMembers && (
                      <div className="flex items-center gap-1">
                        {AVATAR_PALETTE.slice(0, 5).map((c) => (
                          <button
                            key={c}
                            onClick={() => updateColor(m.user.id, c)}
                            className="h-3 w-3 rounded-full"
                            style={{ backgroundColor: c }}
                          />
                        ))}
                        {canAddToThisTeam && (
                          <button
                            onClick={() => handleRemoveMember(team.id, m.user.id)}
                            title="Remover da equipe"
                            className="ml-1 text-xs text-gray-300 hover:text-red-500"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>

              {canAddToThisTeam && (
                <div className="mt-4 border-t border-gray-100 pt-3">
                  {addingToTeam === team.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value={selectedUserId}
                        onChange={(e) => setSelectedUserId(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="">Selecione a pessoa (qualquer núcleo)</option>
                        {availableUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                            {u.nucleo ? ` · ${u.nucleo.name}` : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedRole}
                        onChange={(e) => setSelectedRole(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                      >
                        <option value="MEMBRO">Membro</option>
                        <option value="GESTOR">Gestor</option>
                      </select>
                      <button
                        onClick={() => handleAddMember(team.id)}
                        className="rounded-md bg-brand px-2 py-1 text-xs text-white hover:bg-brand-dark"
                      >
                        Adicionar
                      </button>
                      <button onClick={() => setAddingToTeam(null)} className="text-xs text-gray-400">
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAddingToTeam(team.id)}
                      className="text-xs font-medium text-brand hover:underline"
                    >
                      + Adicionar pessoa
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
        {teams.length === 0 && <p className="text-sm text-gray-400">Nenhuma equipe ainda.</p>}
      </div>
    </div>
  );
}
