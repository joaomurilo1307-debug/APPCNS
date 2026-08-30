"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { href: "/almoxarifado", label: "Dashboard", exact: true },
  { href: "/almoxarifado/estoque", label: "Estoque" },
  { href: "/almoxarifado/movimentacoes", label: "Movimentações" },
  { href: "/almoxarifado/colaboradores", label: "Colaboradores" },
  { href: "/almoxarifado/catalogo", label: "Catálogo por função" },
  { href: "/almoxarifado/importar", label: "Importar planilha" },
];

export default function AlmoxarifadoLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Almoxarifado — EPI, EPC e Fardamento</h1>
        <p className="text-sm text-gray-500">
          Estoque mínimo, cadastro de colaboradores por contrato e movimentações de entrada/saída, tudo em um só lugar.
        </p>
      </div>

      <div className="mb-6 flex flex-wrap gap-1 border-b border-gray-200">
        {tabs.map((t) => {
          const active = t.exact ? pathname === t.href : pathname?.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-t-lg px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "border-b-2 border-brand text-brand-dark"
                  : "border-b-2 border-transparent text-gray-500 hover:text-brand-dark"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {children}
    </div>
  );
}
