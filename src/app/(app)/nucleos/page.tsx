"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";

type Person = { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo?: string | null; nivelHierarquico?: string | null };

type Nucleo = {
  id: string;
  name: string;
  description: string | null;
  membros: Person[];
  gerentes: Person[];
};

const nivelLabel: Record<string, string> = {
  DIRETORIA: "Diretoria",
  GERENCIA: "Gerência",
  COORDENACAO: "Coordenação",
  COLABORADOR: "Colaborador",
};

export default function NucleosPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const canManage = role === "ADMIN" || role === "DIRETOR";

  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [allPeople, setAllPeople] = useState<Person[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editGerenteIds, setEditGerenteIds] = useState<string[]>([]);

  async function load() {
    const res = await fetch("/api/nucleos");
    if (res.ok) setNucleos(await res.json());
  }

  async function loadPeople() {
    const res = await fetch("/api/presence");
    if (res.ok) setAllPeople(await res.json());
  }

  useEffect(() => {
    load();
    loadPeople();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/nucleos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description: description || undefined }),
    });
    setName("");
    setDescription("");
    setLoading(false);
    load();
  }

  function startEdit(n: Nucleo) {
    setEditingId(n.id);
    setEditName(n.name);
    setEditDescription(n.description ?? "");
    setEditGerenteIds(n.gerentes.map((g) => g.id));
  }

  async function saveEdit(id: string) {
    await fetch(`/api/nucleos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: editName, description: editDescription || null, gerenteIds: editGerenteIds }),
    });
    setEditingId(null);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir este núcleo? Só funciona se não tiver ninguém nele.")) return;
    const res = await fetch(`/api/nucleos/${id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Não foi possível excluir.");
      return;
    }
    load();
  }

  function toggleGerente(id: string) {
    setEditGerenteIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Núcleos</h1>
      <p className="mb-6 text-sm text-gray-500">
        Unidades organizacionais da empresa. Cada pessoa pertence a um núcleo (cadastrado em Usuários). Um núcleo
        pode ter vários gerentes/visualizadores responsáveis por ele, além dos membros.
      </p>

      {canManage && (
        <form onSubmit={handleCreate} className="mb-8 flex flex-wrap gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input
            required
            placeholder="Nome do núcleo"
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
            Criar núcleo
          </button>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {nucleos.map((n) => (
          <div key={n.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            {editingId === n.id ? (
              <div className="flex flex-col gap-2">
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm font-semibold"
                />
                <input
                  placeholder="Descrição"
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <p className="mt-1 text-xs font-semibold text-gray-500">Gerentes/visualizadores deste núcleo</p>
                <div className="flex max-h-40 flex-col gap-1 overflow-y-auto rounded-md border border-gray-200 p-2">
                  {allPeople.map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs">
                      <input type="checkbox" checked={editGerenteIds.includes(p.id)} onChange={() => toggleGerente(p.id)} />
                      {p.name}
                    </label>
                  ))}
                </div>
                <div className="mt-2 flex gap-2">
                  <button onClick={() => saveEdit(n.id)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
                    Salvar
                  </button>
                  <button onClick={() => setEditingId(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between">
                  <h2 className="font-semibold">{n.name}</h2>
                  {canManage && (
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(n)} className="text-xs text-brand-dark hover:underline">
                        Editar
                      </button>
                      <button onClick={() => handleDelete(n.id)} className="text-xs text-red-400 hover:text-red-700">
                        Excluir
                      </button>
                    </div>
                  )}
                </div>
                {n.description && <p className="mt-1 text-sm text-gray-500">{n.description}</p>}

                {n.gerentes.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs font-semibold text-gray-500">Gerentes/visualizadores</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {n.gerentes.map((g) => (
                        <span key={g.id} className="flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-xs text-brand-dark">
                          <Avatar name={g.name} color={g.avatarColor} photoUrl={g.avatarUrl} size={14} />
                          {g.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <p className="mt-3 text-xs text-gray-400">{n.membros.length} pessoa(s)</p>
                <ul className="mt-3 space-y-2">
                  {n.membros.map((m) => (
                    <li key={m.id} className="flex items-center gap-2 text-sm text-gray-600">
                      <Avatar name={m.name} color={m.avatarColor} photoUrl={m.avatarUrl} size={24} />
                      <span className="flex-1">{m.name}</span>
                      <span className="text-xs text-gray-400">
                        {m.nivelHierarquico ? nivelLabel[m.nivelHierarquico] : m.cargo ?? ""}
                      </span>
                    </li>
                  ))}
                  {n.membros.length === 0 && <p className="text-xs text-gray-400">Nenhuma pessoa neste núcleo ainda.</p>}
                </ul>
              </>
            )}
          </div>
        ))}
        {nucleos.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo cadastrado ainda.</p>}
      </div>
    </div>
  );
}
