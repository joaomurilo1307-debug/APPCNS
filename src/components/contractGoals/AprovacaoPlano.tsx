"use client";

import { useEffect, useState } from "react";
import type { MetaContrato, PessoaMeta } from "@/lib/contractGoals/tipos";

const campo = "rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-800 focus:border-brand focus:outline-none disabled:bg-gray-50";
const estados: Record<string, { nome: string; cor: string }> = {
  NAO_SOLICITADA: { nome: "Aguardando execução", cor: "bg-slate-100 text-slate-600" },
  PENDENTE: { nome: "Aguardando aprovação", cor: "bg-amber-50 text-amber-800" },
  APROVADO: { nome: "Plano aprovado", cor: "bg-emerald-50 text-emerald-800" },
  REJEITADO: { nome: "Ajustes solicitados", cor: "bg-rose-50 text-rose-800" },
  REAVALIAR: { nome: "Plano alterado · precisa de nova aprovação", cor: "bg-amber-50 text-amber-800" },
};
const data = (d?: string | null) => d ? d.slice(0, 10).split("-").reverse().join("/") : null;

export default function AprovacaoPlano({ meta, onChanged }: { meta: MetaContrato; onChanged: () => Promise<void> }) {
  const [abrirEnvio, setAbrirEnvio] = useState(false);
  const [aprovadores, setAprovadores] = useState<PessoaMeta[]>([]);
  const [aprovadorId, setAprovadorId] = useState(meta.planApprover?.id ?? "");
  const [parecer, setParecer] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const temPlano = meta.hasPlan ?? Boolean(meta.standalonePlan || meta.actionPlan || meta.kind === "PLANO" || meta.actions.length);
  const status = meta.effectivePlanApprovalStatus ?? meta.planApprovalStatus ?? "NAO_SOLICITADA";
  const estado = estados[status] ?? { nome: status, cor: "bg-slate-100 text-slate-600" };
  const atividades = meta.actions.filter((a) => a.status !== "CANCELADA");
  const concluidas = atividades.filter((a) => a.status === "CONCLUIDA").length;
  const completo = atividades.length > 0 && concluidas === atividades.length;
  const percentual = meta.executionFraction === null ? null : Math.round(meta.executionFraction * 100);

  useEffect(() => {
    if (!abrirEnvio || !meta.canSubmitPlan) return;
    const controller = new AbortController(); setCarregando(true); setErro("");
    fetch(`/api/contract-goals/${meta.id}/plan/approval`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível carregar os aprovadores.");
      setAprovadores(Array.isArray(d.approvers) ? d.approvers : []);
    }).catch((e) => { if (e.name !== "AbortError") setErro(e.message); }).finally(() => { if (!controller.signal.aborted) setCarregando(false); });
    return () => controller.abort();
  }, [abrirEnvio, meta.id, meta.canSubmitPlan]);

  async function executar(operation: "submit" | "approve" | "reject") {
    setOcupado(true); setErro("");
    try {
      const r = await fetch(`/api/contract-goals/${meta.id}/plan/approval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(operation === "submit" ? { operation, approverId: aprovadorId } : { operation, note: parecer.trim() || null }) });
      const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível registrar a aprovação.");
      setAbrirEnvio(false); setParecer(""); await onChanged();
    } catch (e) { setErro(e instanceof Error ? e.message : "Falha ao registrar a decisão."); }
    finally { setOcupado(false); }
  }

  if (!temPlano) return null;
  return <section className="space-y-3 rounded-xl border border-gray-100 bg-white p-4" aria-label={`Execução e aprovação do plano da meta ${meta.title}`}>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><h5 className="text-sm font-semibold text-gray-900">Execução e aprovação do plano</h5><p className="mt-1 text-xs text-gray-500">{percentual === null ? "Execução ainda sem atividades" : `${percentual}% das atividades concluídas`}{meta.actionPlan ? " · atualizado pelo projeto vinculado" : " · atualizado pelas atividades do plano"}</p></div><span className={`rounded-md px-2.5 py-1 text-xs font-medium ${estado.cor}`}>{estado.nome}</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-gray-100" role="progressbar" aria-label="Execução do plano" aria-valuenow={percentual ?? 0} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full transition-all ${percentual === 100 ? "bg-emerald-500" : "bg-teal-500"}`} style={{ width: `${percentual ?? 0}%` }} /></div>
    {meta.planApprover && <p className="text-xs text-gray-600">Gestor aprovador: <span className="font-medium">{meta.planApprover.name}</span>{data(meta.planSubmittedAt) ? ` · enviado em ${data(meta.planSubmittedAt)}` : ""}{data(meta.planDecidedAt) ? ` · parecer em ${data(meta.planDecidedAt)}` : ""}</p>}
    {meta.planApprovalNote && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600"><span className="font-medium">Último parecer: </span>{meta.planApprovalNote}</p>}
    {status === "REAVALIAR" && <p className="text-xs text-amber-800">As atividades mudaram após o envio ou parecer. Conclua a execução e envie o plano para uma nova avaliação.</p>}
    <p className="text-xs text-gray-500">A aprovação confirma a entrega do plano. O resultado da meta continua sendo verificado pelo indicador e pelos períodos de análise.</p>
    {meta.canManage && !["PENDENTE", "APROVADO"].includes(status) && <div className="space-y-2"><button type="button" disabled={!meta.canSubmitPlan || ocupado} onClick={() => setAbrirEnvio((v) => !v)} className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-medium text-teal-800 disabled:cursor-not-allowed disabled:opacity-50">{abrirEnvio ? "Fechar envio" : "Enviar para aprovação"}</button>{!completo && <p className="text-xs text-gray-500">Conclua 100% das atividades do plano para enviar ao gestor. É necessário ter ao menos uma atividade.</p>}</div>}
    {abrirEnvio && meta.canSubmitPlan && <form className="flex flex-wrap items-end gap-3 rounded-lg bg-teal-50/40 p-3" onSubmit={async (e) => { e.preventDefault(); await executar("submit"); }}><label className="grid min-w-52 flex-1 gap-1 text-sm">Gestor para aprovação<select value={aprovadorId} onChange={(e) => setAprovadorId(e.target.value)} required disabled={carregando || ocupado} className={campo}><option value="">{carregando ? "Carregando gestores…" : "Selecione o gestor"}</option>{aprovadores.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button disabled={ocupado || carregando || !aprovadorId} className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Confirmar envio para aprovação</button>{!carregando && !aprovadores.length && <p className="w-full text-xs text-gray-500">Nenhum aprovador elegível disponível. Quem envia não pode aprovar o próprio plano.</p>}</form>}
    {(meta.canApprovePlan || meta.canRejectPlan) && <div className="space-y-3 rounded-lg border border-amber-100 bg-amber-50/40 p-3"><label className="grid gap-1 text-sm text-gray-700">Parecer do gestor<textarea value={parecer} onChange={(e) => setParecer(e.target.value)} maxLength={4000} rows={3} placeholder="Registre sua avaliação da execução e das evidências." className={campo} /></label><div className="flex flex-wrap gap-2">{meta.canApprovePlan && <button type="button" disabled={ocupado} onClick={() => void executar("approve")} className="rounded-lg bg-emerald-700 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Aprovar plano</button>}{meta.canRejectPlan && <button type="button" disabled={ocupado || parecer.trim().length < 3} onClick={() => void executar("reject")} className="rounded-lg border border-rose-200 bg-white px-3 py-2 text-sm font-medium text-rose-800 disabled:opacity-50">Solicitar ajustes</button>}</div><p className="text-xs text-gray-500">Para solicitar ajustes, descreva o motivo no parecer.</p></div>}
    {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
  </section>;
}
