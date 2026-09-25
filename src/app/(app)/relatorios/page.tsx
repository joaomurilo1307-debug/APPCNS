"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ProgressBar from "@/components/ProgressBar";
import AuditLogPanel from "@/components/AuditLogPanel";

type ProjectInsight = {
  id: string;
  name: string;
  status: string;
  team: { id: string; name: string };
  nucleos: { id: string; name: string }[];
  diretores: { id: string; name: string }[];
  coordenadores: { id: string; name: string }[];
  percentComplete: number;
  taskCount: number;
  taskCounts: Record<string, number>;
  overdueCount: number;
  totalHours: number;
  totalCost: number;
};

const statusLabel: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
};

function fmtHours(h: number) {
  return h.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "h";
}
function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function RelatoriosPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;

  const [projects, setProjects] = useState<ProjectInsight[]>([]);
  const [nucleoNames, setNucleoNames] = useState<string[]>([]);
  const [nivel, setNivel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/relatorios/projects").then((r) => r.json()).then(setProjects).catch(() => {});
    fetch("/api/users/me").then((r) => r.json()).then((me) => setNivel(me.nivelHierarquico ?? null)).catch(() => {});
  }, []);

  const isDiretoria = role === "ADMIN" || role === "DIRETOR" || nivel === "DIRETORIA";

  useEffect(() => {
    if (!isDiretoria) return;
    fetch("/api/nucleos").then((r) => r.json()).then((data) => setNucleoNames(data.map((n: any) => n.name))).catch(() => {});
  }, [isDiretoria]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-gray-500">Indicadores de cada projeto e, para diretoria, dos núcleos.</p>
      </div>

      <h2 className="mb-3 text-sm font-semibold text-gray-600">Projetos</h2>
      <div className="mb-10 grid gap-4 md:grid-cols-2">
        {projects.map((p) => (
          <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-1 flex items-center justify-between">
              <Link href={`/projetos/${p.id}`} className="font-semibold hover:text-brand-dark hover:underline">
                {p.name}
              </Link>
              <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{statusLabel[p.status]}</span>
            </div>
            <p className="mb-3 text-xs text-gray-400">
              {p.team.name}
              {p.nucleos.length > 0 && ` · ${p.nucleos.map((n) => n.name).join(", ")}`}
            </p>

            <ProgressBar percent={p.percentComplete} />

            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="font-semibold text-gray-700">{p.taskCounts.A_FAZER ?? 0}</p>
                <p className="text-gray-400">A fazer</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="font-semibold text-gray-700">{p.taskCounts.FAZENDO ?? 0}</p>
                <p className="text-gray-400">Fazendo</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="font-semibold text-gray-700">{p.taskCounts.BLOQUEADO ?? 0}</p>
                <p className="text-gray-400">Bloqueado</p>
              </div>
              <div className="rounded-lg bg-gray-50 p-2">
                <p className="font-semibold text-gray-700">{p.taskCounts.FEITO ?? 0}</p>
                <p className="text-gray-400">Feito</p>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-gray-500">
              {p.overdueCount > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">
                  {p.overdueCount} tarefa(s) atrasada(s)
                </span>
              )}
              <span>⏱ {fmtHours(p.totalHours)}</span>
              {p.totalCost > 0 && <span>💰 {fmtMoney(p.totalCost)}</span>}
            </div>

            {(p.diretores.length > 0 || p.coordenadores.length > 0) && (
              <p className="mt-3 border-t border-gray-100 pt-2 text-xs text-gray-400">
                {p.diretores.length > 0 && `Diretor(es): ${p.diretores.map((d) => d.name).join(", ")}`}
                {p.coordenadores.length > 0 && ` · Coordenador(es): ${p.coordenadores.map((c) => c.name).join(", ")}`}
              </p>
            )}
          </div>
        ))}
        {projects.length === 0 && <p className="text-sm text-gray-400">Nenhum projeto visível ainda.</p>}
      </div>

      {isDiretoria && (
        <>
          <h2 className="mb-3 text-sm font-semibold text-gray-600">Núcleos</h2>
          <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nucleoNames.map((name) => (
              <div key={name} className="rounded-xl border border-dashed border-gray-300 bg-white p-5 text-center">
                <p className="mb-2 text-sm font-medium">{name}</p>
                <p className="text-xs text-gray-400">Indicadores via Power BI — em breve.</p>
              </div>
            ))}
            {nucleoNames.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo cadastrado.</p>}
          </div>

          <div className="mb-3 border-t border-gray-200 pt-6">
            <h2 className="text-sm font-semibold text-gray-600">Rito de Gestão</h2>
            <p className="text-xs text-gray-400">Só visível para diretoria.</p>
          </div>
          <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
            🔌 Os indicadores desta seção virão de uma integração com o Power BI (projeto "Rito de Gestão" já em
            andamento fora do app). Por enquanto, os painéis abaixo são placeholders.
          </div>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nucleoNames.map((name) => (
              <div key={`rito-${name}`} className="rounded-xl border border-dashed border-gray-300 bg-white p-5">
                <p className="text-sm font-medium">{name}</p>
                <p className="mt-3 text-xs text-gray-400">📊 Painel de indicadores — aguardando Power BI.</p>
              </div>
            ))}
            {nucleoNames.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo cadastrado.</p>}
          </div>
        </>
      )}

      {role === "ADMIN" && (
        <div className="mb-3 mt-10 border-t border-gray-200 pt-6">
          <AuditLogPanel />
        </div>
      )}
    </div>
  );
}
