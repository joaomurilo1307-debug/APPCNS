"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

const links = [
  { href: "/dashboard", label: "Início" },
  { href: "/projetos", label: "Projetos" },
  { href: "/tarefas", label: "Tarefas / Rotinas" },
  { href: "/equipes", label: "Equipes" },
];

export default function Sidebar() {
  const pathname = usePathname();

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
      <button
        onClick={() => signOut({ callbackUrl: "/login" })}
        className="rounded-md px-3 py-2 text-left text-sm text-gray-500 hover:bg-gray-100"
      >
        Sair
      </button>
    </aside>
  );
}
