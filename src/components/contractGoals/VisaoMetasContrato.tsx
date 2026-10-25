"use client";

import { STATUS_ACAO } from "@/lib/contractGoals/calculo";
import type { AcaoMeta, MetaContrato } from "@/lib/contractGoals/tipos";

export type FocoMetas = "todas" | "ativas" | "atingidas" | "atencao";
export const diaAtual = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const prazoVencido = (prazo: string | null, hoje: string) => !!prazo && prazo.slice(0, 10) < hoje;
export const acaoPendente = (acao: AcaoMeta) => !["CONCLUIDA", "CANCELADA"].includes(acao.status);
export function precisaAtencao(meta: MetaContrato, hoje: string) {
  return !["CONCLUIDA", "ARQUIVADA"].includes(meta.status) && (
    prazoVencido(meta.dueDate, hoje) || meta.actions.some((a) => acaoPendente(a) && (a.status === "BLOQUEADA" || prazoVencido(a.dueDate, hoje)))
  );
}

export function AnelProgresso({ valor, titulo }: { valor: number | null; titulo: string }) {
  const pct = valor === null ? null : Math.round(Math.max(0, Math.min(1, valor)) * 100);
  return <div className="relative grid h-16 w-16 shrink-0 place-items-center" role="img" aria-label={`${titulo}: ${pct === null ? "sem medição" : `${pct}%`}`}>
    <svg viewBox="0 0 64 64" className="absolute inset-0 h-16 w-16 -rotate-90" aria-hidden>
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" className="text-teal-50" />
      <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="5" pathLength="100" strokeDasharray={`${pct ?? 0} 100`} strokeLinecap="round" className="text-teal-500 transition-all duration-300 motion-reduce:transition-none" />
    </svg>
    <span className="text-sm font-semibold tabular-nums text-teal-900">{pct === null ? "—" : `${pct}%`}</span>
  </div>;
}

export function ResumoMetas({ metas, foco, onFoco }: { metas: MetaContrato[]; foco: FocoMetas; onFoco: (foco: FocoMetas) => void }) {
  const hoje = diaAtual();
  const acoes = metas.flatMap((m) => m.actions);
  const concluidas = acoes.filter((a) => a.status === "CONCLUIDA").length;
  const indicadores = [
    { id: "todas" as const, nome: "Iniciativas", valor: metas.length, detalhe: "metas e planos no recorte", cor: "bg-teal-50 text-teal-700" },
    { id: "ativas" as const, nome: "Em acompanhamento", valor: metas.filter((m) => m.status === "ATIVA").length, detalhe: "iniciativas ativas", cor: "bg-sky-50 text-sky-700" },
    { id: "atingidas" as const, nome: "Alvos atingidos", valor: metas.filter((m) => m.kind === "INDICADOR" && m.fraction === 1).length, detalhe: "indicadores que chegaram ao alvo", cor: "bg-emerald-50 text-emerald-700" },
    { id: "atencao" as const, nome: "Precisam de atenção", valor: metas.filter((m) => precisaAtencao(m, hoje)).length, detalhe: "prazo vencido ou ação bloqueada", cor: "bg-amber-50 text-amber-800" },
  ];
  return <div className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{indicadores.map((item) => <button key={item.id} type="button" aria-pressed={foco === item.id} onClick={() => onFoco(foco === item.id ? "todas" : item.id)} className={`rounded-2xl border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-soft motion-reduce:transform-none ${foco === item.id ? "border-teal-500 ring-1 ring-teal-500/20" : "border-gray-100"}`}>
      <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium text-gray-500">{item.nome}</span><span className={`grid h-8 min-w-8 place-items-center rounded-xl px-2 text-lg font-semibold tabular-nums ${item.cor}`}>{item.valor}</span></div>
      <p className="mt-3 text-xs text-gray-400">{item.detalhe}</p>
    </button>)}</div>
    <div className="flex flex-wrap items-center gap-3 rounded-xl bg-slate-900 px-4 py-3 text-white">
      <span className="text-sm font-medium">Da intenção à execução</span><span className="text-xs text-slate-300">{concluidas} de {acoes.length} ações concluídas</span>
      <div className="h-1.5 min-w-24 flex-1 overflow-hidden rounded-full bg-slate-700"><div className="h-full rounded-full bg-teal-400 transition-all motion-reduce:transition-none" style={{ width: `${acoes.length ? concluidas / acoes.length * 100 : 0}%` }} /></div>
      <span className="text-xs text-slate-300">Ações e resultados acompanhados separadamente</span>
    </div>
  </div>;
}

const colunas = [
  { id: "A_FAZER", cor: "bg-slate-400", fundo: "bg-slate-50", descricao: "Próximos passos" },
  { id: "EM_ANDAMENTO", cor: "bg-sky-500", fundo: "bg-sky-50/60", descricao: "O trabalho em movimento" },
  { id: "BLOQUEADA", cor: "bg-amber-500", fundo: "bg-amber-50/60", descricao: "Destrave para avançar" },
  { id: "CONCLUIDA", cor: "bg-teal-500", fundo: "bg-teal-50/60", descricao: "Entregas realizadas" },
] as const;

