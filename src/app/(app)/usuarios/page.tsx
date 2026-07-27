"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  teams: { team: { id: string; name: string } }[];
};

const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  GESTOR_PROJETO: "Gestor de Projeto",
  APROVADOR: "Aprovador",
  COLABORADOR: "Colaborador",
  CLIENTE: "Cliente",
  VISUALIZADOR: "Visualizador (só leitura)",
};

export default function UsuariosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const role = (session?.user as any)?.role;

  useEffect(() => {
    if (status === "authenticated" && role !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [status, role, router]);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState("COLABORADOR");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch("/api/users");
    if (res.ok) setUsers(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch("/api/users", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password, role }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Erro ao criar usuário");
      return;
    }
    setName("");
    setEmail("");
    setPassword("");
    setShowForm(false);
    load();
  }

  async function updateRole(id: string, newRole: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function toggleActive(u: UserRow) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuários e Governança</h1>
          <p className="text-sm text-gray-500">Cadastro de acesso e papéis. Restrito a Admin.</p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Novo usuário
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input required placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <input required type="password" placeholder="Senha provisória" value={password} onChange={(e) => setPassword(e.target.value)} className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            {Object.entries(roleLabel).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Criar</button>
          {error && <p className="w-full text-sm text-red-600">{error}</p>}
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Equipes</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                  >
                    {Object.entries(roleLabel).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {u.teams.map((t) => t.team.name).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(u)}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {u.active ? "Ativo" : "Inativo"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
