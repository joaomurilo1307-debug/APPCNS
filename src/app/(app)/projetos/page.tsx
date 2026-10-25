"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import ProgressBar from "@/components/ProgressBar";
import EscolhaDePessoas, { type PessoaOpcao } from "@/components/demandas/Pessoas";
import BotaoExcel from "@/components/BotaoExcel";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";
import type { AbaExcel } from "@/lib/exportarExcel";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  team: { id: string; name: string };
  contrato?: { codccu: string; nome: string | null } | null;
  owner: { name: string };
  approver: { name: string } | null;
  approvalStatus: string;
  startDate: string | null;
  endDate: string | null;
  _count: { tasks: number };
  percentComplete: number;
  overdueCount: number;
};

type Team = { id: string; name: string };
type Contrato = { codccu: string; nome: string };
type NucleoComGente = { id: string; name: string; membros: { id: string }[] };

const statusLabel: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
};

const statusColor: Record<string, string> = {
  PLANEJADO: "bg-gray-100 text-gray-600",
  EM_ANDAMENTO: "bg-blue-100 text-blue-700",
  PAUSADO: "bg-amber-100 text-amber-700",
  CONCLUIDO: "bg-emerald-100 text-emerald-700",
};

function fmtDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });
}

export default function ProjetosPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [name, setName] = useState("");
  const [teamId, setTeamId] = useState("");
  const [codccu, setCodccu] = useState("");
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [nucleoId, setNucleoId] = useState("");
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [opcoesPessoas, setOpcoesPessoas] = useState<PessoaOpcao[]>([]);
  const [nucleos, setNucleos] = useState<NucleoComGente[]>([]);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function load() {
    const [p, t] = await Promise.all([
      fetch("/api/projects").then((r) => r.json()),
      fetch("/api/teams").then((r) => r.json()),
    ]);
    if (Array.isArray(p)) setProjects(p); // resposta de erro (ex.: sessao expirada) nao apaga a lista
    if (Array.isArray(t)) setTeams(t);
  }

  // contratos que a pessoa ve, pessoas que podem entrar no projeto e nucleos (para incluir as pessoas de um nucleo de uma vez)
  async function loadOpcoes() {
    const [o, n, ps] = await Promise.all([
      fetch("/api/demandas/opcoes").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/nucleos").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/pessoas").then((r) => (r.ok ? r.json() : [])),
    ]);
    if (o) setContratos(o.contratos ?? []);
    setOpcoesPessoas(Array.isArray(ps) ? ps : []);
    setNucleos(Array.isArray(n) ? n : []);
  }

  useEffect(() => {
    load();
    loadOpcoes();
  }, []);
  useAtualizarAoVoltar(load);

  function incluirPessoasDoNucleo() {
    const n = nucleos.find((x) => x.id === nucleoId);
    if (n) setPessoas((atual) => Array.from(new Set([...atual, ...n.membros.map((m) => m.id)])));
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setErro(""); setCriando(true);
    const r = await fetch("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(teamId ? { name, teamId, codccu: codccu || null, nucleoId: nucleoId || null } : { name, pessoas, codccu: codccu || null, nucleoId: nucleoId || null }),
    });
    setCriando(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return setErro(typeof j.error === "string" ? j.error : "Não foi possível criar. Confira o nome (mínimo 2 letras).");
    }
    setName(""); setTeamId(""); setCodccu(""); setPessoas([]); setNucleoId("");
    setShowForm(false);
    load();
  }

  // planilha dos projetos que a pessoa enxerga (os mesmos dos cartoes), com contrato, andamento e atrasos
  function abasExcel(): AbaExcel[] {
    return [{
      nome: "Projetos",
      colunas: [
        { titulo: "Projeto", largura: 44 }, { titulo: "Situação", largura: 14 }, { titulo: "Equipe", largura: 28 }, { titulo: "Contrato (CCU)", largura: 10 }, { titulo: "Contrato", largura: 30 },
        { titulo: "Responsável", largura: 26 }, { titulo: "Aprovador", largura: 26 }, { titulo: "Situação da aprovação", largura: 18 }, { titulo: "Início", tipo: "data" }, { titulo: "Fim previsto", tipo: "data" },
        { titulo: "Tarefas", tipo: "inteiro" }, { titulo: "Atrasadas", tipo: "inteiro" }, { titulo: "Andamento", tipo: "percentual" },
      ],
      linhas: projects.map((p) => [
        p.name, statusLabel[p.status] ?? p.status, p.team?.name ?? "", p.contrato?.codccu ?? "", p.contrato?.nome ?? "", p.owner?.name ?? "", p.approver?.name ?? "", p.approver ? p.approvalStatus : "",
        p.startDate, p.endDate, p._count?.tasks ?? 0, p.overdueCount ?? 0, (p.percentComplete ?? 0) / 100,
      ]),
    }];
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projetos</h1>
        <div className="flex items-center gap-2">
          <BotaoExcel arquivo="projetos" gerar={abasExcel} desabilitado={projects.length === 0} />
          <a href="/projetos/demandas" className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">
            Demandas de projetos
          </a>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Novo projeto
          </button>
        </div>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 grid gap-3 rounded-xl border border-gray-200 bg-white p-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Nome do projeto</label>
            <input required placeholder="Ex.: Medição de dados do contrato" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Contrato</label>
            <select value={codccu} onChange={(e) => setCodccu(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="">Sem contrato (projeto interno)</option>
              {contratos.map((c) => <option key={c.codccu} value={c.codccu}>{c.codccu} · {c.nome}</option>)}
            </select>
          </div>
          {nucleos.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Núcleo (opcional)</label>
              <div className="flex gap-2">
                <select value={nucleoId} onChange={(e) => setNucleoId(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm">
                  <option value="">Nenhum</option>
                  {nucleos.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
                </select>
                <button type="button" disabled={!nucleoId || teamId !== ""} onClick={incluirPessoasDoNucleo} className="shrink-0 rounded-md border border-gray-300 px-3 py-2 text-xs font-medium hover:bg-gray-50 disabled:opacity-40">Incluir as pessoas dele</button>
              </div>
            </div>
          )}
          <div className="sm:col-span-2">
            <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Pessoas do projeto</label>
            {teamId === "" ? (
              <>
                <EscolhaDePessoas pessoas={opcoesPessoas} valor={pessoas} onChange={setPessoas} max={60} vazio="Só você por enquanto." />
                <p className="mt-1 text-xs text-gray-400">Você entra como responsável. As pessoas escolhidas formam a equipe do projeto, criada junto com ele.</p>
              </>
            ) : (
              <p className="text-xs text-gray-500">Usando a equipe escolhida abaixo; as pessoas dela já estão no projeto.</p>
            )}
          </div>
          {teams.length > 0 && (
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Ou use uma equipe que já existe (opcional)</label>
              <select value={teamId} onChange={(e) => setTeamId(e.target.value)} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm">
                <option value="">Criar a equipe com as pessoas escolhidas</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          )}
          {erro && <p className="text-sm text-red-600 sm:col-span-2">{erro}</p>}
          <div className="sm:col-span-2">
            <button disabled={criando} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{criando ? "Criando…" : "Criar projeto"}</button>
          </div>
        </form>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {projects.map((p) => (
          <Link
            key={p.id}
            href={`/projetos/${p.id}`}
            className="card-hover flex flex-col rounded-2xl border border-gray-100 bg-white p-5 shadow-soft hover:border-brand/30"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <h2 className="font-semibold leading-tight">{p.name}</h2>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${statusColor[p.status]}`}>
                {statusLabel[p.status]}
              </span>
            </div>
            {p.contrato && (
              <p className="mb-1"><span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">CCU {p.contrato.codccu}{p.contrato.nome ? ` · ${p.contrato.nome}` : ""}</span></p>
            )}
            <p className="text-xs text-gray-400">
              {p.team.name} · Responsável: {p.owner.name}
            </p>
            {p.approver && (
              <p className="mt-0.5 text-xs text-gray-400">
                Aprovador: {p.approver.name} ({p.approvalStatus})
              </p>
            )}

            <div className="mt-3">
              <ProgressBar percent={p.percentComplete} size="sm" />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500">{p._count.tasks} tarefa(s)</span>
              {p.overdueCount > 0 && (
                <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">
                  {p.overdueCount} atrasada(s)
                </span>
              )}
              {p.endDate && (
                <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500">Prazo: {fmtDate(p.endDate)}</span>
              )}
            </div>
          </Link>
        ))}
        {projects.length === 0 && <p className="text-sm text-gray-400">Nenhum projeto ainda.</p>}
      </div>
    </div>
  );
}