export function QuadroAcoes({ metas, ocupado, onAlterar, onAbrir }: { metas: MetaContrato[]; ocupado: boolean; onAlterar: (metaId: string, acaoId: string, status: string) => Promise<unknown>; onAbrir: (id: string) => void }) {
  const hoje = diaAtual();
  const acoes = metas.flatMap((meta) => meta.actions.map((acao) => ({ meta, acao })));
  return <section className="space-y-4" aria-label="Quadro de ações">
    <div className="flex flex-wrap items-end justify-between gap-2"><div><h3 className="text-lg font-semibold text-gray-900">Cada ação, um passo adiante</h3><p className="mt-1 text-sm text-gray-500">Altere a situação no cartão. A mudança aparece na meta e nos projetos associados.</p></div><span className="text-xs text-gray-400">{acoes.filter(({ acao }) => acao.status !== "CANCELADA").length} ações no quadro</span></div>
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">{colunas.map((coluna) => {
      const itens = acoes.filter(({ acao }) => acao.status === coluna.id).sort((a, b) => (a.acao.dueDate ?? "9999").localeCompare(b.acao.dueDate ?? "9999"));
      return <section key={coluna.id} aria-label={STATUS_ACAO[coluna.id]} className={`min-w-0 rounded-2xl border border-gray-100 p-3 ${coluna.fundo}`}>
        <header className="mb-4 flex items-start justify-between gap-2 px-1"><div><h4 className="flex items-center gap-2 text-sm font-semibold text-gray-800"><span className={`h-2 w-2 rounded-full ${coluna.cor}`} />{STATUS_ACAO[coluna.id]}</h4><p className="mt-1 text-xs text-gray-400">{coluna.descricao}</p></div><span className="rounded-lg bg-white px-2 py-0.5 text-xs font-semibold text-gray-500">{itens.length}</span></header>
        <div className="space-y-3">{itens.map(({ meta, acao }) => <article key={acao.id} className="space-y-3 rounded-xl border border-white bg-white p-4 shadow-sm">
          <button type="button" onClick={() => onAbrir(meta.id)} className="line-clamp-2 text-left text-[11px] font-medium text-teal-700 hover:underline">CCU {meta.contrato.codccu} · {meta.title}</button>
          <h5 className="text-sm font-semibold leading-relaxed text-gray-800">{acao.title}</h5>
          {acao.description && <p className="line-clamp-3 text-xs leading-relaxed text-gray-500">{acao.description}</p>}
          <div className="flex flex-wrap items-center gap-2 text-xs"><span className="grid h-6 w-6 place-items-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600" aria-hidden>{acao.owner?.name.split(/\s+/).filter(Boolean).slice(0, 2).map((n) => n[0]).join("") || "—"}</span><span className="min-w-0 flex-1 text-gray-600">{acao.owner?.name ?? "Sem responsável"}</span></div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3"><span className={`rounded-md px-2 py-1 text-[11px] ${acaoPendente(acao) && prazoVencido(acao.dueDate, hoje) ? "bg-rose-50 font-medium text-rose-700" : "bg-gray-50 text-gray-500"}`}>{acao.dueDate ? `${acaoPendente(acao) && prazoVencido(acao.dueDate, hoje) ? "Atrasada · " : ""}${acao.dueDate.slice(0, 10).split("-").reverse().join("/")}` : "Sem prazo"}</span><button type="button" onClick={() => onAbrir(meta.id)} className="text-[11px] font-medium text-teal-700 hover:underline">Abrir meta ↗</button></div>
          {acao.canUpdate && <select aria-label={`Situação da ação ${acao.title}`} disabled={ocupado} value={acao.status} onChange={(e) => void onAlterar(meta.id, acao.id, e.target.value)} className="w-full rounded-lg border border-gray-200 bg-white px-2 py-2 text-xs text-gray-700 disabled:opacity-50">{Object.entries(STATUS_ACAO).map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}</select>}
        </article>)}{itens.length === 0 && <p className="rounded-xl border border-dashed border-gray-200 px-3 py-7 text-center text-xs text-gray-400">Nenhuma ação nesta etapa.</p>}</div>
      </section>;
    })}</div>
    {acoes.some(({ acao }) => acao.status === "CANCELADA") && <details className="rounded-xl border border-gray-100 bg-white p-4"><summary className="cursor-pointer text-sm text-gray-500">Ações canceladas ({acoes.filter(({ acao }) => acao.status === "CANCELADA").length})</summary><div className="mt-3 space-y-2">{acoes.filter(({ acao }) => acao.status === "CANCELADA").map(({ meta, acao }) => <div key={acao.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 p-3 text-sm"><span>{acao.title}</span>{acao.canUpdate && <button disabled={ocupado} type="button" onClick={() => void onAlterar(meta.id, acao.id, "A_FAZER")} className="text-teal-700 hover:underline">Retomar ação</button>}</div>)}</div></details>}
    {metas.some((m) => m.canManage) && <div className="rounded-2xl border border-dashed border-teal-200 bg-white p-5"><p className="text-sm font-medium text-gray-800">Planeje o próximo passo</p><p className="mt-1 text-xs text-gray-500">Abra uma iniciativa para incluir ações, responsáveis e prazos.</p><div className="mt-3 flex flex-wrap gap-2">{metas.filter((m) => m.canManage).map((m) => <button key={m.id} type="button" onClick={() => onAbrir(m.id)} className="max-w-full truncate rounded-lg border border-teal-100 bg-teal-50 px-3 py-2 text-xs font-medium text-teal-800 hover:bg-teal-100">+ {m.title}</button>)}</div></div>}
  </section>;
}
