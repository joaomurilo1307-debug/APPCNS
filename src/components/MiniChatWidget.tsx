"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import Avatar from "./Avatar";
import LinkedText from "./LinkedText";
import { ActiveChatInfo, clearActiveChat, getActiveChat, subscribeActiveChat } from "@/lib/activeChat";

type Msg = { id: string; senderId: string; body: string; createdAt: string };

export default function MiniChatWidget() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id;

  const [chat, setChat] = useState<ActiveChatInfo | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setChat(getActiveChat());
    return subscribeActiveChat(() => setChat(getActiveChat()));
  }, []);

  async function load() {
    if (!chat) return;
    const url = chat.type === "direct" ? `/api/messages/direct/${chat.id}` : `/api/messages/team/${chat.id}`;
    const res = await fetch(url);
    if (res.ok) setMessages(await res.json());
  }

  useEffect(() => {
    if (!expanded || !chat) return;
    load();
    const iv = setInterval(load, 4000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, chat?.type, chat?.id]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim() || !chat) return;
    const body = draft;
    setDraft("");
    const url = chat.type === "direct" ? `/api/messages/direct/${chat.id}` : `/api/messages/team/${chat.id}`;
    await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
    load();
  }

  if (!chat || pathname?.startsWith("/chat")) return null;

  return (
    <div className="fixed bottom-6 left-6 z-[90] w-72 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 bg-brand/10 px-3 py-2 text-left"
      >
        {chat.type === "direct" && <Avatar name={chat.name} color={chat.avatarColor} photoUrl={chat.avatarUrl} size={22} />}
        <span className="flex-1 truncate text-sm font-medium text-brand-dark">
          {chat.type === "team" ? `# ${chat.name}` : chat.name}
        </span>
        <span className="text-xs text-gray-400">{expanded ? "▾" : "▴"}</span>
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            clearActiveChat();
            setChat(null);
          }}
          className="ml-1 text-gray-400 hover:text-gray-700"
        >
          ✕
        </span>
      </button>

      {expanded && (
        <>
          <div ref={scrollRef} className="flex h-64 flex-col gap-2 overflow-y-auto p-3">
            {messages.map((m) => {
              const mine = m.senderId === myId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs ${mine ? "bg-brand text-white" : "bg-gray-100 text-gray-800"}`}>
                    <p className="whitespace-pre-wrap break-words"><LinkedText text={m.body} /></p>
                  </div>
                </div>
              );
            })}
            {messages.length === 0 && <p className="text-xs text-gray-400">Nenhuma mensagem ainda.</p>}
          </div>
          <form onSubmit={handleSend} className="flex gap-1 border-t border-gray-100 p-2">
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Mensagem..."
              className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-xs"
            />
            <button className="rounded-md bg-brand px-2.5 py-1 text-xs font-medium text-white hover:bg-brand-dark">
              Enviar
            </button>
          </form>
        </>
      )}
    </div>
  );
}
