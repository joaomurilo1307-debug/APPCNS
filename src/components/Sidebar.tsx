"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import SignOutButton from "./SignOutButton";
import ConsominasLogo from "./ConsominasLogo";
import { playNotificationSound, playRingtone } from "@/lib/notificationSound";
import MiniChatWidget from "./MiniChatWidget";

const baseLinks = [
  { href: "/dashboard", label: "Início", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/projetos", label: "Projetos", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/tarefas", label: "Tarefas (todas)", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/sprint", label: "Sprint da Semana", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/gantt", label: "Gantt", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "VISUALIZADOR"] },
  { href: "/calendario", label: "Calendário", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/chat", label: "Chat", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/pessoas", label: "Buscar pessoas", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/equipes", label: "Equipes", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO"] },
  { href: "/nucleos", label: "Núcleos", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/organograma", label: "Organograma", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/metas", label: "Metas", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/pdi", label: "PDI", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/aprovacoes", label: "Aprovações", roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/usuarios", label: "Usuários", roles: ["ADMIN"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const links = baseLinks.filter((l) => !role || l.roles.includes(role));

  const [unreadTotal, setUnreadTotal] = useState(0);
  const prevTotal = useRef<number | null>(null);
  const [meetingToast, setMeetingToast] = useState<{ title: string; when: string } | null>(null);
  const alertedEventIds = useRef<Set<string>>(new Set());
  const [callToast, setCallToast] = useState<{ id: string; fromName: string; label: string; url: string | null } | null>(null);
  const alertedCallIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!session) return;

    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      Notification.requestPermission().catch(() => {});
    }

    async function heartbeat() {
      fetch("/api/presence/heartbeat", { method: "POST" }).catch(() => {});
    }
    async function pollUnread() {
      try {
        const res = await fetch("/api/messages/unread");
        if (!res.ok) return;
        const data = await res.json();
        if (prevTotal.current !== null && data.total > prevTotal.current) playNotificationSound();
        prevTotal.current = data.total;
        setUnreadTotal(data.total);
      } catch {
        // rede instavel; tenta de novo no proximo ciclo
      }
    }
    async function pollUpcomingMeetings() {
      try {
        const from = new Date(Date.now() - 60_000).toISOString();
        const to = new Date(Date.now() + 10 * 60_000).toISOString();
        const res = await fetch(`/api/events?from=${from}&to=${to}`);
        if (!res.ok) return;
        const events: { id: string; title: string; startAt: string; allDay: boolean }[] = await res.json();
        for (const ev of events) {
          if (ev.allDay || alertedEventIds.current.has(ev.id)) continue;
          alertedEventIds.current.add(ev.id);
          const when = new Date(ev.startAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
          playNotificationSound();
          setMeetingToast({ title: ev.title, when });
          setTimeout(() => setMeetingToast((cur) => (cur?.title === ev.title ? null : cur)), 20000);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Reunião em breve", { body: `${ev.title} às ${when}` });
          }
        }
      } catch {
        // rede instavel; tenta de novo no proximo ciclo
      }
    }

    async function pollIncomingCalls() {
      try {
        const res = await fetch("/api/messages/incoming-calls");
        if (!res.ok) return;
        const calls: { id: string; type: "direct" | "team"; fromName: string; teamName?: string; url: string | null }[] =
          await res.json();
        for (const call of calls) {
          if (alertedCallIds.current.has(call.id)) continue;
          alertedCallIds.current.add(call.id);
          playRingtone();
          setCallToast({
            id: call.id,
            fromName: call.fromName,
            label: call.type === "team" ? `${call.fromName} · #${call.teamName}` : call.fromName,
            url: call.url,
          });
          setTimeout(() => setCallToast((cur) => (cur?.id === call.id ? null : cur)), 30000);
          if (typeof Notification !== "undefined" && Notification.permission === "granted") {
            new Notification("Chamada recebida", { body: `${call.fromName} está te chamando` });
          }
        }
      } catch {
        // rede instavel; tenta de novo no proximo ciclo
      }
    }

    heartbeat();
    pollUnread();
    pollUpcomingMeetings();
    pollIncomingCalls();
    const hb = setInterval(heartbeat, 25000);
    const pu = setInterval(pollUnread, 6000);
    const pm = setInterval(pollUpcomingMeetings, 30000);
    const pc = setInterval(pollIncomingCalls, 5000);
    return () => {
      clearInterval(hb);
      clearInterval(pu);
      clearInterval(pm);
      clearInterval(pc);
    };
  }, [session]);

  useEffect(() => {
    if (!callToast) return;
    const ring = setInterval(() => playRingtone(), 1800);
    return () => clearInterval(ring);
  }, [callToast?.id]);

  return (
    <>
      <aside className="flex h-screen w-60 flex-col justify-between border-r border-gray-100 bg-white p-4 shadow-sm">
        <div>
          <div className="mb-6 border-b border-gray-100 px-2 pb-4">
            <ConsominasLogo size={30} />
          </div>
          <nav className="flex flex-col gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                  pathname?.startsWith(link.href)
                    ? "bg-gradient-to-r from-brand/15 to-transparent text-brand-dark border-l-2 border-brand"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>{link.label}</span>
                {link.href === "/chat" && unreadTotal > 0 && (
                  <span className="rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                    {unreadTotal > 99 ? "99+" : unreadTotal}
                  </span>
                )}
              </Link>
            ))}
          </nav>
        </div>
        <SignOutButton />
      </aside>

      {meetingToast && (
        <div className="fixed bottom-6 right-6 z-[100] w-80 rounded-xl border border-gray-200 bg-white p-4 shadow-xl">
          <p className="mb-1 text-xs font-semibold text-brand-dark">🔔 Reunião em breve</p>
          <p className="text-sm font-medium">{meetingToast.title}</p>
          <p className="text-xs text-gray-400">às {meetingToast.when}</p>
          <button
            onClick={() => setMeetingToast(null)}
            className="absolute right-2 top-2 text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </div>
      )}

      {callToast && (
        <div className="fixed bottom-32 right-6 z-[100] w-80 animate-pulse rounded-xl border border-green-200 bg-white p-4 shadow-xl">
          <p className="mb-1 text-xs font-semibold text-green-700">📞 Chamada de {callToast.fromName}</p>
          <p className="text-sm text-gray-500">{callToast.label}</p>
          <div className="mt-2 flex gap-2">
            {callToast.url && (
              <a
                href={callToast.url}
                target="_blank"
                rel="noreferrer"
                onClick={() => setCallToast(null)}
                className="rounded-md bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
              >
                Atender
              </a>
            )}
            <button
              onClick={() => setCallToast(null)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50"
            >
              Dispensar
            </button>
          </div>
        </div>
      )}

      <MiniChatWidget />
    </>
  );
}
