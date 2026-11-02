"use client";

// Timesheet automatico (modulo Projetos): a pessoa ativa e o sistema deduz, das tarefas dela, as horas e o % de dedicacao por centro de custo, ao vivo.
// A regra de calculo esta em src/lib/timesheetAuto/calculo.ts (explicada na propria tela, em "Como calculamos").

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { Aviso, LinhaCentro, Relatorio } from "@/lib/timesheetAuto/calculo";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";
import BarraCentros, { rotuloDoCentro, useCoresDosCentros } from "@/components/timesheet/BarraCentros";

type Config = { ativo: boolean; desde: string; horasPorDia: number; ativadoEm: string; desativadoEm: string | null; ausencias: { id: string; de: string; ate: string; motivo: string | null }[] };
type Resposta = {
  pessoa: { id: string; name: string; cargo: string | null; setor: string | null };
  ehMeu: boolean;
  ativado: boolean;
  periodo: { de: string; ate: string; competencia: string | null };
  hoje: string;
  meses?: string[];
  nomesCentros?: Record<string, string>;
  semCentro?: { projetoId: string; nome: string; tarefas: number }[];
  config?: Config;
  resultado?: Relatorio;
  mesesFechados?: string[];
  fechadoEm?: Record<string, string>;
};
type Equipe = {
  periodo: { de: string; ate: string };
  nomesCentros: Record<string, string>;
  pessoas: { pessoa: { id: string; name: string; cargo: string | null }; mesesFechados: string[]; diasTrabalhados: number; horasDisponiveis: number; horasAlocadas: number; horasSemApontamento: number; avisos: number; centros: { chave: string; codccu: string | null; horas: number; percentual: number; identificado: boolean }[] }[];
  centros: { chave: string; codccu: string | null; horas: number; pessoas: number; identificado: boolean }[];
  total: number;
};
type Modo = "hoje" | "semana" | "semana_passada" | "mes" | "30d" | "trimestre" | "ano" | "custom";

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const num = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dia = (iso: string) => iso.split("-").reverse().join("/");
const mesBr = (c: string) => { const [a, m] = c.split("-"); return `${MESES[Number(m) - 1]} de ${a}`; };
const hojeLocalSP = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo" }).format(new Date());
const soma = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);
const dow = (iso: string) => new Date(`${iso}T00:00:00Z`).getUTCDay();
const ultimoDiaDoMes = (c: string) => { const [a, m] = c.split("-").map(Number); return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10); };

function periodoDoModo(modo: Modo, hoje: string, competencia: string, custom: { de: string; ate: string }): { de: string; ate: string } {
  const segunda = soma(hoje, -((dow(hoje) + 6) % 7));
  switch (modo) {
    case "hoje": return { de: hoje, ate: hoje };
    case "semana": return { de: segunda, ate: soma(segunda, 6) };
    case "semana_passada": return { de: soma(segunda, -7), ate: soma(segunda, -1) };
    case "30d": return { de: soma(hoje, -29), ate: hoje };
    case "trimestre": { const [a, m] = hoje.split("-").map(Number); const q = Math.floor((m - 1) / 3) * 3 + 1; return { de: `${a}-${String(q).padStart(2, "0")}-01`, ate: hoje }; }
    case "ano": return { de: `${hoje.slice(0, 4)}-01-01`, ate: hoje };
    case "custom": return custom.de && custom.ate && custom.de <= custom.ate ? custom : { de: hoje, ate: hoje };
    default: return { de: `${competencia}-01`, ate: ultimoDiaDoMes(competencia) };
  }
}
const MODOS: { v: Modo; l: string }[] = [
  { v: "hoje", l: "Hoje" }, { v: "semana", l: "Esta semana" }, { v: "semana_passada", l: "Semana passada" }, { v: "mes", l: "Mês" },
  { v: "30d", l: "30 dias" }, { v: "trimestre", l: "Trimestre" }, { v: "ano", l: "Ano" }, { v: "custom", l: "Período livre" },
];

async function chamar(url: string, metodo = "GET", corpo?: unknown) {
  const r = await fetch(url, { method: metodo, headers: corpo !== undefined ? { "Content-Type": "application/json" } : undefined, body: corpo !== undefined ? JSON.stringify(corpo) : undefined, cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, json: j };
}

function Cartao({ titulo, valor, ajuda, alerta, pequeno }: { titulo: string; valor: string; ajuda?: string; alerta?: boolean; pequeno?: boolean }) {
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
      <div className="text-[12px] font-medium uppercase tracking-wide text-gray-500">{titulo}</div>
      <div className={`mt-1 font-semibold tabular-nums ${pequeno ? "text-base" : "text-2xl"} ${alerta ? "text-amber-600" : "text-gray-900"}`}>{valor}</div>
      {ajuda && <div className="mt-0.5 text-[12px] text-gray-500">{ajuda}</div>}
    </div>
  );
}

