"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";

type Nucleo = {
  id: string;
  name: string;
  description: string | null;
  membros: { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null; nivelHierarquico: string | null }[];
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
  const canCreate = role === "ADMIN" || role === "DIRETOR";

  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(false);

  async function load() {
    const res = await fetch("/api/nucleos");
    if (res.ok) setNucleos(await res.json());
  }

  useEffect(() => {
    load();
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

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Núcleos</h1>
      <p className="mb-6 text-sm text-gray-500">
        Unidades organizacionais da empresa. Cada pessoa pertence a um núcleo (cadastrado em Usuários), independente
        das equipes de projeto em que participa.
      </p>

      {canCreate && (
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
            <h2 className="font-semibold">{n.name}</h2>
            {n.description && <p className="mt-1 text-sm text-gray-500">{n.description}</p>}
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
          </div>
        ))}
        {nucleos.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo cadastrado ainda.</p>}
      </div>
    </div>
  );
}
