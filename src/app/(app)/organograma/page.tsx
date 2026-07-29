"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";

type Person = {
  id: string;
  name: string;
  email: string;
  avatarColor: string;
  avatarUrl: string | null;
  cargo: string | null;
  ramal: string | null;
  whatsapp: string | null;
  nivelHierarquico: string | null;
  gestorImediatoId: string | null;
  gestorImediato: { id: string; name: string } | null;
  nucleo: { id: string; name: string } | null;
};

const nivelLabel: Record<string, string> = {
  DIRETORIA: "Diretoria",
  GERENCIA: "Gerência",
  COORDENACAO: "Coordenação",
  COLABORADOR: "Colaborador",
};

function TreeNode({
  person,
  byManager,
  onSelect,
}: {
  person: Person;
  byManager: Map<string, Person[]>;
  onSelect: (p: Person) => void;
}) {
  const children = byManager.get(person.id) ?? [];
  return (
    <li>
      <button
        type="button"
        onClick={() => onSelect(person)}
        className="inline-flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm hover:border-brand hover:shadow-md"
      >
        <Avatar name={person.name} color={person.avatarColor} photoUrl={person.avatarUrl} size={36} />
        <p className="whitespace-nowrap text-xs font-medium">{person.name}</p>
        <p className="whitespace-nowrap text-[10px] text-gray-400">
          {person.cargo || (person.nivelHierarquico ? nivelLabel[person.nivelHierarquico] : person.nucleo?.name) || "—"}
        </p>
      </button>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <TreeNode key={c.id} person={c} byManager={byManager} onSelect={onSelect} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrganogramaPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [nucleoFilter, setNucleoFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);

  useEffect(() => {
    fetch("/api/organograma")
      .then((r) => r.json())
      .then(setPeople)
      .catch(() => {});
  }, []);

  const nucleos = Array.from(new Set(people.map((p) => p.nucleo?.name).filter(Boolean))) as string[];
  let scoped = nucleoFilter ? people.filter((p) => p.nucleo?.name === nucleoFilter) : people;

  if (search.trim()) {
    const q = search.trim().toLowerCase();
    const byId = new Map(scoped.map((p) => [p.id, p]));
    const matches = scoped.filter((p) => p.name.toLowerCase().includes(q));
    const keep = new Set<string>();
    for (const m of matches) {
      let cur: Person | undefined = m;
      while (cur) {
        keep.add(cur.id);
        cur = cur.gestorImediatoId ? byId.get(cur.gestorImediatoId) : undefined;
      }
    }
    scoped = scoped.filter((p) => keep.has(p.id));
  }

  const ids = new Set(scoped.map((p) => p.id));
  const byManager = new Map<string, Person[]>();
  const roots: Person[] = [];
  for (const p of scoped) {
    if (p.gestorImediatoId && ids.has(p.gestorImediatoId)) {
      if (!byManager.has(p.gestorImediatoId)) byManager.set(p.gestorImediatoId, []);
      byManager.get(p.gestorImediatoId)!.push(p);
    } else {
      roots.push(p);
    }
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Organograma</h1>
          <p className="text-sm text-gray-500">Hierarquia direta das pessoas (cargo e gestor imediato).</p>
        </div>
        <div className="flex gap-2">
          <input
            placeholder="Buscar pessoa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-48 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          {nucleos.length > 0 && (
            <select
              value={nucleoFilter}
              onChange={(e) => setNucleoFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Todos os núcleos</option>
              {nucleos.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {roots.length === 0 && <p className="text-sm text-gray-400">Ninguém encontrado.</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-8">
        <ul className="orgchart-tree">
          {roots.map((p) => (
            <TreeNode key={p.id} person={p} byManager={byManager} onSelect={setSelected} />
          ))}
        </ul>
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Avatar name={selected.name} color={selected.avatarColor} photoUrl={selected.avatarUrl} size={48} />
                <div>
                  <p className="font-semibold">{selected.name}</p>
                  <p className="text-xs text-gray-400">
                    {selected.cargo || (selected.nivelHierarquico ? nivelLabel[selected.nivelHierarquico] : "—")}
                  </p>
                </div>
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <dl className="grid grid-cols-3 gap-y-2 text-sm">
              <dt className="text-gray-400">E-mail</dt>
              <dd className="col-span-2 break-all">{selected.email}</dd>
              <dt className="text-gray-400">Ramal</dt>
              <dd className="col-span-2">{selected.ramal || "—"}</dd>
              <dt className="text-gray-400">WhatsApp</dt>
              <dd className="col-span-2">{selected.whatsapp || "—"}</dd>
              <dt className="text-gray-400">Núcleo</dt>
              <dd className="col-span-2">{selected.nucleo?.name || "—"}</dd>
              <dt className="text-gray-400">Nível</dt>
              <dd className="col-span-2">{selected.nivelHierarquico ? nivelLabel[selected.nivelHierarquico] : "—"}</dd>
              <dt className="text-gray-400">Gestor</dt>
              <dd className="col-span-2">{selected.gestorImediato?.name || "—"}</dd>
            </dl>
          </div>
        </div>
      )}

      <style jsx global>{`
        .orgchart-tree,
        .orgchart-tree ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          justify-content: center;
        }
        .orgchart-tree ul {
          padding-top: 20px;
          position: relative;
        }
        .orgchart-tree li {
          position: relative;
          padding: 0 12px;
          text-align: center;
        }
        .orgchart-tree li::before,
        .orgchart-tree li::after {
          content: "";
          position: absolute;
          top: 0;
          right: 50%;
          border-top: 2px solid #d1d5db;
          width: 50%;
          height: 20px;
        }
        .orgchart-tree li::after {
          right: auto;
          left: 50%;
          border-left: 2px solid #d1d5db;
        }
        .orgchart-tree li:only-child::after,
        .orgchart-tree li:only-child::before {
          display: none;
        }
        .orgchart-tree li:only-child {
          padding-top: 0;
        }
        .orgchart-tree li:first-child::before,
        .orgchart-tree li:last-child::after {
          border: 0 none;
        }
        .orgchart-tree li:last-child::before {
          border-right: 2px solid #d1d5db;
          border-radius: 0 6px 0 0;
        }
        .orgchart-tree li:first-child::after {
          border-radius: 6px 0 0 0;
        }
        .orgchart-tree > li {
          padding-top: 0;
        }
        .orgchart-tree > li::before,
        .orgchart-tree > li::after {
          display: none;
        }
        .orgchart-tree li ul::before {
          content: "";
          position: absolute;
          top: 0;
          left: 50%;
          border-left: 2px solid #d1d5db;
          width: 0;
          height: 20px;
        }
      `}</style>
    </div>
  );
}
