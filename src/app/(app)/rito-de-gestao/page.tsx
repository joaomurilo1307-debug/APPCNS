"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

type ProjectRow = {
  id: string;
  name: string;
  nucleos: { id: string; name: string }[];
};

export default function RitoDeGestaoPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [nucleoNames, setNucleoNames] = useState<string[]>([]);
  const [nivel, setNivel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/relatorios/projects").then((r) => r.json()).then(setProjects).catch(() => {});
    fetch("/api/users/me").then((r) => r.json()).then((me) => setNivel(me.nivelHierarquico ?? null)).catch(() => {});
  }, []);

  const canSeeNucleoPanels = role === "ADMIN" || role === "DIRETOR" || nivel === "GERENCIA" || nivel === "DIRETORIA";

  useEffect(() => {
    if (!canSeeNucleoPanels) return;
    fetch("/api/nucleos").then((r) => r.json()).then((data) => setNucleoNames(data.map((n: any) => n.name))).catch(() => {});
  }, [canSeeNucleoPanels]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Rito de Gestão</h1>
        <p className="text-sm text-gray-500">
          Painéis de indicadores de projetos e núcleos. Cada gestor/coordenador vê o seu escopo; diretoria e
          gerência veem tudo da sua alçada.
        </p>
      </div>

      <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
        🔌 Os indicadores desta aba virão de uma integração com o Power BI (projeto "Rito de Gestão" já em
        andamento fora do app). Por enquanto, os painéis abaixo são placeholders — vão preencher assim que a
        integração estiver pronta.
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-600">Painéis por projeto</h2>
      <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <div key={p.id} className="rounded-xl border border-dashed border-gray-300 bg-white p-5">
            <Link href={`/projetos/${p.id}`} className="text-sm font-medium hover:text-brand-dark hover:underline">
              {p.name}
            </Link>
            {p.nucleos.length > 0 && (
              <p className="mt-0.5 text-xs text-gray-400">{p.nucleos.map((n) => n.name).join(", ")}</p>
            )}
            <p className="mt-3 text-xs text-gray-400">📊 Painel de indicadores — aguardando Power BI.</p>
          </div>
        ))}
        {projects.length === 0 && <p className="text-sm text-gray-400">Nenhum projeto no seu escopo ainda.</p>}
      </div>

      {canSeeNucleoPanels && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Painéis por núcleo</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nucleoNames.map((name) => (
              <div key={name} className="rounded-xl border border-dashed border-gray-300 bg-white p-5">
                <p className="text-sm font-medium">{name}</p>
                <p className="mt-3 text-xs text-gray-400">📊 Painel de indicadores — aguardando Power BI.</p>
              </div>
            ))}
            {nucleoNames.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo cadastrado.</p>}
          </div>
        </>
      )}
    </div>
  );
}
