"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import SignOutButton from "./SignOutButton";

const baseLinks = [
  { href: "/dashboard", label: "Início", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/projetos", label: "Projetos", roles: ["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "VISUALIZADOR"] },
  { href: "/tarefas", label: "Tarefas / Rotinas", roles: ["ADMIN", "GESTOR_PROJETO", "COLABORADOR", "VISUALIZADOR"] },
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
    <aside className="flex h-screen w-56 flex-col justify-between border-r border-gray-200 bg-white p-4">
      <div>
        <h1 className="mb-6 px-2 text-lg font-semibold text-brand">Consominas</h1>
        <nav className="flex flex-col gap-1">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`rounded-md px-3 py-2 text-sm font-medium ${
                pathname?.startsWith(link.href)
                  ? "bg-brand/10 text-brand"
                  : "text-gray-600 hover:bg-gray-100"
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
