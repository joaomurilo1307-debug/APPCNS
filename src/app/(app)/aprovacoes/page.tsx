"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import { eventTypeLabel } from "@/lib/calendarColors";

type Project = {
  id: string;
  name: string;
  description: string | null;
  approvalStatus: string;
  team: { name: string };
  owner: { name: string };
};

type ApprovalRequest = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  createdAt: string;
  requester: { id: string; name: string; avatarColor: string; avatarUrl: string | null };
  approver: { id: string; name: string; avatarColor: string; avatarUrl: string | null };
};

type PersonOption = { id: string; name: string };

type Invite = {
  id: string;
  status: string;
  event: {
    id: string;
    title: string;
    type: string;
    startAt: string;
    endAt: string | null;
    allDay: boolean;
    onlineMeetingUrl: string | null;
    creator: { id: string; name: string; avatarColor: string | null };
    project: { id: string; name: string } | null;
  };
};

const statusStyle: Record<string, string> = {
  PENDENTE: "bg-yellow-100 text-yellow-700",
  APROVADO: "bg-green-100 text-green-700",
  REJEITADO: "bg-red-100 text-red-700",
  NAO_REQUER: "bg-gray-100 text-gray-500",
};

export default function AprovacoesPage() {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id;
  const role = (session?.user as any)?.role;
  const canApproveProjects = role === "ADMIN" || role === "APROVADOR";
  const canCreateRequest = role && role !== "CLIENTE" && role !== "VISUALIZADOR";

  const [projects, setProjects] = useState<Project[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [people, setPeople] = useState<PersonOption[]>([]);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqTitle, setReqTitle] = useState("");
  const [reqDescription, setReqDescription] = useState("");
  const [reqApproverId, setReqApproverId] = useState("");
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqSaving, setReqSaving] = useState(false);

  async function loadProjects() {
    if (!canApproveProjects) return;
    const res = await fetch("/api/projects");
    setProjects(await res.json());
  }

  async function loadInvites() {
    const res = await fetch("/api/events/invites");
    if (res.ok) setInvites(await res.json());
  }

  async function loadRequests() {
    const res = await fetch("/api/approval-requests");
    if (res.ok) setRequests(await res.json());
  }

  async function loadPeople() {
    const res = await fetch("/api/presence");
    if (res.ok) setPeople((await res.json()).filter((p: PersonOption) => p.id !== myId));
  }

  useEffect(() => {
    loadProjects();
    loadInvites();
    loadRequests();
    loadPeople();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canApproveProjects, myId]);

  async function handleCreateRequest(e: React.FormEvent) {
    e.preventDefault();
    setReqError(null);
    if (!reqApproverId) {
      setReqError("Escolha quem vai aprovar.");
      return;
    }
    setReqSaving(true);
    const res = await fetch("/api/approval-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: reqTitle, description: reqDescription || undefined, approverId: reqApproverId }),
    });
    setReqSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setReqError(typeof data?.error === "string" ? data.error : "Não foi possível criar a solicitação.");
      return;
    }
    setReqTitle("");
    setReqDescription("");
    setReqApproverId("");
    setShowRequestForm(false);
    loadRequests();
  }

  async function decideRequest(id: string, decision: "APROVADO" | "REJEITADO") {
    await fetch(`/api/approval-requests/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: decision }),
    });
    setRequests((prev) => prev.map((r) => (r.id === id ? { ...r, status: decision } : r)));
  }

  async function decideProject(id: string, decision: "APROVADO" | "REJEITADO") {
    await fetch(`/api/projects/${id}/approve`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    loadProjects();
  }

  async function decideInvite(id: string, decision: "APROVADO" | "REJEITADO") {
    await fetch(`/api/event-attendees/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: decision }),
    });
    setInvites((prev) => prev.map((i) => (i.id === id ? { ...i, status: decision } : i)));
  }

  const pendentes = projects.filter((p) => p.approvalStatus === "PENDENTE");
  const decididos = projects.filter((p) => p.approvalStatus === "APROVADO" || p.approvalStatus === "REJEITADO");

  const invitesPendentes = invites.filter((i) => i.status === "PENDENTE");
  const invitesDecididos = invites.filter((i) => i.status !== "PENDENTE");

  const requestsParaMim = requests.filter((r) => r.approver.id === myId);
  const requestsPendentesParaMim = requestsParaMim.filter((r) => r.status === "PENDENTE");
  const requestsDecididasParaMim = requestsParaMim.filter((r) => r.status !== "PENDENTE");
  const requestsEnviadasPorMim = requests.filter((r) => r.requester.id === myId);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Aprovações</h1>
          <p className="text-sm text-gray-500">Convites de reunião, projetos e solicitações aguardando decisão.</p>
        </div>
        {canCreateRequest && (
          <button
            onClick={() => setShowRequestForm((v) => !v)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Nova solicitação
          </button>
        )}
      </div>

      {showRequestForm && (
        <form onSubmit={handleCreateRequest} className="mb-8 flex flex-col gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input
            required
            placeholder="Título (ex: Aprovação de requisição no Senior)"
            value={reqTitle}
            onChange={(e) => setReqTitle(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Descrição (opcional)"
            rows={2}
            value={reqDescription}
            onChange={(e) => setReqDescription(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <select
            required
            value={reqApproverId}
            onChange={(e) => setReqApproverId(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">Quem vai aprovar?</option>
            {people.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <div>
            <button disabled={reqSaving} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">
              Enviar solicitação
            </button>
          </div>
          {reqError && <p className="text-sm text-red-600">{reqError}</p>}
        </form>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-600">Solicitações para você decidir ({requestsPendentesParaMim.length})</h2>
      <div className="mb-8 grid gap-3">
        {requestsPendentesParaMim.map((r) => (
          <div key={r.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <Avatar name={r.requester.name} color={r.requester.avatarColor} photoUrl={r.requester.avatarUrl} />
              <div>
                <p className="font-medium">{r.title}</p>
                {r.description && <p className="text-xs text-gray-500">{r.description}</p>}
                <p className="text-xs text-gray-400">Pedido por {r.requester.name}</p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => decideRequest(r.id, "APROVADO")}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Aprovar
              </button>
              <button
                onClick={() => decideRequest(r.id, "REJEITADO")}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Rejeitar
              </button>
            </div>
          </div>
        ))}
        {requestsPendentesParaMim.length === 0 && <p className="text-sm text-gray-400">Nada pendente pra você decidir. 🎉</p>}
      </div>

      {requestsEnviadasPorMim.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Solicitações que você enviou</h2>
          <div className="mb-8 grid gap-2">
            {requestsEnviadasPorMim.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-2 text-sm">
                <span>{r.title} <span className="text-xs text-gray-400">· aprovador: {r.approver.name}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[r.status]}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {requestsDecididasParaMim.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Solicitações que você já decidiu</h2>
          <div className="mb-8 grid gap-2">
            {requestsDecididasParaMim.map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-2 text-sm">
                <span>{r.title} <span className="text-xs text-gray-400">· pedido por {r.requester.name}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[r.status]}`}>{r.status}</span>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mb-3 text-sm font-semibold text-gray-600">Convites de reunião ({invitesPendentes.length})</h2>
      <div className="mb-8 grid gap-3">
        {invitesPendentes.map((inv) => (
          <div key={inv.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              <Avatar name={inv.event.creator.name} color={inv.event.creator.avatarColor} />
              <div>
                <p className="font-medium">{inv.event.title}</p>
                <p className="text-xs text-gray-500">
                  {eventTypeLabel[inv.event.type] ?? inv.event.type} · Convidado por {inv.event.creator.name}
                  {inv.event.project && ` · ${inv.event.project.name}`}
                </p>
                <p className="text-xs text-gray-400">
                  {inv.event.allDay
                    ? new Date(inv.event.startAt).toLocaleDateString("pt-BR", { timeZone: "UTC" })
                    : new Date(inv.event.startAt).toLocaleString("pt-BR")}
                  {inv.event.onlineMeetingUrl && (
                    <>
                      {" · "}
                      <a href={inv.event.onlineMeetingUrl} target="_blank" rel="noreferrer" className="text-brand-dark underline">
                        link da reunião
                      </a>
                    </>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => decideInvite(inv.id, "APROVADO")}
                className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
              >
                Aceitar
              </button>
              <button
                onClick={() => decideInvite(inv.id, "REJEITADO")}
                className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Recusar
              </button>
            </div>
          </div>
        ))}
        {invitesPendentes.length === 0 && <p className="text-sm text-gray-400">Nenhum convite de reunião pendente.</p>}
      </div>

      {invitesDecididos.length > 0 && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Histórico de convites</h2>
          <div className="mb-8 grid gap-2">
            {invitesDecididos.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-2 text-sm">
                <span>{inv.event.title} <span className="text-xs text-gray-400">· {inv.event.creator.name}</span></span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[inv.status]}`}>
                  {inv.status}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {canApproveProjects && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Projetos pendentes ({pendentes.length})</h2>
          <div className="mb-8 grid gap-3">
            {pendentes.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
                <div>
                  <p className="font-medium">{p.name}</p>
                  <p className="text-xs text-gray-500">{p.team.name} · Responsável: {p.owner.name}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decideProject(p.id, "APROVADO")}
                    className="rounded-md bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-700"
                  >
                    Aprovar
                  </button>
                  <button
                    onClick={() => decideProject(p.id, "REJEITADO")}
                    className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                  >
                    Rejeitar
                  </button>
                </div>
              </div>
            ))}
            {pendentes.length === 0 && <p className="text-sm text-gray-400">Nada pendente. 🎉</p>}
          </div>

          <h2 className="mb-3 text-sm font-semibold text-gray-600">Histórico de projetos</h2>
          <div className="grid gap-2">
            {decididos.map((p) => (
              <div key={p.id} className="flex items-center justify-between rounded-lg border border-gray-100 bg-white px-4 py-2 text-sm">
                <span>{p.name}</span>
                <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyle[p.approvalStatus]}`}>
                  {p.approvalStatus}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
