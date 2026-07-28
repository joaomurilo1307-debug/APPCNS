"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";

type Person = {
  id: string;
  name: string;
  avatarColor: string;
  avatarUrl: string | null;
  cargo: string | null;
  nivelHierarquico: string | null;
  gestorImediatoId: string | null;
  nucleo: { id: string; name: string } | null;
};

const nivelLabel: Record<string, string> = {
  DIRETORIA: "Diretoria",
  GERENCIA: "Gerência",
  COORDENACAO: "Coordenação",
  COLABORADOR: "Colaborador",
};

function TreeNode({ person, byManager }: { person: Person; byManager: Map<string, Person[]> }) {
  const children = byManager.get(person.id) ?? [];
  return (
    <li>
      <div className="inline-flex flex-col items-center gap-1 rounded-lg border border-gray-200 bg-white px-3 py-2 shadow-sm">
        <Avatar name={person.name} color={person.avatarColor} photoUrl={person.avatarUrl} size={36} />
        <p className="whitespace-nowrap text-xs font-medium">{person.name}</p>
        <p className="whitespace-nowrap text-[10px] text-gray-400">
          {person.nivelHierarquico ? nivelLabel[person.nivelHierarquico] : person.cargo || "—"}
        </p>
      </div>
      {children.length > 0 && (
        <ul>
          {children.map((c) => (
            <TreeNode key={c.id} person={c} byManager={byManager} />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function OrganogramaPage() {
  const [people, setPeople] = useState<Person[]>([]);
  const [nucleoFilter, setNucleoFilter] = useState("");

  useEffect(() => {
    fetch("/api/organograma")
      .then((r) => r.json())
      .then(setPeople)
      .catch(() => {});
  }, []);

  const nucleos = Array.from(new Set(people.map((p) => p.nucleo?.name).filter(Boolean))) as string[];
  const filtered = nucleoFilter ? people.filter((p) => p.nucleo?.name === nucleoFilter) : people;

  const ids = new Set(filtered.map((p) => p.id));
  const byManager = new Map<string, Person[]>();
  const roots: Person[] = [];
  for (const p of filtered) {
    if (p.gestorImediatoId && ids.has(p.gestorImediatoId)) {
      if (!byManager.has(p.gestorImediatoId)) byManager.set(p.gestorImediatoId, []);
      byManager.get(p.gestorImediatoId)!.push(p);
    } else {
      roots.push(p);
    }
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Organograma</h1>
          <p className="text-sm text-gray-500">Linhas de hierarquia direta (gestor imediato de cada pessoa).</p>
        </div>
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

      {roots.length === 0 && <p className="text-sm text-gray-400">Ninguém com hierarquia cadastrada ainda.</p>}

      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white p-8">
        <ul className="orgchart-tree">
          {roots.map((p) => (
            <TreeNode key={p.id} person={p} byManager={byManager} />
          ))}
        </ul>
      </div>

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
