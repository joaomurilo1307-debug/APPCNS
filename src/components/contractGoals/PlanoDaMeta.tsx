"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { MetaContrato, PessoaMeta } from "@/lib/contractGoals/tipos";

const campo = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none";
export default function PlanoDaMeta({ meta, pessoas, abrirInicialmente = false, onLoadPeople, onChanged, onPrepared }: { meta: MetaContrato; pessoas: PessoaMeta[]; abrirInicialmente?: boolean; onLoadPeople: () => Promise<void>; onChanged: () => Promise<void>; onPrepared?: () => void }) {
  const [aberto, setAberto] = useState(abrirInicialmente);
  const temPlano = meta.hasPlan ?? Boolean(meta.standalonePlan || meta.kind === "PLANO" || meta.actions.length);
  const podeConverter = meta.canConvertPlan ?? meta.canManage;
  const [modo, setModo] = useState<"prepare" | "link">(temPlano ? "link" : "prepare");
  const [projetos, setProjetos] = useState<{ id: string; name: string }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  useEffect(() => { if (abrirInicialmente && !temPlano) { setModo("prepare"); setAberto(true); } }, [abrirInicialmente, temPlano]);
  useEffect(() => {
    if (!aberto || modo === "prepare" || !temPlano || meta.actionPlan || !podeConverter) return;
    const controller = new AbortController(); setCarregando(true); setErro("");
    void onLoadPeople();
    fetch(`/api/contract-goals/${meta.id}/plan`, { cache: "no-store", signal: controller.signal }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível carregar os projetos."); setProjetos(Array.isArray(d.projects) ? d.projects : []); }).catch((e) => { if (e.name !== "AbortError") setErro(e.message); }).finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [aberto, modo, temPlano, podeConverter, meta.id, meta.actionPlan, onLoadPeople]);
  if (meta.actionPlan) return <div className="flex flex-wrap items-center gap-4 rounded-xl border border-teal-100 bg-gradient-to-r from-teal-50/70 to-white p-4"><div className="grid h-11 w-11 place-items-center rounded-xl bg-white text-xl text-teal-700" aria-hidden>↗</div><div className="min-w-0 flex-1"><p className="text-xs font-medium text-teal-700">Plano de ação · projeto vinculado</p><Link href={`/projetos/${meta.actionPlan.id}`} className="mt-1 block truncate font-semibold text-gray-900 hover:underline">{meta.actionPlan.name}</Link><p className="mt-1 text-xs text-gray-500">{meta.actionPlan.completedCount} de {meta.actionPlan.taskCount} atividades concluídas · equipe, prazos e atividades compartilhados</p></div><Link href={`/projetos/${meta.actionPlan.id}`} className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-800 hover:bg-teal-50">Abrir em Projetos ↗</Link></div>;
  if (!temPlano && (!meta.canManage || meta.canCreatePlan === false)) return <p className="rounded-lg bg-gray-50 p-3 text-sm text-gray-500">O responsável pela meta pode criar seu plano de ação.</p>;
  return <div className="rounded-xl border border-dashed border-teal-200 bg-teal-50/20 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-semibold text-gray-800">{temPlano ? meta.standalonePlan?.name ?? meta.title : "Como esta meta será alcançada?"}</p>{temPlano && meta.standalonePlan?.description && <p className="mt-2 text-sm leading-relaxed text-gray-600">{meta.standalonePlan.description}</p>}<p className="mt-1 text-xs leading-relaxed text-gray-500">{temPlano ? "Este plano organiza as ações para alcançar a meta. Se desejar, abra a criação em Projetos e continue montando a equipe e as atividades." : "Crie o plano de ação, defina atividades, responsáveis e prazos. Depois, você poderá transformá-lo em projeto se quiser."}</p></div>{!temPlano && <button type="button" onClick={() => { setModo("prepare"); setAberto((v) => !v); setErro(""); }} className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-800">{aberto ? "Fechar configuração" : "+ Criar plano de ação"}</button>}</div>
    {temPlano && podeConverter && <div className="mt-4 flex flex-wrap gap-2"><Link href={`/projetos?planoMeta=${encodeURIComponent(meta.id)}`} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white">Criar projeto a partir deste plano</Link><button type="button" onClick={() => { setModo("link"); setAberto(true); setErro(""); }} className="rounded-lg border border-teal-200 bg-white px-3 py-2 text-sm font-medium text-teal-800">Associar projeto existente</button></div>}
    {temPlano && !podeConverter && meta.canManage && <p className="mt-3 text-xs text-gray-500">Você pode acompanhar o plano aqui. Para criar ou associar um projeto, é necessário ter permissão de edição em Projetos.</p>}
    {aberto && (modo === "prepare" ? meta.canManage && meta.canCreatePlan !== false : temPlano && podeConverter) && <form key={modo} className="mt-5 space-y-4 border-t border-teal-100 pt-4" onSubmit={async (e) => {
      e.preventDefault(); const f = new FormData(e.currentTarget); setOcupado(true); setErro("");
      try {
        const r = await fetch(`/api/contract-goals/${meta.id}/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(modo === "prepare" ? { mode: "prepare", name: f.get("name"), description: f.get("description") || null } : { mode: "link", projectId: f.get("projectId") }) });
        const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível vincular o plano.");
        setAberto(false); await onChanged(); if (modo === "prepare") onPrepared?.();
      } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao salvar o plano."); }
      finally { setOcupado(false); }
    }}>
      {modo === "prepare" ? <div className="grid gap-3"><label className="grid gap-1 text-sm">Nome do plano de ação<input name="name" required minLength={2} maxLength={150} defaultValue={meta.title.slice(0, 150)} className={campo} /></label><label className="grid gap-1 text-sm">Descrição do plano<textarea name="description" rows={3} maxLength={4000} placeholder="Quais ações vão contribuir para a melhoria?" className={campo} /></label><p className="text-xs text-gray-500">Salvar o plano não cria um projeto.</p></div> : <label className="grid gap-1 text-sm">Projeto para executar a meta<select name="projectId" required disabled={carregando} className={campo}><option value="">{carregando ? "Carregando projetos…" : "Selecione um projeto"}</option>{projetos.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>{!carregando && !projetos.length && <span className="text-xs text-gray-500">Nenhum projeto elegível para associar. O plano continua disponível aqui.</span>}</label>}
      {modo !== "prepare" && meta.actions.some((a) => !a.taskId && a.status !== "CANCELADA") && <p className="rounded-lg bg-teal-50 p-3 text-xs text-teal-900">As atividades e seus responsáveis serão incorporados ao projeto uma única vez, mantendo o vínculo com a meta.</p>}
      {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
      <div className="flex flex-wrap gap-2"><button disabled={ocupado || (modo === "link" && (carregando || !projetos.length))} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{ocupado ? "Salvando…" : modo === "prepare" ? "Salvar plano de ação" : "Associar projeto à meta"}</button><button type="button" disabled={ocupado} onClick={() => setAberto(false)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600">{modo === "prepare" ? "Cancelar" : "Manter somente como plano"}</button></div>
    </form>}
  </div>;
}

