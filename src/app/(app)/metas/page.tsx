"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import Link from "next/link";

type SubGoal = {
  id: string;
  title: string;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  fraction: number;
  project: { id: string; name: string } | null;
  assignedUsers: { id: string; name: string; avatarColor: string | null }[];
  autoFromProjectProgress: boolean;
  contributionValue: number | null;
};

type Goal = {
  id: string;
  title: string;
  description: string | null;
  targetValue: number | null;
  currentValue: number;
  computedCurrentValue: number | null;
  fraction?: number | null;
  sectorSummary?: { configuredWeight: number; evaluatedWeight: number; unevaluatedWeight: number; unconfiguredWeight: number; weightedFraction: number | null; knownFraction: number; contributionCount: number; hiddenCount: number; contributions: { id: string; title: string; weight: number; fraction: number | null; executionFraction: number | null; weightedFraction: number | null; codccu?: string | null }[] } | null;
  unit: string | null;
  dueDate: string | null;
  assignedUsers: { id: string; name: string; avatarColor: string | null }[];
  assignedTeam: { id: string; name: string } | null;
  subGoals: SubGoal[];
};

function MetasGerais() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const canCreate = role === "ADMIN" || role === "DIRETOR";

  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [dueDate, setDueDate] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editDueDate, setEditDueDate] = useState("");

  async function load() {
    const res = await fetch("/api/goals");
    if (res.ok) setGoals(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/goals", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        targetValue: targetValue ? Number(targetValue) : null,
        unit: unit || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      }),
    });
    setTitle("");
    setTargetValue("");
    setUnit("");
    setDueDate("");
    setShowForm(false);
    load();
  }

  async function handleDelete(id: string) {
    if (!confirm("Excluir esta meta? As subMetas ligadas a ela ficam soltas (não são excluídas).")) return;
    await fetch(`/api/goals/${id}`, { method: "DELETE" });
    load();
  }

  function startEdit(g: Goal) {
    setEditingId(g.id);
    setEditTitle(g.title);
    setEditTargetValue(g.targetValue?.toString() ?? "");
    setEditUnit(g.unit ?? "");
    setEditDueDate(g.dueDate ? g.dueDate.slice(0, 10) : "");
  }

  async function handleSaveEdit(id: string) {
    await fetch(`/api/goals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        targetValue: editTargetValue ? Number(editTargetValue) : null,
        unit: editUnit || null,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
      }),
    });
    setEditingId(null);
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Metas</h1>
          <p className="text-sm text-gray-500">
            Metas gerais da empresa. Cada projeto pode ligar uma meta dele como subMeta — o progresso soma
            automaticamente aqui.
          </p>
        </div>
        {canCreate && (
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Nova meta geral
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-8 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <input
            required
            placeholder="Título da meta (ex: 10 POCs no ano)"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5"
          />
          <input
            type="number"
            placeholder="Valor alvo (ex: 10)"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <input
            placeholder="Unidade (ex: POC, %, un)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-500">
            Prazo (opcional)
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5" />
          </label>
          <button className="col-span-2 rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Criar meta geral
          </button>
        </form>
      )}

      <div className="flex flex-col gap-4">
        {goals.map((g) => {
          const setor = g.sectorSummary && g.sectorSummary.contributionCount > 0 ? g.sectorSummary : null;
          const value = g.subGoals.length > 0 ? g.computedCurrentValue : g.currentValue;
          const pct = g.targetValue && value !== null ? Math.min(100, Math.round((value / g.targetValue) * 100)) : 0;
          return (
            <div key={g.id} id={`meta-setor-${g.id}`} className="scroll-mt-6 rounded-xl border border-gray-200 bg-white p-4">
              {editingId === g.id ? (
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5"
                  />
                  <input
                    type="number"
                    placeholder="Valor alvo"
                    value={editTargetValue}
                    onChange={(e) => setEditTargetValue(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1.5"
                  />
                  <input
                    placeholder="Unidade"
                    value={editUnit}
                    onChange={(e) => setEditUnit(e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1.5"
                  />
                  <label className="col-span-2 flex flex-col gap-1 text-xs text-gray-500">
                    Prazo
                    <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5" />
                  </label>
                  <div className="col-span-2 flex gap-2">
                    <button onClick={() => handleSaveEdit(g.id)} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
                      Salvar
                    </button>
                    <button onClick={() => setEditingId(null)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
                      Cancelar
                    </button>
                  </div>
                </div>
              ) : (
                <>
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{g.title}</p>
                  {g.description && <p className="text-xs text-gray-500">{g.description}</p>}
                </div>
                {canCreate && (
                  <div className="flex gap-2">
                    <button onClick={() => startEdit(g)} className="text-xs text-brand-dark hover:underline">
                      Editar
                    </button>
                    <button onClick={() => handleDelete(g.id)} className="text-xs text-red-400 hover:text-red-700">
                      Excluir
                    </button>
                  </div>
                )}
              </div>

              {g.assignedUsers.length > 0 && (
                <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                  {g.assignedUsers.map((u) => (
                    <span key={u.id} className="flex items-center gap-1">
                      <Avatar name={u.name} color={u.avatarColor} size={18} />
                      {u.name}
                    </span>
                  ))}
                </div>
              )}

              {setor ? <section className="mb-3 space-y-3 rounded-xl border border-teal-100 bg-teal-50/30 p-4" aria-label={`Resultado ponderado da meta ${g.title}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold text-teal-800">Resultado ponderado das metas vinculadas</p><p className="text-sm font-semibold text-gray-900">{setor.weightedFraction === null ? "Aguardando avaliações completas" : `${(setor.weightedFraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% da composição`}</p></div>
                <div className="h-2 overflow-hidden rounded-full bg-white" role="progressbar" aria-label="Resultado ponderado da meta do setor" aria-valuenow={setor.weightedFraction === null ? undefined : Math.round(setor.weightedFraction * 100)} aria-valuemin={0} aria-valuemax={100}><div className={`h-full rounded-full ${setor.weightedFraction === null ? "bg-amber-400" : "bg-teal-500"}`} style={{ width: `${Math.max(0, Math.min(100, (setor.weightedFraction ?? setor.knownFraction) * 100))}%` }} /></div>
                {setor.weightedFraction === null && <p className="text-xs text-amber-800">Parte conhecida: {(setor.knownFraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} pontos percentuais. Há contribuições sem avaliação ou sem acesso à fonte; este não é um resultado final.</p>}
                <p className="text-xs text-gray-500">Pesos configurados: {setor.configuredWeight.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · ainda sem configuração: {setor.unconfiguredWeight.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%{setor.unevaluatedWeight > 0 ? ` · aguardando avaliação: ${setor.unevaluatedWeight.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%` : ""}</p>
                <div className="space-y-2">{setor.contributions.map((contribuicao) => <div key={contribuicao.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-xs"><div>{contribuicao.codccu ? <Link href={`/contratos/${contribuicao.codccu}?aba=metas&meta=${contribuicao.id}#meta-contrato-${contribuicao.id}`} className="font-medium text-teal-800 hover:underline">{contribuicao.title} ↗</Link> : <span className="font-medium text-gray-700">{contribuicao.title}</span>}<p className="mt-1 text-gray-400">Peso {contribuicao.weight.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}% · avanço {contribuicao.fraction === null ? "aguardando avaliação" : `${Math.round(contribuicao.fraction * 100)}%`}</p></div><span className="font-semibold text-gray-700">{contribuicao.weightedFraction === null ? "Sem avaliação" : `${(contribuicao.weightedFraction * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} p.p.`}</span></div>)}</div>
                {setor.hiddenCount > 0 && <p className="text-xs text-gray-500">Há contribuições restritas ao seu acesso.</p>}
                <p className="text-xs text-gray-500">Cada avanço é multiplicado pelo peso configurado. Os pesos não são redistribuídos automaticamente; este percentual mede a composição da meta e não um valor financeiro realizado.</p>
              </section> : g.targetValue !== null && (
                <>
                  <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mb-3 text-xs text-gray-500">
                    {value === null ? "Sem avaliação" : value.toFixed(1)}
                    {g.unit ? ` ${g.unit}` : ""} de {g.targetValue}
                    {g.unit ? ` ${g.unit}` : ""} ({pct}%)
                  </p>
                </>
              )}

              {g.subGoals.length > 0 && (
                <div className="mt-2 flex flex-col gap-2 border-t border-gray-100 pt-3">
                  <p className="text-xs font-semibold text-gray-500">SubMetas ({g.subGoals.length})</p>
                  {g.subGoals.map((sg) => (
                    <div key={sg.id} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-xs">
                      <div className="flex items-center gap-2">
                        {sg.assignedUsers.slice(0, 3).map((u) => (
                          <Avatar key={u.id} name={u.name} color={u.avatarColor} size={18} />
                        ))}
                        <span>
                          {sg.title}
                          {sg.project && <span className="text-gray-400"> · {sg.project.name}</span>}
                          {sg.autoFromProjectProgress && <span className="text-gray-400"> · auto pelo progresso do projeto</span>}
                        </span>
                      </div>
                      <span className="font-medium">{Math.round(sg.fraction * 100)}%</span>
                    </div>
                  ))}
                </div>
              )}
                </>
              )}
            </div>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-gray-400">Nenhuma meta geral cadastrada ainda.</p>}
      </div>
    </div>
  );
}

export default function MetasPage() {
  return <MetasGerais />;
}
