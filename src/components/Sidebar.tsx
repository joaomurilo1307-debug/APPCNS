"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import SignOutButton from "./SignOutButton";
import ConsominasLogo from "./ConsominasLogo";
import { playNotificationSound, playRingtone } from "@/lib/notificationSound";
import MiniChatWidget from "./MiniChatWidget";
import { useSidebar } from "./SidebarContext";
import {
  IconHome,
  IconFolders,
  IconCheckSquare,
  IconZap,
  IconBarChart,
  IconCalendar,
  IconChat,
  IconUsers,
  IconNetwork,
  IconTarget,
  IconReport,
  IconTrendingUp,
  IconCheckCircle,
  IconShieldUser,
} from "./NavIcons";

const baseLinks = [
  { href: "/dashboard", label: "Início", icon: IconHome, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/projetos", label: "Projetos", icon: IconFolders, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/tarefas", label: "Tarefas (todas)", icon: IconCheckSquare, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/sprint", label: "Sprint da Semana", icon: IconZap, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/gantt", label: "Gantt", icon: IconBarChart, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "VISUALIZADOR"] },
  { href: "/calendario", label: "Calendário", icon: IconCalendar, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/chat", label: "Chat", icon: IconChat, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/equipes", label: "Equipes", icon: IconUsers, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO"] },
  { href: "/nucleos", label: "Núcleos", icon: IconNetwork, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/metas", label: "Metas", icon: IconTarget, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/relatorios", label: "Relatórios", icon: IconReport, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/pdi", label: "PDI", icon: IconTrendingUp, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/aprovacoes", label: "Aprovações", icon: IconCheckCircle, roles: ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/usuarios", label: "Usuários", icon: IconShieldUser, roles: ["ADMIN"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const links = baseLinks.filter((l) => !role || l.roles.includes(role));
  const { open, setOpen } = useSidebar();

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

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px] lg:hidden"
          onClick={() => setOpen(false)}
        />
      )}

      <aside
        className={`glass shadow-elevated fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col justify-between border-r border-white/60 p-4 transition-transform duration-200 ease-in-out lg:static lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-b from-brand/[0.04] via-transparent to-accent/[0.03]" />
        <div>
          <div className="mb-5 flex items-center justify-between gap-2 border-b border-gray-100 px-1 pb-4">
            <ConsominasLogo size={30} />
            <button
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600 lg:hidden"
              aria-label="Fechar menu"
            >
              ✕
            </button>
          </div>
          <nav className="flex flex-col gap-0.5">
            {links.map((link) => {
              const Icon = link.icon;
              const active = pathname?.startsWith(link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`group relative flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                    active
                      ? "bg-gradient-to-r from-brand to-brand-dark text-white shadow-soft"
                      : "text-gray-600 hover:bg-brand/[0.06] hover:text-brand-dark"
                  }`}
                >
                  <Icon className={`shrink-0 transition-colors ${active ? "text-white" : "text-gray-400 group-hover:text-brand"}`} />
                  <span className="flex-1 truncate">{link.label}</span>
                  {link.href === "/chat" && unreadTotal > 0 && (
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                        active ? "bg-white/25 text-white" : "bg-accent text-white"
                      }`}
                    >
                      {unreadTotal > 99 ? "99+" : unreadTotal}
                    </span>
                  )}
                </Link>
              );
            })}
          </nav>
        </div>
        <SignOutButton />
      </aside>

      {meetingToast && (
        <div className="shadow-elevated fixed bottom-6 right-6 z-[100] w-80 rounded-2xl border border-white/60 bg-white/95 p-4 backdrop-blur">
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
        <div className="shadow-elevated fixed bottom-32 right-6 z-[100] w-80 animate-pulse rounded-2xl border border-green-200 bg-white/95 p-4 backdrop-blur">
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
