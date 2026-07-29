"use client";

import { useEffect, useState } from "react";
import Avatar from "@/components/Avatar";

type Goal = {
  id: string;
  title: string;
  description: string | null;
  targetValue: number | null;
  currentValue: number;
  unit: string | null;
  dueDate: string | null;
  assignedUser: { id: string; name: string; avatarColor: string | null } | null;
  assignedTeam: { id: string; name: string } | null;
  parentGoal: { id: string; title: string } | null;
  autoFromProjectProgress: boolean;
  contributionValue: number | null;
  fraction: number;
};

type GeneralGoal = { id: string; title: string };

export default function GoalsPanel({
  projectId,
  team,
  canManage,
  currentUserId,
}: {
  projectId: string;
  team: { id: string; name: string; members: { user: { id: string; name: string } }[] };
  canManage: boolean;
  currentUserId: string;
}) {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [targetValue, setTargetValue] = useState("");
  const [unit, setUnit] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assignType, setAssignType] = useState<"pessoa" | "equipe">("pessoa");
  const [assignedUserId, setAssignedUserId] = useState("");
  const [generalGoals, setGeneralGoals] = useState<GeneralGoal[]>([]);
  const [parentGoalId, setParentGoalId] = useState("");
  const [contributionValue, setContributionValue] = useState("");
  const [autoFromProject, setAutoFromProject] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editTargetValue, setEditTargetValue] = useState("");
  const [editUnit, setEditUnit] = useState("");
  const [editDueDate, setEditDueDate] = useState("");
  const [editParentGoalId, setEditParentGoalId] = useState("");
  const [editContributionValue, setEditContributionValue] = useState("");
  const [editAutoFromProject, setEditAutoFromProject] = useState(false);

  async function load() {
    const res = await fetch(`/api/projects/${projectId}/goals`);
    if (res.ok) setGoals(await res.json());
  }

  async function loadGeneralGoals() {
    const res = await fetch("/api/goals");
    if (res.ok) setGeneralGoals((await res.json()).map((g: any) => ({ id: g.id, title: g.title })));
  }

  useEffect(() => {
    load();
    loadGeneralGoals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    await fetch(`/api/projects/${projectId}/goals`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        targetValue: targetValue ? Number(targetValue) : null,
        unit: unit || null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
        assignedUserId: assignType === "pessoa" ? assignedUserId || null : null,
        assignedTeamId: assignType === "equipe" ? team.id : null,
        parentGoalId: parentGoalId || undefined,
        contributionValue: contributionValue ? Number(contributionValue) : undefined,
        autoFromProjectProgress: autoFromProject,
      }),
    });
    setTitle("");
    setTargetValue("");
    setUnit("");
    setDueDate("");
    setAssignedUserId("");
    setParentGoalId("");
    setContributionValue("");
    setAutoFromProject(false);
    setShowForm(false);
    load();
  }

  async function handleProgress(goalId: string, value: string) {
    const currentValue = Number(value);
    if (Number.isNaN(currentValue)) return;
    await fetch(`/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentValue }),
    });
    load();
  }

  async function handleDelete(goalId: string) {
    if (!confirm("Excluir esta meta?")) return;
    await fetch(`/api/goals/${goalId}`, { method: "DELETE" });
    load();
  }

  function startEdit(g: Goal) {
    setEditingId(g.id);
    setEditTitle(g.title);
    setEditTargetValue(g.targetValue?.toString() ?? "");
    setEditUnit(g.unit ?? "");
    setEditDueDate(g.dueDate ? g.dueDate.slice(0, 10) : "");
    setEditParentGoalId(g.parentGoal?.id ?? "");
    setEditContributionValue(g.contributionValue?.toString() ?? "");
    setEditAutoFromProject(g.autoFromProjectProgress);
  }

  async function handleSaveEdit(goalId: string) {
    await fetch(`/api/goals/${goalId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: editTitle,
        targetValue: editTargetValue ? Number(editTargetValue) : null,
        unit: editUnit || null,
        dueDate: editDueDate ? new Date(editDueDate).toISOString() : null,
        parentGoalId: editParentGoalId || null,
        contributionValue: editContributionValue ? Number(editContributionValue) : null,
        autoFromProjectProgress: editAutoFromProject,
      }),
    });
    setEditingId(null);
    load();
  }

  function canEditProgress(g: Goal) {
    if (canManage) return true;
    if (g.assignedUser?.id === currentUserId) return true;
    if (g.assignedTeam && team.members.some((m) => m.user.id === currentUserId)) return true;
    return false;
  }

  return (
    <div>
      {canManage && (
        <div className="mb-4">
          <button
            onClick={() => setShowForm((v) => !v)}
            className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
          >
            + Nova meta
          </button>
        </div>
      )}

      {showForm && canManage && (
        <form onSubmit={handleCreate} className="mb-6 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <input
            required
            placeholder="Título da meta"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5"
          />
          <input
            type="number"
            placeholder="Valor alvo (ex: 100)"
            value={targetValue}
            onChange={(e) => setTargetValue(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <input
            placeholder="Unidade (ex: %, un, R$)"
            value={unit}
            onChange={(e) => setUnit(e.target.value)}
            className="rounded-md border border-gray-300 px-2 py-1.5"
          />
          <label className="flex flex-col gap-1">
            Prazo
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1">
            Atribuir a
            <select
              value={assignType}
              onChange={(e) => setAssignType(e.target.value as "pessoa" | "equipe")}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            >
              <option value="pessoa">Uma pessoa</option>
              <option value="equipe">Equipe inteira ({team.name})</option>
            </select>
          </label>
          {assignType === "pessoa" && (
            <select
              value={assignedUserId}
              onChange={(e) => setAssignedUserId(e.target.value)}
              className="col-span-2 rounded-md border border-gray-300 px-2 py-1.5"
            >
              <option value="">Ninguém</option>
              {team.members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
          )}
          <label className="flex flex-col gap-1">
            Ligar a uma meta geral (opcional)
            <select
              value={parentGoalId}
              onChange={(e) => setParentGoalId(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            >
              <option value="">Nenhuma</option>
              {generalGoals.map((g) => (
                <option key={g.id} value={g.id}>{g.title}</option>
              ))}
            </select>
          </label>
          {parentGoalId && (
            <input
              type="number"
              placeholder="Quanto essa meta vale pra meta geral (ex: 1)"
              value={contributionValue}
              onChange={(e) => setContributionValue(e.target.value)}
              className="rounded-md border border-gray-300 px-2 py-1.5"
            />
          )}
          <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={autoFromProject} onChange={(e) => setAutoFromProject(e.target.checked)} />
            Calcular progresso automaticamente pelo % concluído do projeto (em vez de preencher manualmente)
          </label>
          <button className="col-span-2 rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Criar meta
          </button>
        </form>
      )}

      <div className="flex flex-col gap-3">
        {goals.map((g) => {
          const auto = g.autoFromProjectProgress;
          const pct = auto ? Math.round(g.fraction * 100) : g.targetValue ? Math.min(100, Math.round((g.currentValue / g.targetValue) * 100)) : 0;
          return (
            <div key={g.id} className="rounded-xl border border-gray-200 bg-white p-4">
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
                  <label className="flex flex-col gap-1 text-xs text-gray-500">
                    Prazo
                    <input type="date" value={editDueDate} onChange={(e) => setEditDueDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-1.5" />
                  </label>
                  <label className="flex flex-col gap-1 text-xs text-gray-500">
                    Ligada a meta geral
                    <select
                      value={editParentGoalId}
                      onChange={(e) => setEditParentGoalId(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1.5"
                    >
                      <option value="">Nenhuma</option>
                      {generalGoals.map((gg) => (
                        <option key={gg.id} value={gg.id}>{gg.title}</option>
                      ))}
                    </select>
                  </label>
                  {editParentGoalId && (
                    <input
                      type="number"
                      placeholder="Quanto vale pra meta geral"
                      value={editContributionValue}
                      onChange={(e) => setEditContributionValue(e.target.value)}
                      className="rounded-md border border-gray-300 px-2 py-1.5"
                    />
                  )}
                  <label className="col-span-2 flex items-center gap-2 text-xs text-gray-600">
                    <input type="checkbox" checked={editAutoFromProject} onChange={(e) => setEditAutoFromProject(e.target.checked)} />
                    Calcular progresso automaticamente pelo % concluído do projeto
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
                <p className="font-medium">{g.title}</p>
                {canManage && (
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
              <div className="mb-2 flex items-center gap-2 text-xs text-gray-500">
                {g.assignedUser && (
                  <span className="flex items-center gap-1">
                    <Avatar name={g.assignedUser.name} color={g.assignedUser.avatarColor} size={18} />
                    {g.assignedUser.name}
                  </span>
                )}
                {g.assignedTeam && <span>👥 Equipe {g.assignedTeam.name}</span>}
                {g.dueDate && <span>· Prazo: {new Date(g.dueDate).toLocaleDateString("pt-BR")}</span>}
                {g.parentGoal && <span>· ligada a "{g.parentGoal.title}"{g.contributionValue ? ` (vale ${g.contributionValue})` : ""}</span>}
                {auto && <span>· auto pelo progresso do projeto</span>}
              </div>
              {auto ? (
                <>
                  <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <p className="text-xs text-gray-500">{pct}% concluído (segue o andamento das tarefas do projeto)</p>
                </>
              ) : g.targetValue ? (
                <>
                  <div className="mb-1 h-2 w-full overflow-hidden rounded-full bg-gray-100">
                    <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-gray-500">
                    <span>{g.currentValue}{g.unit ? ` ${g.unit}` : ""} de {g.targetValue}{g.unit ? ` ${g.unit}` : ""} ({pct}%)</span>
                    {canEditProgress(g) && (
                      <input
                        type="number"
                        defaultValue={g.currentValue}
                        onBlur={(e) => e.target.value !== String(g.currentValue) && handleProgress(g.id, e.target.value)}
                        className="w-20 rounded-md border border-gray-300 px-2 py-1 text-right"
                      />
                    )}
                  </div>
                </>
              ) : (
                canEditProgress(g) && (
                  <input
                    type="number"
                    defaultValue={g.currentValue}
                    onBlur={(e) => e.target.value !== String(g.currentValue) && handleProgress(g.id, e.target.value)}
                    className="w-24 rounded-md border border-gray-300 px-2 py-1 text-sm"
                  />
                )
              )}
                </>
              )}
            </div>
          );
        })}
        {goals.length === 0 && <p className="text-sm text-gray-400">Nenhuma meta cadastrada ainda.</p>}
      </div>
    </div>
  );
}
