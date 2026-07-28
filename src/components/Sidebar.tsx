"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import SignOutButton from "./SignOutButton";
import ConsominasLogo from "./ConsominasLogo";
import { playNotificationSound } from "@/lib/notificationSound";

const baseLinks = [
  { href: "/dashboard", label: "Início", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/projetos", label: "Projetos", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/tarefas", label: "Tarefas (todas)", roles: ["ADMIN", "GESTOR_PROJETO", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/sprint", label: "Sprint da Semana", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/gantt", label: "Gantt", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "VISUALIZADOR"] },
  { href: "/calendario", label: "Calendário", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/chat", label: "Chat", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/equipes", label: "Equipes", roles: ["ADMIN", "GESTOR_PROJETO"] },
  { href: "/aprovacoes", label: "Aprovações", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/usuarios", label: "Usuários", roles: ["ADMIN"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const links = baseLinks.filter((l) => !role || l.roles.includes(role));

  const [unreadTotal, setUnreadTotal] = useState(0);
  const prevTotal = useRef<number | null>(null);

  useEffect(() => {
    if (!session) return;

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

    heartbeat();
    pollUnread();
    const hb = setInterval(heartbeat, 25000);
    const pu = setInterval(pollUnread, 6000);
    return () => {
      clearInterval(hb);
      clearInterval(pu);
    };
  }, [session]);

  return (
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
  );
}
