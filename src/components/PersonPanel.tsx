"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "./Avatar";
import { generateJitsiRoomUrl } from "@/lib/jitsi";
import { buildCallMessage } from "@/lib/callMessage";
import { setActiveChat } from "@/lib/activeChat";

export type Person = {
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

const NODE_W = 150;

function TreeAvatar({
  person,
  x,
  role,
  onClick,
}: {
  person: { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null; nivelHierarquico: string | null };
  x: number;
  role: "gestor" | "self" | "filho";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`absolute flex flex-col items-center gap-1 rounded-lg border bg-white px-2 py-2 shadow-sm hover:shadow-md ${
        role === "self" ? "border-brand ring-2 ring-brand/30" : "border-gray-200"
      }`}
      style={{ left: x, top: role === "gestor" ? 0 : role === "self" ? 90 : 180, width: NODE_W, transform: "translateX(-50%)" }}
    >
      <Avatar name={person.name} color={person.avatarColor} photoUrl={person.avatarUrl} size={32} />
      <span className="max-w-full truncate text-xs font-medium">{person.name}</span>
      <span className="max-w-full truncate text-[10px] text-gray-400">
        {person.cargo || (person.nivelHierarquico ? nivelLabel[person.nivelHierarquico] : null) || "—"}
      </span>
    </button>
  );
}

function MiniOrgTree({ people, personId, onNavigate }: { people: Person[]; personId: string; onNavigate: (id: string) => void }) {
  const self = people.find((p) => p.id === personId);
  if (!self) return null;
  const gestor = self.gestorImediato ? people.find((p) => p.id === self.gestorImediato!.id) ?? null : null;
  const filhos = people.filter((p) => p.gestorImediato?.id === self.id);

  const spacing = 165;
  const width = Math.max(filhos.length * spacing, NODE_W + 20);
  const centerX = width / 2;
  const childXs = filhos.map((_, i) => {
    const totalW = (filhos.length - 1) * spacing;
    return centerX - totalW / 2 + i * spacing;
  });
  const height = 260;

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-100 bg-gray-50 p-3">
      <div style={{ position: "relative", width, height, margin: "0 auto" }}>
        <svg width={width} height={height} className="absolute left-0 top-0" style={{ pointerEvents: "none" }}>
          {gestor && <line x1={centerX} y1={40} x2={centerX} y2={90} stroke="#cbd5e1" strokeWidth={2} />}
          {filhos.length > 0 && (
            <>
              <line x1={centerX} y1={130} x2={centerX} y2={155} stroke="#cbd5e1" strokeWidth={2} />
              {filhos.length > 1 && (
                <line x1={childXs[0]} y1={155} x2={childXs[childXs.length - 1]} y2={155} stroke="#cbd5e1" strokeWidth={2} />
              )}
              {childXs.map((cx, i) => (
                <line key={filhos[i].id} x1={cx} y1={155} x2={cx} y2={180} stroke="#cbd5e1" strokeWidth={2} />
              ))}
            </>
          )}
        </svg>
        {gestor && <TreeAvatar person={gestor} x={centerX} role="gestor" onClick={() => onNavigate(gestor.id)} />}
        <TreeAvatar person={self} x={centerX} role="self" onClick={() => {}} />
        {filhos.map((f, i) => (
          <TreeAvatar key={f.id} person={f} x={childXs[i]} role="filho" onClick={() => onNavigate(f.id)} />
        ))}
      </div>
    </div>
  );
}

export default function PersonPanel({
  personId,
  onNavigate,
  onClose,
}: {
  personId: string;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isAdmin = role === "ADMIN";
  const canAssignGoal = role === "ADMIN" || role === "DIRETOR";

  const [people, setPeople] = useState<Person[]>([]);
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [goals, setGoals] = useState<GoalOption[]>([]);
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

  const selected = people.find((p) => p.id === personId) ?? null;

  useEffect(() => {
    if (!selected) return;
    setFeedback("");
    setNucleoChoice(selected.nucleo?.id ?? "");
    setNivelChoice(selected.nivelHierarquico ?? "");
    setGestorChoice(selected.gestorImediato?.id ?? "");
    setCargoValue(selected.cargo ?? "");
    setProjectChoice("");
    setGoalChoice("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personId, people.length]);

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
      fetch("/api/organograma").then((r) => r.json()).then(setPeople).catch(() => {});
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
    onClose();
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

  if (!selected) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
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
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
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
        </dl>

        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={handleStartChat} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
            💬 Iniciar chat
          </button>
          <button onClick={handleStartCall} className="rounded-md bg-brand/10 px-3 py-1.5 text-xs font-medium text-brand-dark hover:bg-brand/20">
            📹 Iniciar chamada
          </button>
        </div>

        {people.length > 0 && (
          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-gray-400">Posição na hierarquia (clique pra navegar)</p>
            <MiniOrgTree people={people} personId={selected.id} onNavigate={onNavigate} />
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-gray-100 pt-3">
          {isAdmin && (
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="mb-2 text-xs font-semibold text-gray-500">Editar hierarquia</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                  Núcleo
                  <select value={nucleoChoice} onChange={(e) => setNucleoChoice(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs">
                    <option value="">Sem núcleo</option>
                    {nucleos.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                  Nível hierárquico
                  <select value={nivelChoice} onChange={(e) => setNivelChoice(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs">
                    <option value="">Sem nível</option>
                    {Object.entries(nivelLabel).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                  Gestor imediato
                  <select value={gestorChoice} onChange={(e) => setGestorChoice(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs">
                    <option value="">Ninguém</option>
                    {people.filter((p) => p.id !== selected.id).map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                  Cargo
                  <input value={cargoValue} onChange={(e) => setCargoValue(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5 text-xs" />
                </label>
              </div>
              <button onClick={handleSaveHierarquia} className="mt-2 w-full rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
                Salvar hierarquia
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <select value={projectChoice} onChange={(e) => setProjectChoice(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs">
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
              <select value={goalChoice} onChange={(e) => setGoalChoice(e.target.value)} className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-xs">
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
  );
}
