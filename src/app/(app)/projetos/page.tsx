"use client";
import { SeletorMetasContrato } from "@/components/contractGoals/VinculosMetas";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ProgressBar from "@/components/ProgressBar";
import EscolhaDePessoas, { type PessoaOpcao } from "@/components/demandas/Pessoas";
import BotaoExcel from "@/components/BotaoExcel";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";
import type { AbaExcel } from "@/lib/exportarExcel";
import SeloSaude, { type SaudeDoProjeto } from "@/components/projetos/SeloSaude";
import CargaEquipe from "@/components/projetos/CargaEquipe";
import { FILTRO_VAZIO, filtrarProjetos, opcoesDosFiltros, type FiltroProjetos, type OrdemProjetos } from "@/lib/projetos/filtro";
import { ROTULO_SAUDE } from "@/lib/projetos/saude";

type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  team: { id: string; name: string };
  contrato?: { codccu: string; nome: string | null } | null;
  owner: { id: string; name: string };
  approver: { name: string } | null;
  approvalStatus: string;
  startDate: string | null;
  endDate: string | null;
  _count: { tasks: number };
  percentComplete: number;
  overdueCount: number;
  blockedCount?: number;
  nucleos?: { id: string; name: string }[];
  saude?: SaudeDoProjeto;
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
  const [contractGoalIds, setContractGoalIds] = useState<string[]>([]);
  useEffect(() => { setContractGoalIds([]); }, [codccu]);
  const [pessoas, setPessoas] = useState<string[]>([]);
  const [nucleoId, setNucleoId] = useState("");
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [opcoesPessoas, setOpcoesPessoas] = useState<PessoaOpcao[]>([]);
  const [nucleos, setNucleos] = useState<NucleoComGente[]>([]);
  const [erro, setErro] = useState("");
  const [criando, setCriando] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [aba, setAba] = useState<"projetos" | "carga">("projetos");
  const [visao, setVisao] = useState<"cartoes" | "tabela">("cartoes");
  const [filtro, setFiltro] = useState<FiltroProjetos>(FILTRO_VAZIO);

  const exemploPedido = useRef(false);
  const [carregado, setCarregado] = useState(false);
  const [preparando, setPreparando] = useState(false);
  async function load() {
    const p = await fetch("/api/projects").then((r) => r.json()).catch(() => null);
    if (!Array.isArray(p)) return; // resposta de erro (ex.: sessao expirada) nao apaga a lista
    setProjects(p);
    setCarregado(true);
    // quem ainda nao tem nenhum projeto recebe, uma unica vez, o projeto de teste que ensina o fluxo (so' dele)
    if (p.length === 0 && !exemploPedido.current) {
      exemploPedido.current = true;
      setPreparando(true);
      const r = await fetch("/api/projects/exemplo", { method: "POST" }).then((x) => x.json()).catch(() => null);
      if (r?.criado) {
        const p2 = await fetch("/api/projects").then((x) => x.json()).catch(() => null);
        if (Array.isArray(p2)) setProjects(p2);
      }
      setPreparando(false);
    }
  }

  // contratos que a pessoa ve, pessoas que podem entrar no projeto e nucleos (para incluir as pessoas de um nucleo de uma vez)
  // so' o formulario "Novo projeto" usa estas listas: carregam na primeira vez que ele abre (a lista de projetos abre mais rapido)
  async function loadOpcoes() {
    const [o, n, ps, t] = await Promise.all([
      fetch("/api/demandas/opcoes").then((r) => (r.ok ? r.json() : null)),
      fetch("/api/nucleos").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/pessoas").then((r) => (r.ok ? r.json() : [])),
      fetch("/api/teams").then((r) => (r.ok ? r.json() : [])),
    ]);
    if (o) setContratos(o.contratos ?? []);
    setOpcoesPessoas(Array.isArray(ps) ? ps : []);
    setNucleos(Array.isArray(n) ? n : []);
    setTeams(Array.isArray(t) ? t : []);
  }

  useEffect(() => {
    load();
  }, []);
  const opcoesJaPedidas = useRef(false);
  useEffect(() => {
    if (showForm && !opcoesJaPedidas.current) { opcoesJaPedidas.current = true; void loadOpcoes(); }
  }, [showForm]);
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
      body: JSON.stringify(teamId ? { name, teamId, codccu: codccu || null, nucleoId: nucleoId || null, contractGoalIds } : { name, pessoas, codccu: codccu || null, nucleoId: nucleoId || null, contractGoalIds }),
    });
    setCriando(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return setErro(typeof j.error === "string" ? j.error : "Não foi possível criar. Confira o nome (mínimo 2 letras).");
    }
    // projeto novo: leva direto para a aba Equipe, para montar a equipe antes de criar as tarefas
    const criado = await r.json().catch(() => null);
    setName(""); setTeamId(""); setCodccu(""); setPessoas([]); setNucleoId("");
    if (criado?.id) { window.location.href = `/projetos/${criado.id}?aba=equipe`; return; }
    setShowForm(false);
    load();
  }

  // visao de portfolio: filtros e ordem so' mexem no que aparece (nenhum projeto e' alterado)
  const visiveis = useMemo(() => filtrarProjetos(projects, filtro), [projects, filtro]);
  const opcoes = useMemo(() => opcoesDosFiltros(projects), [projects]);
  const porSaude = useMemo(() => {
    const c: Record<string, number> = {};
    for (const p of projects) c[p.saude?.nivel ?? "SEM_DADOS"] = (c[p.saude?.nivel ?? "SEM_DADOS"] ?? 0) + 1;
    return c;
  }, [projects]);
  const filtrando = JSON.stringify({ ...filtro, ordem: "" }) !== JSON.stringify({ ...FILTRO_VAZIO, ordem: "" });
  const mudar = (parte: Partial<FiltroProjetos>) => setFiltro((f) => ({ ...f, ...parte }));

  // planilha dos projetos que estao na tela (respeita os filtros): contrato, nucleos, saude e andamento
  function abasExcel(): AbaExcel[] {
    return [{
      nome: "Projetos",
      observacao: `Projetos${filtrando ? " (com os filtros da tela)" : ""} · gerado em ${new Date().toLocaleString("pt-BR")}`,
      colunas: [
        { titulo: "Projeto", largura: 44 }, { titulo: "Situação", largura: 14 }, { titulo: "Saúde", largura: 12 }, { titulo: "Por quê", largura: 46 }, { titulo: "Equipe", largura: 28 }, { titulo: "Núcleos", largura: 30 },
        { titulo: "Contrato (CCU)", largura: 10 }, { titulo: "Contrato", largura: 30 }, { titulo: "Responsável", largura: 26 }, { titulo: "Aprovador", largura: 26 }, { titulo: "Situação da aprovação", largura: 18 },
        { titulo: "Início", tipo: "data" }, { titulo: "Fim previsto", tipo: "data" }, { titulo: "Tarefas", tipo: "inteiro" }, { titulo: "Atrasadas", tipo: "inteiro" }, { titulo: "Bloqueadas", tipo: "inteiro" }, { titulo: "Andamento", tipo: "percentual" },
      ],
      linhas: visiveis.map((p) => [
        p.name, statusLabel[p.status] ?? p.status, p.saude ? ROTULO_SAUDE[p.saude.nivel] : "", p.saude?.motivos.join("; ") ?? "", p.team?.name ?? "", (p.nucleos ?? []).map((n) => n.name).join(", "),
        p.contrato?.codccu ?? "", p.contrato?.nome ?? "", p.owner?.name ?? "", p.approver?.name ?? "", p.approver ? p.approvalStatus : "",
        p.startDate, p.endDate, p._count?.tasks ?? 0, p.overdueCount ?? 0, p.blockedCount ?? 0, (p.percentComplete ?? 0) / 100,
      ]),
    }];
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projetos</h1>
        <div className="flex items-center gap-2">
          {aba !== "carga" && <BotaoExcel arquivo="projetos" gerar={abasExcel} desabilitado={visiveis.length === 0} />}
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
          <div className="sm:col-span-2"><SeletorMetasContrato codccu={codccu} selecionadas={contractGoalIds} onChange={setContractGoalIds} /></div>
          {erro && <p className="text-sm text-red-600 sm:col-span-2">{erro}</p>}
          <div className="sm:col-span-2">
            <button disabled={criando} className="rounded-md bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{criando ? "Criando…" : "Criar projeto"}</button>
          </div>
        </form>
      )}

      <div className="mb-4 flex gap-1 border-b border-gray-200" role="tablist">
        {([["projetos", "Projetos"], ["carga", "Carga da equipe"]] as const).map(([id, nome]) => (
          <button key={id} role="tab" aria-selected={aba === id} onClick={() => setAba(id)} className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${aba === id ? "border-brand text-brand-dark" : "border-transparent text-gray-500 hover:text-gray-700"}`}>{nome}</button>
        ))}
      </div>

      {aba === "carga" ? (
        <CargaEquipe />
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {([["", "Todos", projects.length, ""], ["ATRASADO", "Atrasados", porSaude.ATRASADO ?? 0, "bg-rose-500"], ["ATENCAO", "Atenção", porSaude.ATENCAO ?? 0, "bg-amber-500"], ["NO_PRAZO", "No prazo", porSaude.NO_PRAZO ?? 0, "bg-emerald-500"], ["CONCLUIDO", "Concluídos", porSaude.CONCLUIDO ?? 0, "bg-slate-400"]] as const).map(([k, n, q, ponto]) => (
              <button key={k} onClick={() => mudar({ saude: k })} className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition ${filtro.saude === k ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
                {ponto && <span className={`h-2 w-2 rounded-full ${ponto}`} />}
                {n} <span className="opacity-70">{q}</span>
              </button>
            ))}
            <div className="ml-auto inline-flex overflow-hidden rounded-lg border border-gray-200" role="group" aria-label="Forma de exibir">
              {([["cartoes", "Cartões"], ["tabela", "Tabela"]] as const).map(([id, nome]) => (
                <button key={id} onClick={() => setVisao(id)} aria-pressed={visao === id} className={`px-3 py-1.5 text-[13px] font-medium ${visao === id ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>{nome}</button>
              ))}
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <input value={filtro.busca} onChange={(e) => mudar({ busca: e.target.value })} placeholder="Buscar projeto, equipe, responsável, contrato ou núcleo…" aria-label="Buscar projeto" className="min-w-[16rem] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none" />
            <select value={filtro.status} onChange={(e) => mudar({ status: e.target.value })} aria-label="Situação" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm">
              <option value="">Toda situação</option>
              {Object.entries(statusLabel).map(([k, n]) => <option key={k} value={k}>{n}</option>)}
            </select>
            {opcoes.nucleos.length > 0 && (
              <select value={filtro.nucleoId} onChange={(e) => mudar({ nucleoId: e.target.value })} aria-label="Núcleo" className="max-w-[13rem] rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm">
                <option value="">Todos os núcleos</option>
                {opcoes.nucleos.map((n) => <option key={n.id} value={n.id}>{n.nome}</option>)}
              </select>
            )}
            {opcoes.contratos.length > 0 && (
              <select value={filtro.codccu} onChange={(e) => mudar({ codccu: e.target.value })} aria-label="Contrato" className="max-w-[14rem] rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm">
                <option value="">Todos os contratos</option>
                {opcoes.contratos.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>
            )}
            <select value={filtro.ownerId} onChange={(e) => mudar({ ownerId: e.target.value })} aria-label="Responsável" className="max-w-[12rem] rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm">
              <option value="">Todos os responsáveis</option>
              {opcoes.donos.map((d) => <option key={d.id} value={d.id}>{d.nome}</option>)}
            </select>
            <select value={filtro.ordem} onChange={(e) => mudar({ ordem: e.target.value as OrdemProjetos })} aria-label="Ordenar" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm">
              <option value="recentes">Mais recentes</option>
              <option value="saude">Pior saúde primeiro</option>
              <option value="prazo">Prazo mais próximo</option>
              <option value="andamento">Mais adiantados</option>
              <option value="nome">Nome (A–Z)</option>
            </select>
            {filtrando && <button onClick={() => setFiltro(FILTRO_VAZIO)} className="text-xs text-gray-400 underline hover:text-gray-600">limpar filtros</button>}
          </div>
          {filtrando && <p className="mb-3 text-xs text-gray-400">Mostrando {visiveis.length} de {projects.length} projeto(s).</p>}

          {visao === "tabela" ? (
            <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-soft">
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                    <th className="px-4 py-2.5">Projeto</th><th className="px-3 py-2.5">Saúde</th><th className="px-3 py-2.5">Andamento</th><th className="px-3 py-2.5 text-center">Atrasadas</th>
                    <th className="px-3 py-2.5">Responsável</th><th className="px-3 py-2.5">Contrato</th><th className="px-3 py-2.5">Núcleos</th><th className="px-3 py-2.5">Prazo</th>
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map((p) => (
                    <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                      <td className="px-4 py-2"><Link href={`/projetos/${p.id}`} className="font-medium text-gray-800 hover:text-brand-dark hover:underline">{p.name}</Link><span className={`ml-2 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${statusColor[p.status]}`}>{statusLabel[p.status]}</span></td>
                      <td className="px-3 py-2"><SeloSaude saude={p.saude} /></td>
                      <td className="px-3 py-2"><div className="w-28"><ProgressBar percent={p.percentComplete} size="sm" /></div></td>
                      <td className="px-3 py-2 text-center tabular-nums">{p.overdueCount > 0 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">{p.overdueCount}</span> : <span className="text-gray-300">0</span>}</td>
                      <td className="px-3 py-2 text-gray-600">{p.owner.name}</td>
                      <td className="px-3 py-2 text-gray-600">{p.contrato ? `${p.contrato.codccu}${p.contrato.nome ? ` · ${p.contrato.nome}` : ""}` : <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{(p.nucleos ?? []).map((n) => n.name).join(", ") || <span className="text-gray-300">—</span>}</td>
                      <td className="px-3 py-2 tabular-nums text-gray-600">{p.endDate ? fmtDate(p.endDate) : <span className="text-gray-300">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visiveis.map((p) => (
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
                  <div className="mb-1 flex flex-wrap items-center gap-1.5">
                    <SeloSaude saude={p.saude} />
                    {p.contrato && (
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">CCU {p.contrato.codccu}{p.contrato.nome ? ` · ${p.contrato.nome}` : ""}</span>
                    )}
                  </div>
                  <p className="text-xs text-gray-400">
                    {p.team.name} · Responsável: {p.owner.name}
                  </p>
                  {(p.nucleos ?? []).length > 0 && <p className="mt-0.5 text-xs text-gray-400">Núcleo(s): {(p.nucleos ?? []).map((n) => n.name).join(", ")}</p>}
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
                    {(p.blockedCount ?? 0) > 0 && (
                      <span className="rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700">{p.blockedCount} bloqueada(s)</span>
                    )}
                    {p.endDate && (
                      <span className="rounded-full bg-gray-50 px-2 py-0.5 text-gray-500">Prazo: {fmtDate(p.endDate)}</span>
                    )}
                  </div>
                </Link>
              ))}
              {!carregado && <p className="text-sm text-gray-400">Carregando seus projetos…</p>}
              {carregado && projects.length === 0 && preparando && <p className="text-sm text-gray-400">Preparando o seu projeto de teste, que mostra como o sistema funciona…</p>}
              {carregado && projects.length === 0 && !preparando && <p className="text-sm text-gray-400">Nenhum projeto ainda. Os projetos são particulares: você vê os que criou e aqueles para os quais foi chamado(a) na equipe.</p>}
              {projects.length > 0 && visiveis.length === 0 && <p className="text-sm text-gray-400">Nenhum projeto com esses filtros.</p>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
