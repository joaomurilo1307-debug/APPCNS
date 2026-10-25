"use client";

import { useEffect, useMemo, useState } from "react";
import GanttChart from "@/components/GanttChart";
import BotaoExcel from "@/components/BotaoExcel";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";
import { buildWbsHierarchy } from "@/lib/wbs";
import { resumirGrupo } from "@/lib/ganttResumo";
import type { AbaExcel } from "@/lib/exportarExcel";
import { ROTULO_SAUDE } from "@/lib/projetos/saude";
import type { SaudeDoProjeto } from "@/components/projetos/SeloSaude";

// dados de cada projeto (da lista de Projetos) que o Gantt geral usa para o semaforo e para filtrar por nucleo e contrato
type MetaProjeto = { id: string; name: string; owner?: { id: string; name: string } | null; saude?: SaudeDoProjeto; nucleos?: { id: string; name: string }[]; contrato?: { codccu: string; nome: string | null } | null; startDate?: string | null };

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
  const [metas, setMetas] = useState<Record<string, MetaProjeto>>({});
  const [nucleoId, setNucleoId] = useState("");
  const [codccu, setCodccu] = useState("");
  const [saude, setSaude] = useState("");
  const [ordem, setOrdem] = useState<"nome" | "saude" | "inicio">("nome");

  async function load() {
    const res = await fetch("/api/tarefas/resumo");
    const dados = await res.json().catch(() => null);
    if (res.ok && Array.isArray(dados)) setTasks(dados); // resposta de erro (ex.: sessao expirada) nao apaga o grafico
    const rp = await fetch("/api/projects");
    const lista = await rp.json().catch(() => null);
    if (rp.ok && Array.isArray(lista)) setMetas(Object.fromEntries((lista as MetaProjeto[]).map((p) => [p.id, p])));
  }

  useEffect(() => {
    load();
  }, []);
  useAtualizarAoVoltar(load);

  // projetos de mesmo nome (ex.: o projeto de teste de cada pessoa) viram blocos separados: o nome ganha o responsavel
  const nomesRepetidos = useMemo(() => {
    const c = new Map<string, number>();
    for (const m of Object.values(metas)) c.set(m.name, (c.get(m.name) ?? 0) + 1);
    return new Set(Array.from(c).filter(([, n]) => n > 1).map(([nome]) => nome));
  }, [metas]);
  const rotulo = (p: { id: string; name: string } | null | undefined) =>
    !p ? "Sem projeto" : nomesRepetidos.has(p.name) ? `${p.name} · ${metas[p.id]?.owner?.name ?? p.id.slice(-4)}` : p.name;

  const projects = Array.from(
    new Map(tasks.filter((t) => t.project).map((t) => [t.project!.id, t.project!])).values()
  ).sort((a, b) => rotulo(a).localeCompare(rotulo(b), "pt-BR"));

  // filtros do Gantt geral (so' mudam o que aparece): projeto, nucleo, contrato e saude
  const metasVisiveis = projects.map((p) => metas[p.id]).filter((m): m is MetaProjeto => !!m);
  const nucleosOpcoes = Array.from(new Map(metasVisiveis.flatMap((m) => (m.nucleos ?? []).map((n) => [n.id, n.name] as const))).entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const contratosOpcoes = Array.from(new Map(metasVisiveis.filter((m) => m.contrato).map((m) => [m.contrato!.codccu, m.contrato!.nome ? `${m.contrato!.codccu} · ${m.contrato!.nome}` : m.contrato!.codccu] as const)).entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR", { numeric: true }));
  const passaNosFiltros = (t: Task) => {
    if (projectId && t.project?.id !== projectId) return false;
    const m = t.project ? metas[t.project.id] : undefined;
    if (nucleoId && !(m?.nucleos ?? []).some((n) => n.id === nucleoId)) return false;
    if (codccu && m?.contrato?.codccu !== codccu) return false;
    if (saude && (m?.saude?.nivel ?? "SEM_DADOS") !== saude) return false;
    return true;
  };
  const filtered = tasks.filter(passaNosFiltros);
  const filtrando = !!(nucleoId || codccu || saude);
  // ordem dos blocos: o grafico agrupa pela ordem em que os projetos aparecem nas tarefas
  const GRAVIDADE: Record<string, number> = { ATRASADO: 0, ATENCAO: 1, NO_PRAZO: 2, SEM_DADOS: 3, CONCLUIDO: 4 };
  const chaveDaOrdem = (t: Task) => {
    const nome = rotulo(t.project);
    const m = t.project ? metas[t.project.id] : undefined;
    if (ordem === "saude") return `${GRAVIDADE[m?.saude?.nivel ?? "SEM_DADOS"] ?? 9}|${nome}`;
    if (ordem === "inicio") return `${m?.startDate ?? "9999"}|${nome}`;
    return nome;
  };
  const ordenadas = useMemo(
    () => [...filtered].sort((a, b) => chaveDaOrdem(a).localeCompare(chaveDaOrdem(b), "pt-BR")),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [filtered.length, tasks, metas, ordem, projectId, nucleoId, codccu, saude],
  );
  const withGroupLabel = ordenadas.map((t) => ({ ...t, groupLabel: rotulo(t.project) }));
  const groupMeta = Object.fromEntries(metasVisiveis.map((m) => [rotulo(m), { saude: m.saude, href: `/projetos/${m.id}` }]));

  const rotuloStatus: Record<string, string> = { A_FAZER: "A fazer", FAZENDO: "Fazendo", BLOQUEADO: "Bloqueado", FEITO: "Feito" };
  // planilha: uma aba com todas as tarefas do filtro (com a numeracao WBS de cada projeto) e uma aba-resumo por projeto
  function montarAbas(): AbaExcel[] {
    const porProjeto = new Map<string, Task[]>();
    for (const t of filtered) {
      const k = rotulo(t.project);
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
        {!projectId && nucleosOpcoes.length > 0 && (
          <select value={nucleoId} onChange={(e) => setNucleoId(e.target.value)} aria-label="Núcleo" className="max-w-[12rem] rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos os núcleos</option>
            {nucleosOpcoes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        )}
        {!projectId && contratosOpcoes.length > 0 && (
          <select value={codccu} onChange={(e) => setCodccu(e.target.value)} aria-label="Contrato" className="max-w-[13rem] rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Todos os contratos</option>
            {contratosOpcoes.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
          </select>
        )}
        {!projectId && (
          <select value={saude} onChange={(e) => setSaude(e.target.value)} aria-label="Saúde" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="">Toda saúde</option>
            {(["ATRASADO", "ATENCAO", "NO_PRAZO", "CONCLUIDO", "SEM_DADOS"] as const).map((n) => <option key={n} value={n}>{ROTULO_SAUDE[n]}</option>)}
          </select>
        )}
        {!projectId && (
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as "nome" | "saude" | "inicio")} aria-label="Ordem dos projetos" className="rounded-md border border-gray-300 px-2 py-1.5 text-sm">
            <option value="nome">Ordem: nome</option>
            <option value="saude">Ordem: pior saúde primeiro</option>
            <option value="inicio">Ordem: início do projeto</option>
          </select>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Projeto:
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          >
            <option value="">Todos os projetos</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{rotulo(p)}</option>
            ))}
          </select>
        </label>
        </div>
      </div>
      <p className="mb-6 text-sm text-gray-500">
        Só aparecem tarefas com data de início e prazo preenchidos.
        {!projectId && " Cada projeto aparece como um bloco com a saúde, a barra-resumo, o andamento e os atrasos; clique no nome para abrir as tarefas."}
        {filtrando && <button onClick={() => { setNucleoId(""); setCodccu(""); setSaude(""); }} className="ml-2 text-xs text-gray-400 underline hover:text-gray-600">limpar filtros</button>}
      </p>

      <GanttChart tasks={withGroupLabel} groupByProject={!projectId} onChanged={load} groupMeta={groupMeta} />
    </div>
  );
}
