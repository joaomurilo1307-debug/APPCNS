"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import SignOutButton from "./SignOutButton";
import ConsominasLogo from "./ConsominasLogo";

const baseLinks = [
  { href: "/dashboard", label: "Início", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/projetos", label: "Projetos", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/tarefas", label: "Tarefas (todas)", roles: ["ADMIN", "GESTOR_PROJETO", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/sprint", label: "Sprint da Semana", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/gantt", label: "Gantt", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "VISUALIZADOR"] },
  { href: "/calendario", label: "Calendário", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/equipes", label: "Equipes", roles: ["ADMIN", "GESTOR_PROJETO"] },
  { href: "/aprovacoes", label: "Aprovações", roles: ["ADMIN", "APROVADOR"] },
  { href: "/usuarios", label: "Usuários", roles: ["ADMIN"] },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const links = baseLinks.filter((l) => !role || l.roles.includes(role));

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
              className={`rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                pathname?.startsWith(link.href)
                  ? "bg-gradient-to-r from-brand/15 to-transparent text-brand-dark border-l-2 border-brand"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
      <SignOutButton />
    </aside>
  );
}
