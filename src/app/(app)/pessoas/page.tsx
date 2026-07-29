"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import Avatar from "@/components/Avatar";
import { generateJitsiRoomUrl } from "@/lib/jitsi";
import { buildCallMessage } from "@/lib/callMessage";
import { setActiveChat } from "@/lib/activeChat";

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
  gestorImediato: { id: string; name: string } | null;
  nucleo: { id: string; name: string } | null;
};

type Nucleo = { id: string; name: string };
type ProjectOption = { id: string; name: string; team: { id: string; name: string } };
type GoalOption = { id: string; title: string };

const nivelLabel: Record<string, string> = {
  DIRETORIA: "Diretoria",
  GERENCIA: "Gerência",
  COORDENACAO: "Coordenação",
  COLABORADOR: "Colaborador",
};

export default function PessoasPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isAdmin = role === "ADMIN";
  const canAssignGoal = role === "ADMIN" || role === "DIRETOR";

  const [people, setPeople] = useState<Person[]>([]);
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [goals, setGoals] = useState<GoalOption[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Person | null>(null);
  const [feedback, setFeedback] = useState("");

  const [nucleoChoice, setNucleoChoice] = useState("");
  const [nivelChoice, setNivelChoice] = useState("");
  const [gestorChoice, setGestorChoice] = useState("");
  const [cargoValue, setCargoValue] = useState("");
  const [projectChoice, setProjectChoice] = useState("");
  const [goalChoice, setGoalChoice] = useState("");

  useEffect(() => {
    fetch("/api/organograma").then((r) => r.json()).then(setPeople).catch(() => {});
    fetch("/api/nucleos").then((r) => r.json()).then((data) => setNucleos(data.map((n: any) => ({ id: n.id, name: n.name })))).catch(() => {});
    fetch("/api/projects").then((r) => r.json()).then(setProjects).catch(() => {});
    fetch("/api/goals").then((r) => r.json()).then((data) => setGoals(data.map((g: any) => ({ id: g.id, title: g.title })))).catch(() => {});
  }, []);

  const q = search.trim().toLowerCase();
  const filtered = q ? people.filter((p) => p.name.toLowerCase().includes(q)) : people;

  const subordinados = selected ? people.filter((p) => p.gestorImediato?.id === selected.id) : [];

  function openPerson(p: Person) {
    setSelected(p);
    setFeedback("");
    setNucleoChoice(p.nucleo?.id ?? "");
    setNivelChoice(p.nivelHierarquico ?? "");
    setGestorChoice(p.gestorImediato?.id ?? "");
    setCargoValue(p.cargo ?? "");
    setProjectChoice("");
    setGoalChoice("");
  }

  async function handleSaveHierarquia() {
    if (!selected) return;
    const res = await fetch(`/api/users/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nucleoId: nucleoChoice || null,
        nivelHierarquico: nivelChoice || null,
        gestorImediatoId: gestorChoice || null,
        cargo: cargoValue || undefined,
      }),
    });
    setFeedback(res.ok ? "Hierarquia atualizada." : "Não foi possível salvar.");
    if (res.ok) {
      const fresh = await (await fetch("/api/organograma")).json();
      setPeople(fresh);
      const updated = fresh.find((p: Person) => p.id === selected.id);
      if (updated) setSelected(updated);
    }
  }

  async function handleAddToProject() {
    if (!selected || !projectChoice) return;
    const project = projects.find((p) => p.id === projectChoice);
    if (!project) return;
    const res = await fetch(`/api/teams/${project.team.id}/members`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId: selected.id, role: "MEMBRO" }),
    });
    setFeedback(res.ok ? `Adicionado à equipe do projeto "${project.name}".` : "Sem permissão para adicionar a essa equipe.");
  }

  async function handleAssignGoal() {
    if (!selected || !goalChoice) return;
    const res = await fetch(`/api/goals/${goalChoice}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assignedUserId: selected.id }),
    });
    setFeedback(res.ok ? "Pessoa associada à meta." : "Não foi possível associar à meta.");
  }

  async function handleStartChat() {
    if (!selected) return;
    setActiveChat({ type: "direct", id: selected.id, name: selected.name, avatarColor: selected.avatarColor });
    setSelected(null);
  }

  async function handleStartCall() {
    if (!selected) return;
    const url = generateJitsiRoomUrl(selected.name);
    const body = buildCallMessage(url);
    await fetch(`/api/messages/direct/${selected.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body }),
    });
    window.open(url, "_blank");
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Buscar pessoas</h1>
        <p className="text-sm text-gray-500">Encontre qualquer pessoa da empresa e aja direto: núcleo, projeto, meta, chat ou chamada.</p>
      </div>

      <input
        autoFocus
        placeholder="Buscar por nome..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="mb-4 w-full max-w-md rounded-md border border-gray-300 px-3 py-2 text-sm"
      />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((p) => (
          <button
            key={p.id}
            onClick={() => openPerson(p)}
            className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white p-3 text-left shadow-sm hover:border-brand hover:shadow-md"
          >
            <Avatar name={p.name} color={p.avatarColor} photoUrl={p.avatarUrl} size={36} />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.name}</p>
              <p className="truncate text-xs text-gray-400">
                {p.cargo || (p.nivelHierarquico ? nivelLabel[p.nivelHierarquico] : null) || "—"}
                {p.nucleo && ` · ${p.nucleo.name}`}
              </p>
            </div>
          </button>
        ))}
        {filtered.length === 0 && <p className="text-sm text-gray-400">Ninguém encontrado.</p>}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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

            <dl className="mb-4 grid grid-cols-3 gap-y-2 text-sm">
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

            <div className="mb-4 flex flex-wrap gap-2">
              <button onClick={handleStartChat} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
                💬 Iniciar chat
              </button>
              <button onClick={handleStartCall} className="rounded-md bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand/20">
                📹 Iniciar chamada
              </button>
              <Link
                href={`/organograma?pessoa=${encodeURIComponent(selected.name)}`}
                onClick={() => setSelected(null)}
                className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                🌳 Ver no organograma
              </Link>
            </div>

            {(selected.gestorImediato || subordinados.length > 0) && (
              <div className="mb-4 rounded-lg border border-gray-100 bg-gray-50 p-3">
                <p className="mb-2 text-xs font-semibold text-gray-400">Posição na hierarquia</p>
                <div className="flex flex-col items-center gap-1">
                  {selected.gestorImediato && (
                    <>
                      <div className="flex flex-col items-center gap-1 opacity-70">
                        <Avatar name={selected.gestorImediato.name} color="#6b7280" size={26} />
                        <span className="text-[11px] text-gray-500">{selected.gestorImediato.name}</span>
                      </div>
                      <span className="h-3 w-px bg-gray-300" />
                    </>
                  )}
                  <div className="flex flex-col items-center gap-1 rounded-md bg-white px-2 py-1 shadow-sm">
                    <Avatar name={selected.name} color={selected.avatarColor} size={30} />
                    <span className="text-xs font-medium">{selected.name}</span>
                  </div>
                  {subordinados.length > 0 && (
                    <>
                      <span className="h-3 w-px bg-gray-300" />
                      <div className="flex flex-wrap justify-center gap-3">
                        {subordinados.map((s) => (
                          <div key={s.id} className="flex flex-col items-center gap-1">
                            <Avatar name={s.name} color={s.avatarColor} size={24} />
                            <span className="text-[11px] text-gray-500">{s.name}</span>
                          </div>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
              {isAdmin && (
                <div className="rounded-lg border border-gray-200 p-3">
                  <p className="mb-2 text-xs font-semibold text-gray-500">Editar hierarquia</p>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                      Núcleo
                      <select
                        value={nucleoChoice}
                        onChange={(e) => setNucleoChoice(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">Sem núcleo</option>
                        {nucleos.map((n) => (
                          <option key={n.id} value={n.id}>{n.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                      Nível hierárquico
                      <select
                        value={nivelChoice}
                        onChange={(e) => setNivelChoice(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">Sem nível</option>
                        {Object.entries(nivelLabel).map(([v, l]) => (
                          <option key={v} value={v}>{l}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                      Gestor imediato
                      <select
                        value={gestorChoice}
                        onChange={(e) => setGestorChoice(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                      >
                        <option value="">Ninguém</option>
                        {people.filter((p) => p.id !== selected.id).map((p) => (
                          <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                      </select>
                    </label>
                    <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                      Cargo
                      <input
                        value={cargoValue}
                        onChange={(e) => setCargoValue(e.target.value)}
                        className="rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                      />
                    </label>
                  </div>
                  <button
                    onClick={handleSaveHierarquia}
                    className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark"
                  >
                    Salvar hierarquia
                  </button>
                </div>
              )}

              <div className="flex items-center gap-2">
                <select
                  value={projectChoice}
                  onChange={(e) => setProjectChoice(e.target.value)}
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                >
                  <option value="">Selecione um projeto</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                <button onClick={handleAddToProject} disabled={!projectChoice} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40">
                  Adicionar ao projeto
                </button>
              </div>

              {canAssignGoal && (
                <div className="flex items-center gap-2">
                  <select
                    value={goalChoice}
                    onChange={(e) => setGoalChoice(e.target.value)}
                    className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs"
                  >
                    <option value="">Selecione uma meta</option>
                    {goals.map((g) => (
                      <option key={g.id} value={g.id}>{g.title}</option>
                    ))}
                  </select>
                  <button onClick={handleAssignGoal} disabled={!goalChoice} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-40">
                    Associar à meta
                  </button>
                </div>
              )}

              {feedback && <p className="text-xs text-gray-500">{feedback}</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
