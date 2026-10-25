"use client";

import { useEffect, useState } from "react";
import GanttChart from "@/components/GanttChart";
import BotaoExcel from "@/components/BotaoExcel";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";
import { buildWbsHierarchy } from "@/lib/wbs";
import { resumirGrupo } from "@/lib/ganttResumo";
import type { AbaExcel } from "@/lib/exportarExcel";

type Task = {
  id: string;
  title: string;
  startDate: string | null;
  dueDate: string | null;
  status: string;
  isEntrega?: boolean;
  parentTaskId?: string | null;
  assignee?: { name: string } | null;
  project: { id: string; name: string } | null;
};

export default function GanttPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [projectId, setProjectId] = useState("");

  async function load() {
    const res = await fetch("/api/tasks");
    const dados = await res.json().catch(() => null);
    if (res.ok && Array.isArray(dados)) setTasks(dados); // resposta de erro (ex.: sessao expirada) nao apaga o grafico
  }

  useEffect(() => {
    load();
  }, []);
  useAtualizarAoVoltar(load);

  const projects = Array.from(
    new Map(tasks.filter((t) => t.project).map((t) => [t.project!.id, t.project!])).values()
  ).sort((a, b) => a.name.localeCompare(b.name));

  const filtered = projectId ? tasks.filter((t) => t.project?.id === projectId) : tasks;
  const withGroupLabel = filtered.map((t) => ({ ...t, groupLabel: t.project?.name ?? "Sem projeto" }));

  const rotuloStatus: Record<string, string> = { A_FAZER: "A fazer", FAZENDO: "Fazendo", BLOQUEADO: "Bloqueado", FEITO: "Feito" };
  // planilha: uma aba com todas as tarefas do filtro (com a numeracao WBS de cada projeto) e uma aba-resumo por projeto
  function montarAbas(): AbaExcel[] {
    const porProjeto = new Map<string, Task[]>();
    for (const t of filtered) {
      const k = t.project?.name ?? "Sem projeto";
      if (!porProjeto.has(k)) porProjeto.set(k, []);
      porProjeto.get(k)!.push(t);
    }
    const linhas: (string | number | null)[][] = [];
    const resumo: (string | number | null)[][] = [];
    porProjeto.forEach((ts, nome) => {
      for (const { task: t, wbs, depth } of buildWbsHierarchy(ts)) {
        linhas.push([nome, wbs, (depth > 0 ? "↳ " : "") + t.title, t.startDate, t.dueDate, rotuloStatus[t.status] ?? t.status, t.assignee?.name ?? "", t.isEntrega ? "Sim" : ""]);
      }
      const r = resumirGrupo(ts);
      resumo.push([nome, r.inicio, r.fim, r.total, r.feitas, r.atrasadas, r.total ? r.feitas / r.total : 0]);
    });
    return [
      { nome: "Tarefas", colunas: [{ titulo: "Projeto", largura: 36 }, { titulo: "WBS", largura: 8 }, { titulo: "Tarefa", largura: 52 }, { titulo: "Início", tipo: "data" }, { titulo: "Prazo", tipo: "data" }, { titulo: "Situação", largura: 12 }, { titulo: "Responsável", largura: 26 }, { titulo: "Entrega", largura: 9 }], linhas },
      { nome: "Resumo por projeto", colunas: [{ titulo: "Projeto", largura: 40 }, { titulo: "Início", tipo: "data" }, { titulo: "Fim previsto", tipo: "data" }, { titulo: "Tarefas", tipo: "inteiro" }, { titulo: "Feitas", tipo: "inteiro" }, { titulo: "Atrasadas", tipo: "inteiro" }, { titulo: "Andamento", tipo: "percentual" }], linhas: resumo },
    ];
  }

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Gantt</h1>
        <div className="flex flex-wrap items-center gap-3">
        <BotaoExcel arquivo={projectId ? "gantt-projeto" : "gantt-geral"} gerar={montarAbas} desabilitado={filtered.length === 0} />
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Projeto:
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>
        </div>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Só aparecem tarefas com data de início e prazo preenchidos.
        {!projectId && " Cada projeto aparece como um bloco com a barra-resumo, o andamento e os atrasos; clique no nome para abrir as tarefas."}
      </p>

      <GanttChart tasks={withGroupLabel} groupByProject={!projectId} onChanged={load} />
    </div>
  );
}
