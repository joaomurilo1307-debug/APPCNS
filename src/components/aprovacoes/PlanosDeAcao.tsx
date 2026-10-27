"use client";
import { useCallback, useEffect, useState } from "react";
import DetalhesItemPlano from "./DetalhesItemPlano";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";

type Plano = { id: string; title: string; planName: string; description: string | null; activities: { id: string; title: string; description: string | null; ownerName: string; dueDate: string | null; status: string; taskId?: string | null; startDate?: string | null; actualEndedAt?: string | null; planDetails?: Parameters<typeof DetalhesItemPlano>[0]["details"] }[]; status: string; submittedAt: string | null; requestedBy: string; note: string | null; execution: { completed: number; total: number }; canDecide: boolean };
const nomes: Record<string, string> = { PENDENTE: "Aguardando sua aprovação", APROVADO: "Aprovado", REJEITADO: "Revisão solicitada", REAVALIAR: "Plano alterado após o envio" };
export default function PlanosDeAcao() {
  const [planos, setPlanos] = useState<Plano[]>([]), [erro, setErro] = useState(""), [ocupado, setOcupado] = useState<string | null>(null), [notas, setNotas] = useState<Record<string, string>>({});
  const carregar = useCallback(async () => {
    try { const r = await fetch("/api/contract-goals/approvals", { cache: "no-store" }); if (r.status === 403) { setPlanos([]); return; } const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível carregar os planos."); setPlanos(d.plans ?? []); setErro(""); }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha ao carregar aprovações dos planos."); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useAtualizarAoVoltar(carregar);
  async function decidir(plano: Plano, operation: "approve" | "reject") {
    setOcupado(plano.id); setErro("");
    try { const r = await fetch(`/api/contract-goals/${plano.id}/plan/approval`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ operation, note: notas[plano.id] || null }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível registrar a decisão."); await carregar(); }
    catch (e) { setErro(e instanceof Error ? e.message : "Falha ao decidir o plano."); }
    finally { setOcupado(null); }
  }
  if (!planos.length && !erro) return null;
  return <section className="mb-8 space-y-3" aria-label="Aprovação de planos de ação">
    <h2 className="text-sm font-semibold text-gray-600">Planos de ação das metas ({planos.filter((p) => p.canDecide).length} pendentes)</h2>
    {erro && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{erro}</p>}
    {planos.map((p) => <article key={p.id} className="rounded-xl border border-gray-200 bg-white p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-medium text-gray-900">{p.planName}</p><p className="mt-1 text-xs text-gray-500">Meta: {p.title} · Responsável: {p.requestedBy}</p><p className="mt-1 text-xs text-gray-500">{p.execution.completed} de {p.execution.total} atividades concluídas{p.submittedAt ? ` · enviado em ${p.submittedAt.slice(0, 10).split("-").reverse().join("/")}` : ""}</p></div><span className={`rounded-lg px-2 py-1 text-xs ${p.status === "APROVADO" ? "bg-teal-50 text-teal-800" : p.status === "PENDENTE" ? "bg-amber-50 text-amber-800" : "bg-gray-100 text-gray-600"}`}>{nomes[p.status] || p.status}</span></div>
      <details className="mt-3 rounded-lg border border-gray-100 p-3"><summary className="cursor-pointer text-sm font-medium text-teal-800">Conferir plano e atividades antes de decidir</summary>{p.description && <p className="mt-3 whitespace-pre-wrap text-sm text-gray-600">{p.description}</p>}<ul className="mt-3 space-y-3">{p.activities.map((a) => <li key={a.id} className="rounded-lg bg-gray-50 p-3 text-sm"><p className="font-medium text-gray-800">{a.title}</p>{a.description && <p className="mt-1 whitespace-pre-wrap text-gray-600">{a.description}</p>}<p className="mt-2 text-xs text-gray-500">{a.ownerName} · {a.dueDate ? a.dueDate.slice(0, 10).split("-").reverse().join("/") : "Sem prazo"} · {a.status === "CONCLUIDA" ? "Concluída" : a.status === "CANCELADA" ? "Cancelada" : "Em execução"}</p><DetalhesItemPlano details={a.planDetails} startDate={a.startDate} actualEndedAt={a.actualEndedAt} dueDate={a.dueDate} canonical={Boolean(a.taskId)} status={a.status} /></li>)}</ul></details>
      {p.note && <p className="mt-3 text-sm text-gray-600">{p.note}</p>}
      {p.canDecide && <div className="mt-4 flex flex-wrap gap-2"><input aria-label={`Parecer sobre ${p.planName}`} placeholder="Parecer ou orientação para o responsável" maxLength={4000} value={notas[p.id] || ""} onChange={(e) => setNotas((n) => ({ ...n, [p.id]: e.target.value }))} className="min-w-60 flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm" /><button disabled={ocupado === p.id} onClick={() => void decidir(p, "approve")} className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50">Aprovar plano</button><button disabled={ocupado === p.id} onClick={() => void decidir(p, "reject")} className="rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:opacity-50">Solicitar revisão</button></div>}
      {p.status === "REAVALIAR" && <p className="mt-3 text-xs text-amber-800">O responsável deve concluir as alterações e enviar o plano novamente para sua análise.</p>}
    </article>)}
  </section>;
}
