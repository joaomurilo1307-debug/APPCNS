"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import LinkedText from "@/components/LinkedText";
import { generateJitsiRoomUrl } from "@/lib/jitsi";
import { buildCallMessage } from "@/lib/callMessage";
import { setActiveChat, getActiveChat } from "@/lib/activeChat";
import { resolveStatus } from "@/lib/presenceStatus";

type Contact = { id: string; name: string; avatarColor: string; avatarUrl: string | null; cargo: string | null; role: string; online: boolean; statusManual: string | null };
type Team = { id: string; name: string };
type DirectMsg = { id: string; senderId: string; receiverId: string; body: string; createdAt: string };
type TeamMsg = { id: string; senderId: string; body: string; createdAt: string; sender: { id: string; name: string; avatarColor: string } };
type Unread = { direct: Record<string, number>; team: Record<string, number> };

type Selection = { type: "direct"; id: string } | { type: "team"; id: string } | null;

type CallLogEntry = {
  id: string;
  type: "direct" | "team";
  outgoing: boolean;
  counterpartName: string;
  teamName?: string;
  url: string | null;
  createdAt: string;
};

export default function ChatPage() {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id;

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [unread, setUnread] = useState<Unread>({ direct: {}, team: {} });
  const [selected, setSelected] = useState<Selection>(null);
  const [directMsgs, setDirectMsgs] = useState<DirectMsg[]>([]);
  const [teamMsgs, setTeamMsgs] = useState<TeamMsg[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showCallLog, setShowCallLog] = useState(false);
  const [callLog, setCallLog] = useState<CallLogEntry[]>([]);
  const [search, setSearch] = useState("");

  async function loadCallLog() {
    const res = await fetch("/api/messages/calls");
    if (res.ok) setCallLog(await res.json());
  }

  async function loadContacts() {
    const res = await fetch("/api/presence");
    if (res.ok) setContacts((await res.json()).filter((c: Contact) => c.id !== myId));
  }

  async function loadTeams() {
    const res = await fetch("/api/teams");
    if (res.ok) setTeams(await res.json());
  }

  async function loadUnread() {
    const res = await fetch("/api/messages/unread");
    if (res.ok) setUnread(await res.json());
  }

  useEffect(() => {
    loadTeams();
    loadUnread();
    const t = setInterval(loadContacts, 15000);
    const u = setInterval(loadUnread, 6000);
    loadContacts();
    return () => {
      clearInterval(t);
      clearInterval(u);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myId]);

  useEffect(() => {
    if (selected) return;
    const saved = getActiveChat();
    if (saved) setSelected({ type: saved.type, id: saved.id } as Selection);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selected) return;
    if (selected.type === "direct") {
      const c = contacts.find((c) => c.id === selected.id);
      if (c) setActiveChat({ type: "direct", id: c.id, name: c.name, avatarColor: c.avatarColor });
    } else {
      const t = teams.find((t) => t.id === selected.id);
      if (t) setActiveChat({ type: "team", id: t.id, name: t.name });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, contacts, teams]);

  async function loadConversation() {
    if (!selected) return;
    if (selected.type === "direct") {
      const res = await fetch(`/api/messages/direct/${selected.id}`);
      if (res.ok) setDirectMsgs(await res.json());
    } else {
      const res = await fetch(`/api/messages/team/${selected.id}`);
      if (res.ok) setTeamMsgs(await res.json());
    }
    loadUnread();
  }

  useEffect(() => {
    loadConversation();
    const iv = setInterval(loadConversation, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [directMsgs, teamMsgs]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !selected) return;
    const text = draft;
    setDraft("");
    if (selected.type === "direct") {
      await fetch(`/api/messages/direct/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
    } else {
      await fetch(`/api/messages/team/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
    }
    loadConversation();
  }

  async function startCall() {
    if (!selected) return;
    const roomName =
      selected.type === "team"
        ? teams.find((t) => t.id === selected.id)?.name ?? "Equipe"
        : contacts.find((c) => c.id === selected.id)?.name ?? "Chamada";
    const url = generateJitsiRoomUrl(roomName);
    const body = buildCallMessage(url);
    if (selected.type === "direct") {
      await fetch(`/api/messages/direct/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    } else {
      await fetch(`/api/messages/team/${selected.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
    }
    loadConversation();
    window.open(url, "_blank");
  }

  const currentMessages: { id: string; senderId: string; senderName?: string; body: string; createdAt: string }[] =
    selected?.type === "direct"
      ? directMsgs
      : teamMsgs.map((m) => ({ id: m.id, senderId: m.senderId, senderName: m.sender.name, body: m.body, createdAt: m.createdAt }));

  const selectedName =
    selected?.type === "direct"
      ? contacts.find((c) => c.id === selected.id)?.name
      : teams.find((t) => t.id === selected?.id)?.name;

  const searchLower = search.trim().toLowerCase();
  const filteredContacts = searchLower ? contacts.filter((c) => c.name.toLowerCase().includes(searchLower)) : contacts;
  const filteredTeams = searchLower ? teams.filter((t) => t.name.toLowerCase().includes(searchLower)) : teams;

  return (
    <div className="flex h-[calc(100vh-7.5rem)] flex-col gap-3">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Chat</h1>
        <button
          onClick={() => {
            setShowCallLog(true);
            loadCallLog();
          }}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
        >
          📞 Histórico de chamadas
        </button>
      </div>
      <div className="flex flex-1 gap-4 overflow-hidden">
      <div className="flex w-72 shrink-0 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar pessoa ou equipe..."
            className="w-full rounded-md border border-gray-300 px-2.5 py-1.5 text-sm"
          />
        </div>
        <div className="border-b border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-500">Equipes</p>
        </div>
        {filteredTeams.map((t) => (
          <button
            key={t.id}
            onClick={() => setSelected({ type: "team", id: t.id })}
            className={`flex items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50 ${
              selected?.type === "team" && selected.id === t.id ? "bg-brand/10 text-brand-dark" : ""
            }`}
          >
            <span># {t.name}</span>
            {unread.team[t.id] > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread.team[t.id]}</span>
            )}
          </button>
        ))}

        <div className="border-b border-t border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-500">Pessoas</p>
        </div>
        {filteredContacts.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected({ type: "direct", id: c.id })}
            className={`flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
              selected?.type === "direct" && selected.id === c.id ? "bg-brand/10 text-brand-dark" : ""
            }`}
          >
            <span className="relative shrink-0">
              <Avatar name={c.name} color={c.avatarColor} photoUrl={c.avatarUrl} size={26} />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                  resolveStatus(c.online, c.statusManual).color
                }`}
              />
            </span>
            <span className="min-w-0 flex-1 truncate">
              {c.name}
              {c.cargo && <span className="block text-xs text-gray-400">{c.cargo}</span>}
            </span>
            {unread.direct[c.id] > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread.direct[c.id]}</span>
            )}
          </button>
        ))}
        {filteredContacts.length === 0 && filteredTeams.length === 0 && (
          <p className="p-3 text-xs text-gray-400">
            {searchLower ? "Nenhum resultado para essa busca." : "Nenhum contato disponível ainda."}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col rounded-xl border border-gray-200 bg-white">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-gray-400">
            Selecione uma equipe ou pessoa para conversar.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between border-b border-gray-100 p-3 text-sm font-semibold">
              <span>{selected.type === "team" ? `# ${selectedName}` : selectedName}</span>
              <button
                type="button"
                onClick={startCall}
                title="Iniciar videochamada instantânea"
                className="rounded-md bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-dark hover:bg-brand/20"
              >
                📹 Chamada
              </button>
            </div>
            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-2">
                {currentMessages.map((m) => {
                  const mine = m.senderId === myId;
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-brand text-white" : "bg-gray-100 text-gray-800"}`}>
                        {selected.type === "team" && !mine && (
                          <p className="mb-0.5 text-[11px] font-semibold opacity-70">{m.senderName}</p>
                        )}
                        <p className="whitespace-pre-wrap break-words"><LinkedText text={m.body} /></p>
                        <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>
                          {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </p>
                      </div>
                    </div>
                  );
                })}
                {currentMessages.length === 0 && <p className="text-xs text-gray-400">Nenhuma mensagem ainda. Diga oi!</p>}
              </div>
            </div>
            <form onSubmit={handleSend} className="flex gap-2 border-t border-gray-100 p-3">
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Escreva uma mensagem..."
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
              <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Enviar</button>
            </form>
          </>
        )}
      </div>
      </div>

      {showCallLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={() => setShowCallLog(false)}>
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 p-4">
              <h2 className="text-sm font-semibold">📞 Histórico de chamadas</h2>
              <button onClick={() => setShowCallLog(false)} className="text-gray-400 hover:text-gray-700">✕</button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {callLog.length === 0 && <p className="p-3 text-sm text-gray-400">Nenhuma chamada registrada ainda.</p>}
              <div className="flex flex-col gap-2">
                {callLog.map((c) => (
                  <div key={c.id} className="flex items-center justify-between rounded-lg border border-gray-100 p-2.5 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {c.outgoing ? "Você ligou para " : "Chamada de "}
                        {c.type === "team" ? `# ${c.teamName}` : c.counterpartName}
                      </p>
                      <p className="text-xs text-gray-400">
                        {new Date(c.createdAt).toLocaleString("pt-BR")}
                      </p>
                    </div>
                    {c.url && (
                      <a
                        href={c.url}
                        target="_blank"
                        rel="noreferrer"
                        className="shrink-0 rounded-md bg-brand/10 px-2.5 py-1 text-xs font-medium text-brand-dark hover:bg-brand/20"
                      >
                        Entrar
                      </a>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
