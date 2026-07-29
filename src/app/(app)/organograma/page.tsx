"use client";

import { useEffect, useMemo, useState } from "react";
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

type NucleoData = {
  id: string;
  name: string;
  description: string | null;
  membros: { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null; nivelHierarquico: string | null }[];
  gerentes: { id: string; name: string; avatarColor: string; avatarUrl: string | null }[];
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
          {person.cargo || (person.nivelHierarquico ? nivelLabel[person.nivelHierarquico] : null) || "—"}
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
  const [nucleos, setNucleos] = useState<NucleoData[]>([]);
  const [nucleoFilter, setNucleoFilter] = useState("");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);

  useEffect(() => {
    fetch("/api/organograma").then((r) => r.json()).then(setPeople).catch(() => {});
    fetch("/api/nucleos").then((r) => r.json()).then(setNucleos).catch(() => {});
  }, []);

  const peopleById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  // Diretores/gerentes: qualquer pessoa listada como gerente/visualizador de ao menos um núcleo.
  const cabecalho = useMemo(() => {
    const map = new Map<string, { person: { id: string; name: string; avatarColor: string; avatarUrl: string | null }; nucleos: string[] }>();
    for (const n of nucleos) {
      for (const g of n.gerentes) {
        if (!map.has(g.id)) map.set(g.id, { person: g, nucleos: [] });
        map.get(g.id)!.nucleos.push(n.name);
      }
    }
    return Array.from(map.values());
  }, [nucleos]);

  const q = search.trim().toLowerCase();

  function buildTreeForNucleo(n: NucleoData) {
    let membros = n.membros.map((m) => peopleById.get(m.id)).filter((p): p is Person => !!p);

    if (q) {
      const byId = new Map(membros.map((p) => [p.id, p]));
      const matches = membros.filter((p) => p.name.toLowerCase().includes(q));
      if (matches.length === 0) return null;
      const keep = new Set<string>();
      for (const m of matches) {
        let cur: Person | undefined = m;
        while (cur) {
          keep.add(cur.id);
          cur = cur.gestorImediatoId ? byId.get(cur.gestorImediatoId) : undefined;
        }
      }
      membros = membros.filter((p) => keep.has(p.id));
    }

    if (membros.length === 0) return null;

    const ids = new Set(membros.map((p) => p.id));
    const byManager = new Map<string, Person[]>();
    const roots: Person[] = [];
    for (const p of membros) {
      if (p.gestorImediatoId && ids.has(p.gestorImediatoId)) {
        if (!byManager.has(p.gestorImediatoId)) byManager.set(p.gestorImediatoId, []);
        byManager.get(p.gestorImediatoId)!.push(p);
      } else {
        roots.push(p);
      }
    }
    return { roots, byManager };
  }

  const visibleNucleos = (nucleoFilter ? nucleos.filter((n) => n.id === nucleoFilter) : nucleos).filter(
    (n) => !q || buildTreeForNucleo(n) !== null
  );

  const nucleoMemberIds = useMemo(() => new Set(nucleos.flatMap((n) => n.membros.map((m) => m.id))), [nucleos]);
  const semNucleo: NucleoData | null = useMemo(() => {
    const orfaos = people.filter((p) => !nucleoMemberIds.has(p.id));
    if (orfaos.length === 0) return null;
    return {
      id: "__sem_nucleo__",
      name: "Sem núcleo",
      description: null,
      membros: orfaos.map((p) => ({ id: p.id, name: p.name, avatarColor: p.avatarColor, avatarUrl: p.avatarUrl, cargo: p.cargo, nivelHierarquico: p.nivelHierarquico })),
      gerentes: [],
    };
  }, [people, nucleoMemberIds]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Organograma</h1>
          <p className="text-sm text-gray-500">Pessoas agrupadas por núcleo, com hierarquia direta (cargo e gestor imediato).</p>
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
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {cabecalho.length > 0 && (
        <div className="mb-8 rounded-xl border border-gray-200 bg-white p-4">
          <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-400">Diretores e Gerentes</p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {cabecalho.map(({ person, nucleos: nomes }) => {
              const full = peopleById.get(person.id);
              return (
                <button
                  key={person.id}
                  onClick={() => full && setSelected(full)}
                  className="flex items-center gap-3 rounded-lg border border-gray-100 bg-gray-50 p-3 text-left hover:border-brand"
                >
                  <Avatar name={person.name} color={person.avatarColor} photoUrl={person.avatarUrl} size={36} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{person.name}</p>
                    <p className="truncate text-xs text-gray-400">{nomes.join(", ")}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-6">
        {[...visibleNucleos, ...(!nucleoFilter && semNucleo ? [semNucleo] : [])].map((n) => {
          const tree = buildTreeForNucleo(n);
          if (!tree) return null;
          return (
            <div key={n.id} className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">{n.name}</h2>
                {n.gerentes.length > 0 && (
                  <p className="text-xs text-gray-400">
                    Cabeça: {n.gerentes.map((g) => g.name).join(", ")}
                  </p>
                )}
              </div>
              <div className="overflow-x-auto py-2">
                <ul className="orgchart-tree">
                  {tree.roots.map((p) => (
                    <TreeNode key={p.id} person={p} byManager={tree.byManager} onSelect={setSelected} />
                  ))}
                </ul>
              </div>
            </div>
          );
        })}
        {visibleNucleos.length === 0 && <p className="text-sm text-gray-400">Ninguém encontrado.</p>}
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
