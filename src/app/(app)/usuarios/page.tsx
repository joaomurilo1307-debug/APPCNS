"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Avatar, { AVATAR_PALETTE } from "@/components/Avatar";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  avatarColor: string;
  avatarUrl?: string | null;
  cargo?: string | null;
  setor?: string | null;
  diretoria?: string | null;
  dataInicio?: string | null;
  gestorImediatoId?: string | null;
  gestorImediato?: { id: string; name: string } | null;
  nivelHierarquico?: string | null;
  nucleoId?: string | null;
  nucleo?: { id: string; name: string } | null;
  teams: { team: { id: string; name: string } }[];
};

type NucleoOption = { id: string; name: string };

const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  DIRETOR: "Diretor",
  GESTOR_PROJETO: "Gestor de Projeto",
  APROVADOR: "Aprovador",
  COLABORADOR: "Colaborador",
  CLIENTE: "Cliente",
  VISUALIZADOR: "Visualizador (só leitura)",
};

const nivelLabel: Record<string, string> = {
  DIRETORIA: "Diretoria",
  GERENCIA: "Gerência",
  COORDENACAO: "Coordenação",
  COLABORADOR: "Colaborador",
};

export default function UsuariosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const currentRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status === "authenticated" && currentRole !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [status, currentRole, router]);

  const [users, setUsers] = useState<UserRow[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newUserRole, setNewUserRole] = useState("COLABORADOR");
  const [newUserColor, setNewUserColor] = useState(AVATAR_PALETTE[0]);
  const [newCargo, setNewCargo] = useState("");
  const [newSetor, setNewSetor] = useState("");
  const [newDiretoria, setNewDiretoria] = useState("");
  const [newGestorId, setNewGestorId] = useState("");
  const [newDataInicio, setNewDataInicio] = useState("");
  const [newNivel, setNewNivel] = useState("");
  const [newNucleoId, setNewNucleoId] = useState("");
  const [newNucleoName, setNewNucleoName] = useState("");
  const [nucleos, setNucleos] = useState<NucleoOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);

  async function load() {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch {
      // rede instavel ou deploy em andamento; a tela mantem os dados anteriores
    }
  }

  async function loadNucleos() {
    const res = await fetch("/api/nucleos");
    if (res.ok) setNucleos(await res.json());
  }

  useEffect(() => {
    load();
    loadNucleos();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          role: newUserRole,
          avatarColor: newUserColor,
          cargo: newCargo || undefined,
          setor: newSetor || undefined,
          diretoria: newDiretoria || undefined,
          gestorImediatoId: newGestorId || undefined,
          dataInicio: newDataInicio ? new Date(newDataInicio).toISOString() : undefined,
          nivelHierarquico: newNivel || undefined,
          nucleoId: newNucleoName ? undefined : newNucleoId || undefined,
          newNucleoName: newNucleoName || undefined,
        }),
      });
      if (!res.ok) {
        let message = "Erro ao criar usuário";
        try {
          const data = await res.json();
          if (data.error?.fieldErrors) {
            const fieldMessages = Object.entries(data.error.fieldErrors as Record<string, string[]>)
              .filter(([, msgs]) => msgs?.length)
              .map(([field, msgs]) => `${field}: ${msgs.join(", ")}`);
            if (fieldMessages.length) message = fieldMessages.join(" · ");
          } else if (data.error?.formErrors?.length) {
            message = data.error.formErrors.join(", ");
          } else if (typeof data.error === "string") {
            message = data.error;
          }
        } catch {
          // resposta nao veio em JSON (ex: deploy em andamento) — mantem mensagem generica
        }
        setError(message);
        return;
      }
      setName("");
      setEmail("");
      setPassword("");
      setNewUserColor(AVATAR_PALETTE[0]);
      setNewCargo("");
      setNewSetor("");
      setNewDiretoria("");
      setNewGestorId("");
      setNewDataInicio("");
      setNewNivel("");
      setNewNucleoId("");
      setNewNucleoName("");
      setShowForm(false);
      load();
      loadNucleos();
    } catch {
      setError("Não foi possível conectar ao servidor. Tente novamente em alguns segundos.");
    }
  }

  async function updateRole(id: string, newRole: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function updateColor(id: string, color: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarColor: color }),
    });
    load();
  }

  async function updateField(id: string, field: string, value: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value || null }),
    });
    load();
  }

  async function handleResetPassword(id: string) {
    if (newPassword.length < 8) {
      setResetError("Mínimo de 8 caracteres.");
      return;
    }
    setResetError(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      setResetError("Não foi possível redefinir a senha.");
      return;
    }
    alert(`Senha redefinida. Repasse para a pessoa: ${newPassword}`);
    setResettingId(null);
    setNewPassword("");
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
        <form onSubmit={handleCreate} className="mb-8 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input required placeholder="Nome" value={name} onChange={(e) => setName(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <input
            required
            type="password"
            minLength={8}
            title="Mínimo de 8 caracteres"
            placeholder="Senha provisória (mín. 8 caracteres)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-56 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select value={newUserRole} onChange={(e) => setNewUserRole(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            {Object.entries(roleLabel).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
          <input placeholder="Cargo" value={newCargo} onChange={(e) => setNewCargo(e.target.value)} className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <input placeholder="Setor" value={newSetor} onChange={(e) => setNewSetor(e.target.value)} className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <input placeholder="Diretoria" value={newDiretoria} onChange={(e) => setNewDiretoria(e.target.value)} className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <select value={newGestorId} onChange={(e) => setNewGestorId(e.target.value)} className="w-44 rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">Gestor imediato…</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.name}</option>
            ))}
          </select>
          <input
            type="date"
            title="Data de início"
            value={newDataInicio}
            onChange={(e) => setNewDataInicio(e.target.value)}
            className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select value={newNivel} onChange={(e) => setNewNivel(e.target.value)} className="rounded-md border border-gray-300 px-3 py-2 text-sm">
            <option value="">Nível hierárquico…</option>
            {Object.entries(nivelLabel).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          <select
            value={newNucleoId}
            onChange={(e) => {
              setNewNucleoId(e.target.value);
              if (e.target.value) setNewNucleoName("");
            }}
            className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Núcleo…</option>
            {nucleos.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          <input
            placeholder="Ou novo núcleo"
            value={newNucleoName}
            onChange={(e) => {
              setNewNucleoName(e.target.value);
              if (e.target.value) setNewNucleoId("");
            }}
            className="w-32 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-1">
            {AVATAR_PALETTE.map((c) => (
              <button
                type="button"
                key={c}
                onClick={() => setNewUserColor(c)}
                className={`h-6 w-6 rounded-full ${newUserColor === c ? "ring-2 ring-offset-1 ring-gray-500" : ""}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
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
              <th className="px-4 py-3">Cargo</th>
              <th className="px-4 py-3">Setor</th>
              <th className="px-4 py-3">Diretoria</th>
              <th className="px-4 py-3">Nível</th>
              <th className="px-4 py-3">Núcleo</th>
              <th className="px-4 py-3">Gestor imediato</th>
              <th className="px-4 py-3">Cor</th>
              <th className="px-4 py-3">Equipes</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Senha</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} color={u.avatarColor} photoUrl={u.avatarUrl} />
                    {u.name}
                  </div>
                </td>
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
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.cargo ?? ""}
                    onBlur={(e) => e.target.value !== (u.cargo ?? "") && updateField(u.id, "cargo", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.setor ?? ""}
                    onBlur={(e) => e.target.value !== (u.setor ?? "") && updateField(u.id, "setor", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.diretoria ?? ""}
                    onBlur={(e) => e.target.value !== (u.diretoria ?? "") && updateField(u.id, "diretoria", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.nivelHierarquico ?? ""}
                    onChange={(e) => updateField(u.id, "nivelHierarquico", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {Object.entries(nivelLabel).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.nucleoId ?? ""}
                    onChange={(e) => updateField(u.id, "nucleoId", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {nucleos.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.gestorImediatoId ?? ""}
                    onChange={(e) => updateField(u.id, "gestorImediatoId", e.target.value)}
                    className="w-32 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {users.filter((o) => o.id !== u.id).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {AVATAR_PALETTE.slice(0, 6).map((c) => (
                      <button
                        key={c}
                        onClick={() => updateColor(u.id, c)}
                        className={`h-4 w-4 rounded-full ${u.avatarColor === c ? "ring-2 ring-offset-1 ring-gray-500" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
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
                <td className="px-4 py-3">
                  {resettingId === u.id ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Nova senha (mín. 8)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-36 rounded-md border border-gray-300 px-2 py-1 text-xs"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-dark"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => {
                            setResettingId(null);
                            setNewPassword("");
                            setResetError(null);
                          }}
                          className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                      </div>
                      {resetError && <p className="text-[11px] text-red-600">{resetError}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setResettingId(u.id);
                        setNewPassword("");
                        setResetError(null);
                      }}
                      className="text-xs text-brand-dark underline hover:text-brand"
                    >
                      Redefinir
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
