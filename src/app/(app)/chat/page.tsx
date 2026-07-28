"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import LinkedText from "@/components/LinkedText";
import { generateJitsiRoomUrl } from "@/lib/jitsi";
import { buildCallMessage } from "@/lib/callMessage";
import { setActiveChat, getActiveChat } from "@/lib/activeChat";

type Contact = { id: string; name: string; avatarColor: string; role: string; online: boolean };
type Team = { id: string; name: string };
type DirectMsg = { id: string; senderId: string; receiverId: string; body: string; createdAt: string };
type TeamMsg = { id: string; senderId: string; body: string; createdAt: string; sender: { id: string; name: string; avatarColor: string } };
type Unread = { direct: Record<string, number>; team: Record<string, number> };

type Selection = { type: "direct"; id: string } | { type: "team"; id: string } | null;

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

  return (
    <div className="flex h-[calc(100vh-4rem)] gap-4">
      <div className="flex w-72 shrink-0 flex-col overflow-y-auto rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-3">
          <p className="text-xs font-semibold text-gray-500">Equipes</p>
        </div>
        {teams.map((t) => (
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
        {contacts.map((c) => (
          <button
            key={c.id}
            onClick={() => setSelected({ type: "direct", id: c.id })}
            className={`flex items-center gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50 ${
              selected?.type === "direct" && selected.id === c.id ? "bg-brand/10 text-brand-dark" : ""
            }`}
          >
            <span className="relative shrink-0">
              <Avatar name={c.name} color={c.avatarColor} size={26} />
              <span
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white ${
                  c.online ? "bg-green-500" : "bg-gray-300"
                }`}
              />
            </span>
            <span className="flex-1 truncate">{c.name}</span>
            {unread.direct[c.id] > 0 && (
              <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">{unread.direct[c.id]}</span>
            )}
          </button>
        ))}
        {contacts.length === 0 && teams.length === 0 && (
          <p className="p-3 text-xs text-gray-400">Nenhum contato disponível ainda.</p>
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
  );
}
