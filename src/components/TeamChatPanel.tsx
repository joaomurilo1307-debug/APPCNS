"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import LinkedText from "@/components/LinkedText";

type ChatAttachment = { id: string; fileName: string; fileSize: number };
type TeamMsg = {
  id: string;
  senderId: string;
  body: string;
  createdAt: string;
  sender: { id: string; name: string; avatarColor: string };
  attachments: ChatAttachment[];
};

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

export default function TeamChatPanel({ teamId, heightClass = "h-[560px]" }: { teamId: string; heightClass?: string }) {
  const { data: session } = useSession();
  const myId = (session?.user as any)?.id;

  const [messages, setMessages] = useState<TeamMsg[]>([]);
  const [draft, setDraft] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(`/api/messages/team/${teamId}`);
    if (res.ok) setMessages(await res.json());
  }

  useEffect(() => {
    load();
    const iv = setInterval(load, 3000);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!draft.trim()) return;
    const text = draft;
    setDraft("");
    setError(null);
    const res = await fetch(`/api/messages/team/${teamId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: text }),
    });
    if (!res.ok) setError("Não foi possível enviar a mensagem.");
    load();
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api/messages/team/${teamId}/attachment`, { method: "POST", body: fd });
    setUploading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Não foi possível enviar o arquivo.");
    }
    e.target.value = "";
    load();
  }

  return (
    <div className={`flex ${heightClass} flex-col rounded-2xl border border-gray-100 bg-white shadow-elevated`}>
      {error && (
        <div className="flex items-center justify-between gap-2 border-b border-rose-100 bg-rose-50 px-3 py-1.5 text-xs text-rose-700">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)} className="text-rose-400 hover:text-rose-700">✕</button>
        </div>
      )}
      <div ref={scrollRef} className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-2">
          {messages.map((m) => {
            const mine = m.senderId === myId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[70%] rounded-xl px-3 py-2 text-sm ${mine ? "bg-brand text-white" : "bg-gray-100 text-gray-800"}`}>
                  {!mine && <p className="mb-0.5 text-[11px] font-semibold opacity-70">{m.sender.name}</p>}
                  <p className="whitespace-pre-wrap break-words">
                    <LinkedText text={m.body} />
                  </p>
                  {m.attachments.map((a) => (
                    <a
                      key={a.id}
                      href={`/api/attachments/${a.id}`}
                      className={`mt-1 flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:underline ${
                        mine ? "bg-white/15 text-white" : "bg-white text-brand-dark"
                      }`}
                    >
                      📎 {a.fileName} <span className="opacity-60">({fmtSize(a.fileSize)})</span>
                    </a>
                  ))}
                  <p className={`mt-1 text-[10px] ${mine ? "text-white/70" : "text-gray-400"}`}>
                    {new Date(m.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })}
          {messages.length === 0 && <p className="text-xs text-gray-400">Nenhuma mensagem ainda. Diga oi!</p>}
        </div>
      </div>
      <form onSubmit={handleSend} className="flex items-center gap-2 border-t border-gray-100 p-3">
        <input ref={fileInputRef} type="file" onChange={handleFileSelected} className="hidden" />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          title="Anexar arquivo"
          className="shrink-0 rounded-full border border-gray-200 px-2.5 py-2 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {uploading ? "…" : "📎"}
        </button>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Escreva uma mensagem..."
          className="flex-1 rounded-full border border-gray-300 px-3 py-2 text-sm"
        />
        <button className="shrink-0 rounded-full bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
          Enviar
        </button>
      </form>
    </div>
  );
}
