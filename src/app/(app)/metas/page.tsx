"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";

type SubGoal = {
  id: string;
  title: string;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  fraction: number;
  project: { id: string; name: string } | null;
  assignedUser: { id: string; name: string; avatarColor: string | null } | null;
  autoFromProjectProgress: boolean;
  contributionValue: number | null;
};

type Goal = {
  id: string;
  title: string;
  description: string | null;
  targetValue: number | null;
  currentValue: number;
  computedCurrentValue: number;
  unit: string | null;
  dueDate: string | null;
  assignedUser: { id: string; name: string; avatarColor: string | null } | null;
  assignedTeam: { id: string; name: string } | null;
  subGoals: SubGoal[];
};

export default function MetasPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const canCreate = role === "ADMIN" || role === "DIRETOR";

  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [dueDate, setDueDate] = useState("");

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
          const value = g.subGoals.length > 0 ? g.computedCurrentValue : g.currentValue;
          const pct = g.targetValue ? Math.min(100, Math.round((value / g.targetValue) * 100)) : 0;
          return (
            <div key={g.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-2 flex items-center justify-between">
                <div>
                  <p className="font-medium">{g.title}</p>
                  {g.description && <p className="text-xs text-gray-500">{g.description}</p>}
                </div>
                {canCreate && (
                  <button onClick={() => handleDelete(g.id)} className="text-xs text-red-400 hover:text-red-700">
                    Excluir
                  </button>
                )}
              </div>

              {g.targetValue && (
                <>
                  <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="mb-3 text-xs text-gray-500">
                    {value.toFixed(1)}
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
                        {sg.assignedUser && <Avatar name={sg.assignedUser.name} color={sg.assignedUser.avatarColor} size={18} />}
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
            </div>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-gray-400">Nenhuma meta geral cadastrada ainda.</p>}
      </div>
    </div>
  );
}
