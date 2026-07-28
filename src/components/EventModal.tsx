"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { eventTypeLabel, meetingTypeLabel } from "@/lib/calendarColors";

type Project = { id: string; name: string };
type Member = { id: string; name: string };

type EventDetail = {
  id: string;
  title: string;
  description: string | null;
  type: string;
  meetingType: string | null;
  onlineMeetingProvider: string;
  onlineMeetingUrl: string | null;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
  projectId: string | null;
  creator: { id: string; name: string };
  attendees: { user: { id: string; name: string }; status: string }[];
};

const rsvpLabel: Record<string, string> = {
  PENDENTE: "Pendente",
  APROVADO: "Aceitou",
  REJEITADO: "Recusou",
};

const rsvpStyle: Record<string, string> = {
  PENDENTE: "text-gray-400",
  APROVADO: "text-green-600",
  REJEITADO: "text-red-500",
};

function toLocalInput(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function EventModal({
  eventId,
  initialStart,
  projects,
  members,
  currentUserId,
  onClose,
  onChanged,
}: {
  eventId?: string;
  initialStart?: Date;
  projects: Project[];
  members: Member[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [loaded, setLoaded] = useState(!eventId);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [type, setType] = useState("COMPROMISSO");
  const [meetingType, setMeetingType] = useState("");
  const [onlineMeetingProvider, setOnlineMeetingProvider] = useState("NENHUM");
  const [onlineMeetingUrl, setOnlineMeetingUrl] = useState<string | null>(null);
  const [start, setStart] = useState(() => toLocalInput(initialStart ?? new Date()));
  const [end, setEnd] = useState("");
  const [allDay, setAllDay] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [attendeeStatuses, setAttendeeStatuses] = useState<Record<string, string>>({});
  const [creatorId, setCreatorId] = useState(currentUserId);
  const [canEdit, setCanEdit] = useState(true);
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const isPrivileged = role === "ADMIN" || role === "GESTOR_PROJETO";

  useEffect(() => {
    if (!eventId) return;
    fetch(`/api/events/${eventId}`)
      .then((r) => r.json())
      .then((e: EventDetail) => {
        setTitle(e.title);
        setDescription(e.description ?? "");
        setType(e.type);
        setMeetingType(e.meetingType ?? "");
        setOnlineMeetingProvider(e.onlineMeetingProvider ?? "NENHUM");
        setOnlineMeetingUrl(e.onlineMeetingUrl ?? null);
        setStart(toLocalInput(new Date(e.startAt)));
        setEnd(e.endAt ? toLocalInput(new Date(e.endAt)) : "");
        setAllDay(e.allDay);
        setProjectId(e.projectId ?? "");
        setAttendeeIds(e.attendees.map((a) => a.user.id));
        setAttendeeStatuses(Object.fromEntries(e.attendees.map((a) => [a.user.id, a.status])));
        setCreatorId(e.creator.id);
        setCanEdit(e.creator.id === currentUserId || isPrivileged);
        setLoaded(true);
      });
  }, [eventId, currentUserId]);

  function toggleAttendee(id: string) {
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const body = {
      title,
      description: description || undefined,
      type,
      meetingType: type === "REUNIAO" ? meetingType || null : null,
      onlineMeetingProvider,
      startAt: new Date(start).toISOString(),
      endAt: end ? new Date(end).toISOString() : null,
      allDay,
      projectId: projectId || null,
      attendeeIds,
    };
    if (eventId) {
      await fetch(`/api/events/${eventId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } else {
      await fetch("/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    }
    onChanged();
    onClose();
  }

  async function handleDelete() {
    if (!eventId) return;
    if (!confirm("Excluir este evento?")) return;
    await fetch(`/api/events/${eventId}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  if (!loaded) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{eventId ? "Editar evento" : "Novo evento"}</h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <input
          required
          disabled={!canEdit}
          placeholder="Título"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-3 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
        />

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Tipo
            <select
              disabled={!canEdit}
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
            >
              {Object.entries(eventTypeLabel).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Projeto (opcional)
            <select
              disabled={!canEdit}
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
            >
              <option value="">Nenhum</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          {type === "REUNIAO" && (
            <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-500">
              Tipo de reunião
              <select
                disabled={!canEdit}
                value={meetingType}
                onChange={(e) => setMeetingType(e.target.value)}
                className="rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                <option value="">Selecione...</option>
                {Object.entries(meetingTypeLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
          )}
          <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-500">
            Vídeo da reunião
            <select
              disabled={!canEdit}
              value={onlineMeetingProvider}
              onChange={(e) => setOnlineMeetingProvider(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
            >
              <option value="NENHUM">Nenhum</option>
              <option value="TEAMS">Microsoft Teams</option>
              <option value="JITSI">Videochamada (Jitsi Meet)</option>
              <option value="GOOGLE_MEET">Google Meet</option>
            </select>
          </label>
          {onlineMeetingProvider === "TEAMS" && (
            <div className="col-span-2 text-xs">
              {onlineMeetingUrl ? (
                <a href={onlineMeetingUrl} target="_blank" rel="noreferrer" className="text-brand-dark underline">
                  Entrar na reunião do Teams
                </a>
              ) : (
                <p className="text-gray-400">
                  O link é gerado ao salvar (precisa ter conectado o Outlook em Calendário → Conectar Outlook).
                </p>
              )}
            </div>
          )}
          {onlineMeetingProvider === "JITSI" && (
            <div className="col-span-2 text-xs">
              {onlineMeetingUrl ? (
                <a href={onlineMeetingUrl} target="_blank" rel="noreferrer" className="text-brand-dark underline">
                  Entrar na videochamada
                </a>
              ) : (
                <p className="text-gray-400">O link é gerado automaticamente ao salvar — sem login, entra direto.</p>
              )}
            </div>
          )}
          {onlineMeetingProvider === "GOOGLE_MEET" && (
            <p className="col-span-2 text-xs text-amber-600">
              Integração real com Google Meet ainda não configurada (precisaria de Google Workspace). Use "Videochamada (Jitsi Meet)" — funciona igual, sem login.
            </p>
          )}
        </div>

        <label className="mb-3 flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" disabled={!canEdit} checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          Dia inteiro
        </label>

        <div className="mb-3 grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Início
            <input
              type={allDay ? "date" : "datetime-local"}
              disabled={!canEdit}
              required
              value={allDay ? start.slice(0, 10) : start}
              onChange={(e) => setStart(allDay ? `${e.target.value}T00:00` : e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-gray-500">
            Fim (opcional)
            <input
              type={allDay ? "date" : "datetime-local"}
              disabled={!canEdit}
              value={allDay ? end.slice(0, 10) : end}
              onChange={(e) => setEnd(allDay ? `${e.target.value}T00:00` : e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
            />
          </label>
        </div>

        <textarea
          disabled={!canEdit}
          placeholder="Descrição (opcional)"
          rows={2}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className="mb-3 rounded-md border border-gray-300 px-3 py-2 text-sm disabled:bg-gray-50"
        />

        <div className="mb-4">
          <p className="mb-1 text-xs text-gray-500">Participantes</p>
          <div className="flex max-h-32 flex-col gap-1 overflow-y-auto rounded-md border border-gray-200 p-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  disabled={!canEdit}
                  checked={attendeeIds.includes(m.id)}
                  onChange={() => toggleAttendee(m.id)}
                />
                <span className="flex-1">{m.name}</span>
                {attendeeIds.includes(m.id) && attendeeStatuses[m.id] && (
                  <span className={`text-xs ${rsvpStyle[attendeeStatuses[m.id]]}`}>
                    {rsvpLabel[attendeeStatuses[m.id]]}
                  </span>
                )}
              </label>
            ))}
            {members.length === 0 && <p className="text-xs text-gray-400">Nenhum colega disponível.</p>}
          </div>
        </div>

        <div className="flex items-center justify-between">
          {eventId && canEdit ? (
            <button type="button" onClick={handleDelete} className="rounded-md px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
              Excluir evento
            </button>
          ) : <span />}
          {canEdit && (
            <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
              Salvar
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
