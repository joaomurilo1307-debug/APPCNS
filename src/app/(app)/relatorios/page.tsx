"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import ProgressBar from "@/components/ProgressBar";
import AuditLogPanel from "@/components/AuditLogPanel";
import BotaoExcel from "@/components/BotaoExcel";
import { indicadoresDoNucleo } from "@/lib/relatorios/nucleos";

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
  const [nucleosInfo, setNucleosInfo] = useState<{ id: string; name: string; tipo: string; pessoas: number }[]>([]);
  const [mostrarSemProjetos, setMostrarSemProjetos] = useState(false);
  const [nivel, setNivel] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/relatorios/projects").then((r) => r.json()).then(setProjects).catch(() => {});
    fetch("/api/users/me").then((r) => r.json()).then((me) => setNivel(me.nivelHierarquico ?? null)).catch(() => {});
  }, []);

  const isDiretoria = role === "ADMIN" || role === "DIRETOR" || nivel === "DIRETORIA";

  useEffect(() => {
    if (!isDiretoria) return;
    fetch("/api/nucleos").then((r) => r.json()).then((data) => {
      if (!Array.isArray(data)) return;
      setNucleoNames(data.map((n: any) => n.name));
      setNucleosInfo(data.map((n: any) => ({ id: n.id, name: n.name, tipo: n.tipo ?? "SETOR", pessoas: Array.isArray(n.membros) ? n.membros.length : 0 })));
    }).catch(() => {});
  }, [isDiretoria]);

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-gray-500">Indicadores de cada projeto e, para diretoria, dos núcleos.</p>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-600">Projetos</h2>
        <BotaoExcel
          arquivo="relatorio-projetos"
          desabilitado={projects.length === 0}
          gerar={() => [{
            nome: "Projetos",
            colunas: [
              { titulo: "Projeto", largura: 44 }, { titulo: "Situação", largura: 14 }, { titulo: "Equipe", largura: 28 }, { titulo: "Núcleos", largura: 30 }, { titulo: "Diretores", largura: 30 }, { titulo: "Coordenadores", largura: 30 },
              { titulo: "Andamento", tipo: "percentual" }, { titulo: "Tarefas", tipo: "inteiro" }, { titulo: "A fazer", tipo: "inteiro" }, { titulo: "Fazendo", tipo: "inteiro" }, { titulo: "Bloqueadas", tipo: "inteiro" },
              { titulo: "Feitas", tipo: "inteiro" }, { titulo: "Atrasadas", tipo: "inteiro" }, { titulo: "Horas", tipo: "numero" }, { titulo: "Custo (R$)", tipo: "moeda" },
            ],
            linhas: projects.map((p) => [
              p.name, statusLabel[p.status] ?? p.status, p.team.name, p.nucleos.map((n) => n.name).join(", "), p.diretores.map((d) => d.name).join(", "), p.coordenadores.map((c) => c.name).join(", "),
              p.percentComplete / 100, p.taskCount, p.taskCounts.A_FAZER ?? 0, p.taskCounts.FAZENDO ?? 0, p.taskCounts.BLOQUEADO ?? 0, p.taskCounts.FEITO ?? 0, p.overdueCount, p.totalHours, p.totalCost,
            ]),
          },
          ...(nucleosInfo.length > 0 ? [{
            nome: "Núcleos",
            colunas: [
              { titulo: "Núcleo", largura: 40 }, { titulo: "Tipo", largura: 10 }, { titulo: "Pessoas", tipo: "inteiro" as const }, { titulo: "Projetos", tipo: "inteiro" as const }, { titulo: "Em andamento", tipo: "inteiro" as const },
              { titulo: "Tarefas", tipo: "inteiro" as const }, { titulo: "Feitas", tipo: "inteiro" as const }, { titulo: "Bloqueadas", tipo: "inteiro" as const }, { titulo: "Atrasadas", tipo: "inteiro" as const },
              { titulo: "Andamento", tipo: "percentual" as const }, { titulo: "Horas", tipo: "numero" as const },
            ],
            linhas: nucleosInfo.map((n) => {
              const i = indicadoresDoNucleo(n.id, projects);
              return [n.name, n.tipo === "CONTRATO" ? "Contrato" : "Setor", n.pessoas, i.projetos, i.emAndamento, i.tarefas, i.feitas, i.bloqueadas, i.atrasadas, i.andamento, i.horas];
            }),
          }] : []),
        ]}
        />
      </div>
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-600">Núcleos</h2>
            <label className="flex items-center gap-1.5 text-xs text-gray-500">
              <input type="checkbox" checked={mostrarSemProjetos} onChange={(e) => setMostrarSemProjetos(e.target.checked)} />
              mostrar também os núcleos sem projetos
            </label>
          </div>
          <div className="mb-10 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {nucleosInfo
              .map((n) => ({ n, i: indicadoresDoNucleo(n.id, projects) }))
              .filter(({ i }) => mostrarSemProjetos || i.projetos > 0)
              .sort((a, b) => b.i.projetos - a.i.projetos || a.n.name.localeCompare(b.n.name, "pt-BR"))
              .map(({ n, i }) => (
                <div key={n.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-semibold leading-tight">{n.name}</p>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${n.tipo === "CONTRATO" ? "bg-amber-50 text-amber-800" : "bg-slate-100 text-slate-600"}`}>{n.tipo === "CONTRATO" ? "Contrato" : "Setor"}</span>
                  </div>
                  <p className="mt-1 text-xs text-gray-400">{n.pessoas} pessoa(s) · {i.projetos} projeto(s){i.emAndamento > 0 ? ` (${i.emAndamento} em andamento)` : ""}</p>
                  {i.tarefas > 0 ? (
                    <>
                      <div className="mt-3"><ProgressBar percent={Math.round(i.andamento * 100)} /></div>
                      <p className="mt-1 text-xs text-gray-500">{i.feitas} de {i.tarefas} tarefas feitas</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                        {i.atrasadas > 0 && <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">{i.atrasadas} atrasada(s)</span>}
                        {i.bloqueadas > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{i.bloqueadas} bloqueada(s)</span>}
                        {i.horas > 0 && <span className="text-gray-500">⏱ {fmtHours(i.horas)}</span>}
                      </div>
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-gray-400">{i.projetos > 0 ? "Projetos sem tarefas ainda." : "Nenhum projeto ligado a este núcleo."}</p>
                  )}
                </div>
              ))}
            {nucleosInfo.length === 0 && <p className="text-sm text-gray-400">Nenhum núcleo cadastrado.</p>}
            {nucleosInfo.length > 0 && !mostrarSemProjetos && nucleosInfo.every((n) => indicadoresDoNucleo(n.id, projects).projetos === 0) && (
              <p className="text-sm text-gray-400">Nenhum núcleo tem projeto ligado ainda. Associe projetos aos núcleos na tela Núcleos.</p>
            )}
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