const TEXTO_AVISO: Record<Aviso["tipo"], { titulo: string; dica: string }> = {
  SEM_CENTRO: { titulo: "Projeto sem centro de custo", dica: "As horas dele não entram em nenhum contrato. Defina o centro de custo no projeto." },
  SEM_HORAS: { titulo: "Concluída sem horas dedicadas", dica: "As horas dela são uma estimativa. Preencha “Horas dedicadas” na lista de tarefas do projeto." },
  EXCESSO: { titulo: "Horas dedicadas que não cabem", dica: "As horas informadas são maiores do que a jornada dos dias em que a tarefa esteve em andamento. Confira as horas ou as datas." },
  PARADA: { titulo: "Em “Fazendo” sem movimentação", dica: "Ela divide o seu dia com as outras tarefas. Se você não está trabalhando nela, pause (Bloqueado ou A fazer)." },
  ESTIMADO: { titulo: "Horas estimadas", dica: "" },
};

function LinhaDoCentro({ c, nomes, cor, aberto, onAlternar }: { c: LinhaCentro; nomes: Record<string, string>; cor: string; aberto: boolean; onAlternar: () => void }) {
  return (
    <div className="border-b border-gray-100 last:border-0">
      <button type="button" onClick={onAlternar} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50" aria-expanded={aberto}>
        <span className="w-4 text-gray-400">{aberto ? "▾" : "▸"}</span>
        <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: cor }} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={`block truncate text-[14px] font-medium ${c.identificado ? "text-gray-900" : "text-amber-700"}`}>{rotuloDoCentro(c, nomes)}</span>
        </span>
        <span className="w-24 text-right text-[14px] tabular-nums text-gray-700">{num(c.horas)} h</span>
        <span className="w-20 text-right text-[15px] font-semibold tabular-nums text-gray-900">{num(c.percentual)}%</span>
      </button>
      {aberto && (
        <div className="bg-gray-50/60 px-4 pb-3 pl-12">
          {c.projetos.map((p) => (
            <div key={p.projetoId ?? "sem"} className="mt-2">
              <div className="flex items-center justify-between text-[13px] font-medium text-gray-700">
                <span>{p.projetoId ? <Link className="hover:text-brand" href={`/projetos/${p.projetoId}`}>{p.nome}</Link> : p.nome}</span>
                <span className="tabular-nums">{num(p.horas)} h</span>
              </div>
              <ul className="mt-1 space-y-0.5">
                {p.tarefas.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-3 text-[12.5px] text-gray-600">
                    <span className="min-w-0 truncate">{t.titulo}</span>
                    <span className="shrink-0 tabular-nums">
                      {t.dias} dia(s) · {num(t.horas)} h{" "}
                      {t.fonte === "declarado"
                        ? <span className="ml-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700 ring-1 ring-emerald-200" title={`Você informou ${num(t.declarado ?? 0)} h para a tarefa inteira`}>informado</span>
                        : <span className="ml-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10.5px] font-medium text-amber-700 ring-1 ring-amber-200" title="Você ainda não informou as horas dedicadas: o sistema dividiu o seu dia entre as tarefas em andamento">estimado</span>}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function TimesheetPage() {
  const { data: session } = useSession();
  const meuId = (session?.user as any)?.id as string | undefined;
  const papel = (session?.user as any)?.role as string | undefined;
  const [modo, setModo] = useState<Modo>("mes");
  const [competencia, setCompetencia] = useState<string>(hojeLocalSP().slice(0, 7));
  const [custom, setCustom] = useState({ de: "", ate: "" });
  const [alvoId, setAlvoId] = useState<string | null>(null); // null = eu
  const [dados, setDados] = useState<Resposta | null>(null);
  const [equipe, setEquipe] = useState<Equipe | null>(null);
  const [aba, setAba] = useState<"meu" | "equipe">("meu");
  const [erro, setErro] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState<string | null>(null);
  const [ativando, setAtivando] = useState({ desde: "", horas: 8 });
  const [horasEdit, setHorasEdit] = useState<number | null>(null);
  const [inicioEdit, setInicioEdit] = useState("");
  const [novaAus, setNovaAus] = useState({ de: "", ate: "", motivo: "" });
  const [diaADia, setDiaADia] = useState(false);
  const [atualizadoEm, setAtualizadoEm] = useState<string>("");
  const cor = useCoresDosCentros();
  const pedidoAtual = useRef(0);

  const hoje = dados?.hoje ?? hojeLocalSP();
  const periodo = useMemo(() => periodoDoModo(modo, hoje, competencia, custom), [modo, hoje, competencia, custom]);

  const consulta = useMemo(() => {
    const q = new URLSearchParams();
    if (modo === "mes") q.set("competencia", competencia);
    else { q.set("de", periodo.de); q.set("ate", periodo.ate); }
    return q;
  }, [modo, competencia, periodo]);

  const carregar = useCallback(async () => {
    const eu = ++pedidoAtual.current;
    const q = new URLSearchParams(consulta);
    if (alvoId) q.set("userId", alvoId);
    const r = await chamar(`/api/timesheet-auto?${q}`);
    if (eu !== pedidoAtual.current) return; // chegou uma resposta mais nova
    if (!r.ok) { setErro(r.json?.error ?? "Não foi possível carregar o timesheet."); return; }
    setErro(null);
    setDados(r.json);
    setAtualizadoEm(new Date().toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo" }));
  }, [consulta, alvoId]);

  const carregarEquipe = useCallback(async () => {
    const r = await chamar(`/api/timesheet-auto/equipe?${consulta}`);
    if (r.ok) setEquipe(r.json);
  }, [consulta]);

  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { void carregarEquipe(); }, [carregarEquipe]);
  // ao vivo: recarrega sozinho enquanto a aba esta visivel (e ao voltar para ela), sem piscar a tela
  useEffect(() => {
    const t = setInterval(() => { if (document.visibilityState === "visible") { void carregar(); if (aba === "equipe") void carregarEquipe(); } }, 30_000);
    return () => clearInterval(t);
  }, [carregar, carregarEquipe, aba]);
  useAtualizarAoVoltar(() => { void carregar(); if (aba === "equipe") void carregarEquipe(); }, 10_000);

  const nomes = dados?.nomesCentros ?? {};
  const r = dados?.resultado;
  const podeVerEquipe = !!equipe && (equipe.pessoas.length > 0 || papel === "ADMIN" || papel === "ACESSO_MASTER");
  const mesCorrente = dados?.hoje?.slice(0, 7);
  const mesFechado = modo === "mes" && !!dados?.mesesFechados?.includes(competencia);
  const podeFechar = modo === "mes" && !!dados?.ativado && !mesFechado && (papel === "ADMIN" || (!!dados?.ehMeu && !!mesCorrente && competencia < mesCorrente));

  async function acao(corpo: unknown) {
    const x = await chamar("/api/timesheet-auto", "POST", corpo);
    setMsg(x.ok ? null : x.json?.error ?? "Não foi possível concluir.");
    if (x.ok) await carregar();
    return x.ok;
  }
  async function fechar() {
    if (!window.confirm(`Fechar ${mesBr(competencia)}? Depois de fechado, mexer nas tarefas não muda mais este mês.`)) return;
    const x = await chamar("/api/timesheet-auto/fechar", "POST", { competencia, ...(alvoId ? { userId: alvoId } : {}) });
    setMsg(x.ok ? "Mês fechado." : x.json?.error ?? "Não foi possível fechar.");
    await carregar();
    await carregarEquipe();
  }
  async function reabrir() {
    if (!window.confirm(`Reabrir ${mesBr(competencia)}? O mês volta a acompanhar as tarefas.`)) return;
    const x = await chamar(`/api/timesheet-auto/fechar?competencia=${competencia}${alvoId ? `&userId=${alvoId}` : ""}`, "DELETE");
    setMsg(x.ok ? "Mês reaberto." : x.json?.error ?? "Não foi possível reabrir.");
    await carregar();
    await carregarEquipe();
  }
  async function adicionarAusencia() {
    if (!novaAus.de || !novaAus.ate) { setMsg("Informe o primeiro e o último dia."); return; }
    const x = await chamar("/api/timesheet-auto/ausencias", "POST", { de: novaAus.de, ate: novaAus.ate, motivo: novaAus.motivo || undefined });
    setMsg(x.ok ? null : x.json?.error ?? "Não foi possível salvar a ausência.");
    if (x.ok) { setNovaAus({ de: "", ate: "", motivo: "" }); await carregar(); }
  }
  async function removerAusencia(id: string) {
    const x = await chamar(`/api/timesheet-auto/ausencias?id=${id}`, "DELETE");
    setMsg(x.ok ? null : x.json?.error ?? "Não foi possível remover.");
    if (x.ok) await carregar();
  }

  // dia a dia: monta, da matriz (dia x tarefa), o que cada dia teve e a fatia de cada centro
  const dias = useMemo(() => {
    if (!r) return [];
    type DiaTS = { dia: string; total: number; centros: Map<string, number>; tarefas: { titulo: string; h: number }[] };
    const m = new Map<string, DiaTS>();
    for (const c of r.matriz) {
      const meta = r.metas[c.t];
      const chave = !meta?.projetoId ? "__sem_projeto__" : meta.codccu ?? "__sem_cc__";
      const x: DiaTS = m.get(c.d) ?? { dia: c.d, total: 0, centros: new Map<string, number>(), tarefas: [] };
      x.total += c.h;
      x.centros.set(chave, (x.centros.get(chave) ?? 0) + c.h);
      x.tarefas.push({ titulo: meta?.titulo ?? "tarefa", h: c.h });
      m.set(c.d, x);
    }
    return [...m.values()].sort((a, b) => (a.dia < b.dia ? 1 : -1));
  }, [r]);

  const avisosPorTipo = useMemo(() => {
    const g = new Map<Aviso["tipo"], Aviso[]>();
    for (const a of r?.avisos ?? []) g.set(a.tipo, [...(g.get(a.tipo) ?? []), a]);
    return [...g.entries()];
  }, [r]);

  if (erro && !dados) return <div className="mx-auto max-w-3xl p-6"><div className="rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-red-700">{erro}</div></div>;
  if (!dados) return <div className="mx-auto max-w-5xl p-6"><div className="h-40 animate-pulse rounded-2xl bg-gray-100" aria-busy /></div>;

  const rotuloPeriodo = modo === "mes" ? mesBr(competencia) : `${dia(periodo.de)} a ${dia(periodo.ate)}`;
  const segmentos = (r?.centros ?? []).map((c) => ({ chave: c.chave, codccu: c.codccu, percentual: c.percentual, horas: c.horas, identificado: c.identificado }));

  return (
    <div className="mx-auto max-w-5xl space-y-5 p-6">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Timesheet automático</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-500">O sistema calcula, a partir das suas tarefas, quantas horas e que percentual do seu tempo foram para cada centro de custo (contrato, administrativo, proposta). Você não preenche planilha: ativa uma vez, mantém as tarefas em dia e informa as <b>horas dedicadas</b> de cada tarefa antes de concluí-la.</p>
      </header>

      {msg && <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13.5px] text-amber-800">{msg}</div>}

      {/* ------------------------------------------------------------ ainda nao ativou */}
      {!dados.ativado && dados.ehMeu && aba === "meu" && (
        <section className="rounded-2xl border border-gray-100 bg-white p-6 shadow-soft">
          <h2 className="text-lg font-semibold text-gray-900">Ativar o timesheet automático</h2>
          <ul className="mt-3 space-y-1.5 text-[14px] text-gray-600">
            <li>Só conta quem ativa. O sistema soma a sua dedicação por centro de custo a partir das suas tarefas.</li>
            <li>Só contam as tarefas <b>iniciadas</b> (em “Fazendo”), e só enquanto você trabalha nelas. Se você tem duas ao mesmo tempo, o dia é dividido entre elas: nunca dobra.</li>
            <li>Cada projeto pertence a um centro de custo; é para ele que vão as horas das tarefas do projeto.</li>
            <li>Ao concluir uma tarefa, você informa as horas dedicadas a ela: é a base da conta.</li>
            <li>Fins de semana, feriados e dias de ausência não entram: o percentual é sobre o que você trabalhou.</li>
          </ul>
          <div className="mt-5 flex flex-wrap items-end gap-4">
            <label className="text-[13px] text-gray-600">Começar a contar em
              <input type="date" value={ativando.desde} max={dados.hoje} min={soma(dados.hoje, -730)} onChange={(e) => setAtivando({ ...ativando, desde: e.target.value })} className="ml-2 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
              <span className="ml-2 text-gray-400">(vazio = hoje; uma data anterior reconstitui o passado pelo histórico das tarefas)</span>
            </label>
            <label className="text-[13px] text-gray-600">Horas por dia trabalhado
              <input type="number" min={1} max={12} step={0.5} value={ativando.horas} onChange={(e) => setAtivando({ ...ativando, horas: Number(e.target.value) })} className="ml-2 w-20 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
            </label>
            <button type="button" onClick={() => acao({ acao: "ativar", ...(ativando.desde ? { desde: ativando.desde } : {}), horasPorDia: ativando.horas })} className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark">Ativar</button>
          </div>
        </section>
      )}
      {!dados.ativado && !dados.ehMeu && aba === "meu" && <div className="rounded-2xl border border-gray-100 bg-white p-5 text-sm text-gray-600">{dados.pessoa.name} ainda não ativou o timesheet automático.</div>}

      {(dados.ativado || podeVerEquipe) && (
        <>
          {/* ---------------------------------------------------------- abas */}
          <div className="flex flex-wrap items-center gap-3 border-b border-gray-200">
            <button type="button" onClick={() => { setAba("meu"); setAlvoId(null); }} className={`-mb-px border-b-2 px-3 py-2 text-[14px] font-medium ${aba === "meu" ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>{alvoId ? dados.pessoa.name : "Meu timesheet"}</button>
            {podeVerEquipe && <button type="button" onClick={() => setAba("equipe")} className={`-mb-px border-b-2 px-3 py-2 text-[14px] font-medium ${aba === "equipe" ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>Equipe</button>}
          </div>

          {/* ---------------------------------------------------------- filtro de tempo */}
          {(dados.ativado || aba === "equipe") && <section aria-label="Período" className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-soft">
            <div role="group" aria-label="Atalhos de período" className="flex flex-wrap gap-1">
              {MODOS.map((m) => (
                <button key={m.v} type="button" onClick={() => { setModo(m.v); if (m.v === "custom" && !custom.de) setCustom({ de: soma(dados.hoje, -6), ate: dados.hoje }); }} aria-pressed={modo === m.v}
                  className={`rounded-full px-3 py-1 text-[13px] font-medium ${modo === m.v ? "bg-brand text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}>{m.l}</button>
              ))}
            </div>
            {modo === "mes" && (
              <label className="text-[13px] text-gray-600">Mês
                <select value={competencia} onChange={(e) => setCompetencia(e.target.value)} className="ml-2 rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm">
                  {Array.from(new Set([competencia, ...(dados.meses ?? [])])).sort().reverse().map((m) => <option key={m} value={m}>{mesBr(m)}{dados.mesesFechados?.includes(m) ? " (fechado)" : ""}</option>)}
                </select>
              </label>
            )}
            {modo === "custom" && (
              <div className="flex items-end gap-2 text-[13px] text-gray-600">
                <label>De <input type="date" value={custom.de} max={custom.ate || undefined} onChange={(e) => setCustom({ ...custom, de: e.target.value })} className="ml-1 rounded-lg border border-gray-200 px-2 py-1 text-sm" /></label>
                <label>até <input type="date" value={custom.ate} min={custom.de || undefined} onChange={(e) => setCustom({ ...custom, ate: e.target.value })} className="ml-1 rounded-lg border border-gray-200 px-2 py-1 text-sm" /></label>
              </div>
            )}
            <div className="flex-1" />
            <span className="inline-flex items-center gap-1.5 text-[12px] text-gray-500" title="A tela se atualiza sozinha a cada 30 segundos e quando você volta para ela">
              <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60 motion-reduce:animate-none" /><span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" /></span>
              ao vivo · {atualizadoEm}
            </span>
          </section>}

          {aba === "meu" && dados.ativado && r && dados.config && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-600">
                <span className={`rounded-full px-2.5 py-1 font-medium ${dados.config.ativo ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"}`}>{dados.config.ativo ? "Ativo" : "Desativado"}</span>
                <span>contando desde {dia(dados.config.desde)} · {num(dados.config.horasPorDia)} h por dia trabalhado</span>
                {r.retroativo && <span className="rounded-full bg-sky-50 px-2.5 py-1 font-medium text-sky-700 ring-1 ring-sky-200" title="Dias anteriores à ativação do sistema: reconstituídos pelo histórico das tarefas e pelas horas dedicadas informadas">inclui {r.diasRetroativos} dia(s) reconstituído(s) do passado</span>}
                {mesFechado && <span className="rounded-full bg-gray-100 px-2.5 py-1 font-medium text-gray-700">Mês fechado em {dia((dados.fechadoEm?.[competencia] ?? "").slice(0, 10))}</span>}
                {modo !== "mes" && (dados.mesesFechados?.length ?? 0) > 0 && <span className="rounded-full bg-gray-100 px-2.5 py-1 text-gray-600">meses fechados no período: {dados.mesesFechados!.join(", ")}</span>}
                <div className="flex-1" />
                <a href={`/api/timesheet-auto/exportar?${consulta}${alvoId ? `&userId=${alvoId}` : ""}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Baixar planilha</a>
                <a href={`/api/timesheet-auto/exportar?${consulta}${alvoId ? `&userId=${alvoId}` : ""}&detalhe=dia`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50" title="Uma linha por dia e tarefa, para conferir a conta">Dia a dia (planilha)</a>
                {podeFechar && <button type="button" onClick={fechar} className="rounded-lg bg-brand px-3 py-1.5 font-medium text-white hover:bg-brand-dark">Fechar {mesBr(competencia)}</button>}
                {mesFechado && papel === "ADMIN" && <button type="button" onClick={reabrir} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Reabrir mês</button>}
              </div>

              {/* ---------------------------------------------------------- barra de 100% */}
              <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Distribuição do seu tempo">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[15px] font-semibold text-gray-900">{dados.ehMeu ? "Para onde foi o seu tempo" : `Para onde foi o tempo de ${dados.pessoa.name}`} · {rotuloPeriodo}</h2>
                  <span className="text-[12px] text-gray-500">100% = as {num(r.horasAlocadas)} h apontadas no período</span>
                </div>
                <BarraCentros centros={segmentos} nomes={nomes} cor={cor} altura={34} vazio="Sem horas apontadas neste período — ponha uma tarefa em “Fazendo”" />

                {/* agora */}
                <div className="mt-4 rounded-xl bg-gray-50 px-4 py-3">
                  <div className="text-[12px] font-medium uppercase tracking-wide text-gray-500">Agora</div>
                  {r.agora ? (
                    <>
                      <p className="mt-0.5 text-[13px] text-gray-600">O seu dia de hoje está dividido entre {r.agora.tarefas.length} tarefa(s) em “Fazendo”:</p>
                      <div className="mt-2">
                        <BarraCentros centros={r.agora.centros.map((c) => ({ chave: c.chave, codccu: c.codccu, percentual: Math.round(c.fracao * 10000) / 100, horas: 0, identificado: c.chave !== "__sem_cc__" && c.chave !== "__sem_projeto__" }))} nomes={nomes} cor={cor} altura={14} legenda={false} />
                      </div>
                      <ul className="mt-2 space-y-1">
                        {r.agora.tarefas.map((t) => (
                          <li key={t.id} className="flex items-center gap-2 text-[13px] text-gray-700">
                            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor(t.chave) }} aria-hidden />
                            <span className="min-w-0 flex-1 truncate">{t.titulo}</span>
                            <span className="shrink-0 text-gray-500">{t.codccu ?? "sem centro"}</span>
                            <span className="w-12 shrink-0 text-right tabular-nums text-gray-600">{Math.round(t.fracao * 100)}%</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="mt-0.5 text-[13px] text-gray-600">
                      {dados.config.ativo
                        ? "Nenhuma tarefa sua está em “Fazendo” hoje (ou hoje não é dia trabalhado: fim de semana, feriado ou ausência). Ponha em “Fazendo” a tarefa em que você está trabalhando para ela contar."
                        : "O timesheet está desativado."}
                    </p>
                  )}
                </div>
              </section>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Cartao titulo="Horas apontadas" valor={`${num(r.horasAlocadas)} h`} ajuda={`de ${num(r.horasDisponiveis)} h da jornada`} />
                <Cartao titulo="Em centros de custo" valor={`${num(r.percentualIdentificado)}%`} ajuda={`${num(r.horasIdentificadas)} h com centro identificado`} alerta={r.percentualIdentificado < 100 && r.horasAlocadas > 0} />
                <Cartao titulo="Jornada sem tarefa" valor={`${num(r.horasSemApontamento)} h`} ajuda={r.diasSemTarefa.length > 0 ? `${r.diasSemTarefa.length} dia(s) sem tarefa em “Fazendo”` : r.horasSemApontamento > 0 ? "jornada além das horas informadas" : "nenhum dia sem tarefa"} alerta={r.horasSemApontamento > 0} />
                <Cartao titulo="Dias" valor={`${r.diasTrabalhados} trabalhados`} pequeno ajuda={`${r.diasAusencia} de ausência · ${r.diasFeriado} feriado(s)`} />
              </div>

              {/* ---------------------------------------------------------- pendencias que mexem na conta */}
              {avisosPorTipo.length > 0 && (
                <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4" aria-label="Pendências">
                  <h2 className="text-[14px] font-semibold text-amber-900">O que ajustar para a conta ficar exata</h2>
                  <ul className="mt-2 space-y-3">
                    {avisosPorTipo.map(([tipo, lista]) => (
                      <li key={tipo}>
                        <div className="text-[13.5px] font-medium text-amber-900">{TEXTO_AVISO[tipo].titulo} <span className="font-normal text-amber-700">({lista.length})</span></div>
                        <div className="text-[12.5px] text-amber-800">{TEXTO_AVISO[tipo].dica}</div>
                        <ul className="mt-1 list-disc space-y-0.5 pl-5 text-[12.5px] text-amber-900">
                          {lista.slice(0, 6).map((a, i) => (
                            <li key={`${a.tarefaId ?? a.projetoId}-${i}`}>{a.projetoId ? <Link className="underline" href={`/projetos/${a.projetoId}`}>{a.texto}</Link> : a.texto}</li>
                          ))}
                          {lista.length > 6 && <li className="list-none text-amber-700">e mais {lista.length - 6}…</li>}
                        </ul>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
              {dados.ehMeu && (dados.semCentro?.length ?? 0) > 0 && !r.avisos.some((a) => a.tipo === "SEM_CENTRO") && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-800">
                  <b>Projetos sem centro de custo:</b> as horas deles não entram em nenhum contrato. Ligue cada um a um centro de custo:{" "}
                  {dados.semCentro!.map((p, i) => <span key={p.projetoId}>{i > 0 && ", "}<Link className="font-medium underline" href={`/projetos/${p.projetoId}`}>{p.nome}</Link> ({p.tarefas})</span>)}.
                </div>
              )}

              {/* ---------------------------------------------------------- distribuicao */}
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft">
                <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
                  <h2 className="text-[15px] font-semibold text-gray-900">Detalhe por centro de custo · {rotuloPeriodo}</h2>
                  <span className="text-[12px] text-gray-500">% sobre as horas apontadas</span>
                </div>
                {r.centros.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-gray-500">Nenhuma hora apontada neste período. Para contar, tenha tarefas iniciadas (“Fazendo”) em projetos com centro de custo.</p>
                ) : (
                  r.centros.map((c) => (
                    <LinhaDoCentro key={c.chave} c={c} nomes={nomes} cor={cor(c.chave)} aberto={abertos.has(c.chave)} onAlternar={() => setAbertos((s) => { const n = new Set(s); if (n.has(c.chave)) n.delete(c.chave); else n.add(c.chave); return n; })} />
                  ))
                )}
              </section>

              {/* ---------------------------------------------------------- ajustes (so' no meu) */}
              {dados.ehMeu && (
                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
                    <h3 className="text-[14px] font-semibold text-gray-900">Dias sem expediente</h3>
                    <p className="mt-0.5 text-[12.5px] text-gray-500">Férias, atestado, faltas e folgas saem da conta (o percentual é do que você trabalhou). Fins de semana e feriados (nacionais e de Belo Horizonte) já saem sozinhos. Pode marcar datas passadas.</p>
                    <ul className="mt-2 space-y-1">
                      {dados.config.ausencias.map((a) => (
                        <li key={a.id} className="flex items-center justify-between text-[13px] text-gray-700">
                          <span>{dia(a.de)} a {dia(a.ate)}{a.motivo ? ` · ${a.motivo}` : ""}</span>
                          <button type="button" onClick={() => removerAusencia(a.id)} className="text-[12px] text-red-600 hover:underline">remover</button>
                        </li>
                      ))}
                      {dados.config.ausencias.length === 0 && <li className="text-[13px] text-gray-400">Nenhuma ausência marcada.</li>}
                    </ul>
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <input type="date" value={novaAus.de} onChange={(e) => setNovaAus({ ...novaAus, de: e.target.value })} aria-label="Primeiro dia" className="rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <input type="date" value={novaAus.ate} onChange={(e) => setNovaAus({ ...novaAus, ate: e.target.value })} aria-label="Último dia" className="rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <input type="text" value={novaAus.motivo} maxLength={120} placeholder="Motivo (opcional)" onChange={(e) => setNovaAus({ ...novaAus, motivo: e.target.value })} className="min-w-[9rem] flex-1 rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <button type="button" onClick={adicionarAusencia} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Adicionar</button>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
                    <h3 className="text-[14px] font-semibold text-gray-900">Configuração</h3>
                    <div className="mt-2 flex items-center gap-2 text-[13px] text-gray-700">
                      Horas por dia trabalhado
                      <input type="number" min={1} max={12} step={0.5} value={horasEdit ?? dados.config.horasPorDia} onChange={(e) => setHorasEdit(Number(e.target.value))} className="w-20 rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <button type="button" onClick={() => { if (horasEdit) void acao({ acao: "configurar", horasPorDia: horasEdit }).then(() => setHorasEdit(null)); }} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Salvar</button>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-[13px] text-gray-700">
                      Contar desde
                      <input type="date" value={inicioEdit || dados.config.desde} max={dados.hoje} min={soma(dados.hoje, -730)} onChange={(e) => setInicioEdit(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1 text-[13px]" />
                      <button type="button" onClick={() => { if (inicioEdit && inicioEdit !== dados.config!.desde) void acao({ acao: "ajustarInicio", desde: inicioEdit }).then((ok) => { if (ok) setInicioEdit(""); }); }} className="rounded-lg border border-gray-200 bg-white px-3 py-1 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Ajustar</button>
                      <span className="w-full text-[12px] text-gray-500">Antecipar traz o passado para a conta (reconstituído pelo histórico e pelas horas dedicadas). Mês fechado antes da data não pode ficar de fora.</span>
                    </div>
                    <div className="mt-4">
                      {dados.config.ativo
                        ? <button type="button" onClick={() => { if (window.confirm("Desativar? O sistema para de contar as suas horas a partir de hoje. Os dias já contados continuam.")) void acao({ acao: "desativar" }); }} className="text-[13px] font-medium text-red-600 hover:underline">Desativar o timesheet automático</button>
                        : <button type="button" onClick={() => acao({ acao: "ativar" })} className="rounded-lg bg-brand px-4 py-1.5 text-[13px] font-medium text-white hover:bg-brand-dark">Reativar</button>}
                    </div>
                  </div>
                </section>
              )}

              {/* ---------------------------------------------------------- dia a dia e regra */}
              <section className="rounded-2xl border border-gray-100 bg-white shadow-soft">
                <button type="button" onClick={() => setDiaADia((v) => !v)} className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-semibold text-gray-900" aria-expanded={diaADia}>
                  Dia a dia <span className="text-gray-400">{diaADia ? "▾" : "▸"}</span>
                </button>
                {diaADia && (
                  <div className="max-h-[28rem] overflow-auto border-t border-gray-100 px-4 py-2">
                    {dias.length === 0 && <p className="py-3 text-[13px] text-gray-500">Sem dias com horas neste período.</p>}
                    {dias.map((d) => (
                      <div key={d.dia} className="border-b border-gray-50 py-2 text-[13px] last:border-0">
                        <div className="flex items-center gap-3">
                          <span className="w-24 shrink-0 text-gray-700">{dia(d.dia)}</span>
                          <div className="min-w-0 flex-1">
                            <BarraCentros centros={[...d.centros.entries()].map(([chave, h]) => ({ chave, codccu: chave === "__sem_cc__" || chave === "__sem_projeto__" ? null : chave, percentual: (h / d.total) * 100, horas: h, identificado: chave !== "__sem_cc__" && chave !== "__sem_projeto__" }))} nomes={nomes} cor={cor} altura={10} legenda={false} />
                          </div>
                          <span className="w-16 shrink-0 text-right tabular-nums text-gray-600">{num(d.total)} h</span>
                        </div>
                        <div className="mt-1 pl-24 text-[12px] text-gray-500">{d.tarefas.map((t) => `${t.titulo} (${num(t.h)} h)`).join(" · ")}</div>
                      </div>
                    ))}
                    {r.diasSemTarefa.length > 0 && <p className="mt-2 text-[12px] text-amber-700">Dias trabalhados sem tarefa em “Fazendo”: {r.diasSemTarefa.slice(0, 20).map(dia).join(", ")}{r.diasSemTarefa.length > 20 ? ` e mais ${r.diasSemTarefa.length - 20}` : ""}.</p>}
                  </div>
                )}
              </section>

              <details className="rounded-2xl border border-gray-100 bg-white px-4 py-3 text-[13.5px] text-gray-600 shadow-soft">
                <summary className="cursor-pointer font-semibold text-gray-900">Como calculamos</summary>
                <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                  <li><b>Jornada.</b> Cada dia trabalhado vale {num(dados.config.horasPorDia)} h. Dia trabalhado é segunda a sexta, sem feriado nacional, sem feriado de Belo Horizonte e sem as ausências que você marcou. Ausência e feriado ficam fora: o percentual é do que você trabalhou (o ponto e a folha cuidam desses dias).</li>
                  <li><b>Só tarefa iniciada.</b> Uma tarefa só conta nos dias em que esteve em “Fazendo” (Bloqueado e A fazer pausam), e só enquanto era sua. Tarefa apenas planejada, com datas previstas, nunca conta.</li>
                  <li><b>Ninguém dobra.</b> Em cada dia a soma de todas as suas tarefas nunca passa da jornada: com duas tarefas ao mesmo tempo, o dia é dividido entre elas.</li>
                  <li><b>Horas dedicadas.</b> Quando você informa as horas dedicadas de uma tarefa, o sistema espalha esse total pelos dias em que ela esteve em andamento, ajustando todas as tarefas ao mesmo tempo: cada tarefa fecha no total que você informou e nenhum dia passa da jornada. Tarefa sem horas informadas ocupa o que sobrar do dia, por igual, e aparece como “estimado”.</li>
                  <li><b>Percentual.</b> Horas do centro de custo ÷ horas apontadas no período. Jornada em que não havia tarefa em andamento fica à parte (“jornada sem tarefa”) e não entra no percentual. Projeto sem centro de custo aparece em linha própria, nunca é jogado em um centro por palpite.</li>
                  <li><b>Hoje.</b> O dia de hoje conta inteiro assim que há tarefa em “Fazendo”; o percentual é o que importa e se ajusta a cada mudança. Marcos de entrega não contam, e tarefa com subtarefa sua conta só pelas subtarefas.</li>
                  <li><b>Corrigir o passado.</b> O relatório é recalculado a cada consulta: corrigir horas dedicadas, status ou ausências de dias antigos já reflete aqui. Só o mês <b>fechado</b> fica congelado; para mexer nele, peça ao administrador para reabrir.</li>
                </ol>
              </details>
            </>
          )}

          {/* ------------------------------------------------------------ equipe */}
          {aba === "equipe" && equipe && (
            <>
              <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-600">
                <span>{equipe.pessoas.length} pessoa(s) com o timesheet ativo · {num(equipe.total)} h apontadas em {rotuloPeriodo}</span>
                <div className="flex-1" />
                <a href={`/api/timesheet-auto/exportar?${consulta}`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Baixar planilha da equipe</a>
              </div>
              <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-soft">
                <div className="border-b border-gray-100 px-4 py-3 text-[15px] font-semibold text-gray-900">Horas por centro de custo (todas as pessoas)</div>
                {equipe.centros.length === 0 ? <p className="px-4 py-6 text-center text-sm text-gray-500">Sem horas neste período.</p> : equipe.centros.map((c) => (
                  <div key={c.chave} className="flex items-center justify-between gap-3 border-b border-gray-50 px-4 py-2 text-[13.5px] last:border-0">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cor(c.chave) }} aria-hidden />
                    <span className={`min-w-0 flex-1 truncate ${c.identificado ? "text-gray-800" : "text-amber-700"}`}>{rotuloDoCentro(c, equipe.nomesCentros)}</span>
                    <span className="shrink-0 tabular-nums text-gray-600">{c.pessoas} pessoa(s) · <b className="text-gray-900">{num(c.horas)} h</b></span>
                  </div>
                ))}
              </section>
              <section className="overflow-x-auto rounded-2xl border border-gray-100 bg-white shadow-soft">
                <table className="w-full min-w-[720px] text-left text-[13.5px]">
                  <thead className="bg-gray-50 text-[12px] uppercase tracking-wide text-gray-500">
                    <tr><th className="px-4 py-2">Pessoa</th><th className="px-3 py-2 text-right">Horas</th><th className="px-3 py-2 text-right">Sem tarefa</th><th className="px-3 py-2 text-right">Pendências</th><th className="w-64 px-4 py-2">Distribuição</th></tr>
                  </thead>
                  <tbody>
                    {equipe.pessoas.map((p) => (
                      <tr key={p.pessoa.id} className="border-t border-gray-100 hover:bg-gray-50">
                        <td className="px-4 py-2"><button type="button" onClick={() => { setAlvoId(p.pessoa.id === meuId ? null : p.pessoa.id); setAba("meu"); }} className="font-medium text-gray-900 hover:text-brand">{p.pessoa.name}</button>{p.pessoa.cargo && <span className="block text-[12px] text-gray-500">{p.pessoa.cargo}</span>}{p.mesesFechados.length > 0 && <span className="text-[11px] text-gray-500">fechado: {p.mesesFechados.join(", ")}</span>}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{num(p.horasAlocadas)} h</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${p.horasSemApontamento > 0 ? "text-amber-700" : "text-gray-500"}`}>{num(p.horasSemApontamento)} h</td>
                        <td className={`px-3 py-2 text-right tabular-nums ${p.avisos > 0 ? "text-amber-700" : "text-gray-400"}`}>{p.avisos}</td>
                        <td className="px-4 py-2"><BarraCentros centros={p.centros} nomes={equipe.nomesCentros} cor={cor} altura={12} legenda={false} vazio="—" /></td>
                      </tr>
                    ))}
                    {equipe.pessoas.length === 0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-gray-500">Ninguém da sua equipe ativou o timesheet ainda.</td></tr>}
                  </tbody>
                </table>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
}
