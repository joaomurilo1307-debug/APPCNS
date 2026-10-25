"use client";
import { useEffect, useState } from "react";
import type { MetaContrato } from "@/lib/contractGoals/tipos";
import PainelMetasContrato from "./PainelMetasContrato";

export function SeletorMetasContrato({ codccu, selecionadas, onChange }: { codccu: string; selecionadas: string[]; onChange: (ids: string[]) => void }) {
  const [metas, setMetas] = useState<MetaContrato[]>([]);
  const [erro, setErro] = useState("");
  useEffect(() => {
    let ativo = true; setMetas([]); setErro("");
    if (codccu) fetch(`/api/contract-goals?codccu=${encodeURIComponent(codccu)}`, { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error || "Metas indisponíveis"); if (ativo) setMetas(d.goals.filter((g: MetaContrato) => g.status === "ATIVA")); }).catch((e) => { if (ativo) setErro(e.message); });
    return () => { ativo = false; };
  }, [codccu]);
  if (!codccu) return null;
  return <fieldset className="space-y-2 rounded-lg border border-gray-200 p-3"><legend className="px-1 text-sm font-medium">Metas e planos do contrato (opcional)</legend><p className="text-xs text-gray-500">O projeto acompanha as mesmas metas e ações, sem criar outra medição.</p>{erro && <p className="text-xs text-gray-500">{erro}. Você pode criar o projeto sem associar uma meta.</p>}{metas.map((g) => <label key={g.id} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={selecionadas.includes(g.id)} onChange={(e) => onChange(e.target.checked ? [...new Set([...selecionadas, g.id])] : selecionadas.filter((id) => id !== g.id))} /><span>{g.title} <span className="text-xs text-gray-400">· {g.kind === "PLANO" ? "Plano livre" : "Indicador"}</span></span></label>)}{!erro && metas.length === 0 && <p className="text-xs text-gray-500">Nenhuma meta ativa neste contrato.</p>}</fieldset>;
}

export function AssociarMetaProjeto({ projectId, associadas, onLinked }: { projectId: string; associadas: string[]; onLinked: () => void }) {
  const [metas, setMetas] = useState<MetaContrato[]>([]); const [id, setId] = useState(""); const [erro, setErro] = useState(""); const [ocupado, setOcupado] = useState(false);
  useEffect(() => { let ativo = true; fetch(`/api/contract-goals?projectId=${encodeURIComponent(projectId)}`, { cache: "no-store" }).then(async (r) => { const d = await r.json(); if (r.ok && ativo) setMetas(d.goals.filter((g: MetaContrato) => g.status === "ATIVA")); }).catch(() => {}); return () => { ativo = false; }; }, [projectId]);
  const disponiveis = metas.filter((g) => !associadas.includes(g.id));
  if (!disponiveis.length) return null;
  return <form className="mb-4 flex flex-wrap gap-2 rounded-xl border border-brand/20 bg-white p-3" onSubmit={async (e) => { e.preventDefault(); const meta = disponiveis.find((g) => g.id === id); if (!meta) return; setOcupado(true); setErro(""); try { const r = await fetch(`/api/projects/${projectId}/goals`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ title: meta.title, contractGoalId: id }) }); const d = await r.json(); if (!r.ok) throw new Error(d.error || "Não foi possível associar"); setId(""); onLinked(); } catch (err) { setErro(err instanceof Error ? err.message : "Falha ao associar"); } finally { setOcupado(false); } }}><select aria-label="Meta do contrato para associar" required value={id} onChange={(e) => setId(e.target.value)} className="min-w-52 flex-1 rounded-lg border border-gray-200 p-2 text-sm"><option value="">Associar uma meta ou plano do contrato</option>{disponiveis.map((g) => <option key={g.id} value={g.id}>{g.title}</option>)}</select><button disabled={ocupado} className="rounded-lg bg-brand px-3 py-2 text-sm text-white disabled:opacity-50">Associar</button>{erro && <p role="alert" className="w-full text-sm text-red-700">{erro}</p>}</form>;
}

export function MetaVinculadaProjeto({ meta, onChanged }: { meta: MetaContrato; onChanged?: () => void }) {
  const [abrir, setAbrir] = useState(false);
  const valor = meta.currentValue === null ? "Sem medição" : meta.currentValue.toLocaleString("pt-BR", { maximumFractionDigits: 2 }) + (meta.unit === "%" ? "%" : meta.unit === "R$" ? " R$" : "");
  return <article className="space-y-3 rounded-xl border border-brand/20 bg-white p-4"><div><p className="text-xs font-medium text-brand">{meta.kind === "PLANO" ? "Plano livre" : "Indicador"} do contrato · CCU {meta.contrato.codccu}</p><h3 className="mt-1 font-semibold">{meta.title}</h3><p className="mt-1 text-sm text-gray-500">{meta.kind === "PLANO" ? meta.executionFraction === null ? "Sem ações registradas" : `${Math.round(meta.executionFraction * 100)}% das ações concluídas` : `${valor} · ${meta.fraction === null ? "avanço ainda não medido" : `${Math.round(meta.fraction * 100)}% até o alvo`}`}</p><p className="mt-1 text-xs text-gray-400">Esta é a mesma meta canônica do contrato; suas ações e medições são compartilhadas.</p></div><button onClick={() => setAbrir((v) => !v)} className="text-sm font-medium text-brand">{abrir ? "Fechar detalhes" : "Abrir meta e plano de ação"}</button>{abrir && <PainelMetasContrato codccu={meta.contrato.codccu} goalId={meta.id} onChange={onChanged} />}</article>;
}
