"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import KanbanBoard from "@/components/KanbanBoard";
import Whiteboard from "@/components/Whiteboard";
import GoalsPanel from "@/components/GoalsPanel";
import GanttChart from "@/components/GanttChart";
import TaskListView from "@/components/TaskListView";

type ProjectDetail = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  team: { id: string; name: string; members: { user: { id: string; name: string } }[] };
  owner: { id: string; name: string };
  approver: { id: string; name: string } | null;
  approvalStatus: string;
  startDate: string | null;
  endDate: string | null;
  actualStartedAt: string | null;
  actualEndedAt: string | null;
  percentComplete: number;
};

function daysBetween(a: Date, b: Date) {
  return Math.max(0, Math.round((b.getTime() - a.getTime()) / 86400000));
}

function timelineSummary(p: ProjectDetail) {
  const planned = p.startDate && p.endDate ? daysBetween(new Date(p.startDate), new Date(p.endDate)) : null;
  if (!p.actualStartedAt) return planned !== null ? `Previsto: ${planned} dia(s)` : null;
  const elapsed = daysBetween(new Date(p.actualStartedAt), p.actualEndedAt ? new Date(p.actualEndedAt) : new Date());
  const status = p.actualEndedAt ? "Executado em" : "Em execução há";
  return planned !== null ? `${status} ${elapsed} dia(s) (previsto: ${planned} dia(s))` : `${status} ${elapsed} dia(s)`;
}

const statusLabel: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
};

export default function ProjectDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const canManage = role === "ADMIN" || role === "GESTOR_PROJETO";
  const canCreateTask = role && role !== "CLIENTE" && role !== "VISUALIZADOR";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<"kanban" | "board" | "metas" | "gantt" | "lista">("kanban");
  const [ganttTasks, setGanttTasks] = useState<
    { id: string; title: string; startDate: string | null; dueDate: string | null; status: string }[]
  >([]);

  async function load() {
    const res = await fetch(`/api/projects/${params.id}`);
    if (res.ok) setProject(await res.json());
  }

  useEffect(() => {
    load();
  }, [params.id]);

  useEffect(() => {
    if (tab !== "gantt") return;
    fetch(`/api/tasks?projectId=${params.id}`)
      .then((r) => r.json())
      .then(setGanttTasks);
  }, [tab, params.id, refreshKey]);

  async function handleCreateTask(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        projectId: params.id,
        startDate: startDate ? new Date(startDate).toISOString() : null,
        dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      }),
    });
    setTitle("");
    setStartDate("");
    setDueDate("");
    setShowTaskForm(false);
    setRefreshKey((k) => k + 1);
  }

  async function handleEditProject(e: React.FormEvent) {
    e.preventDefault();
    const form = new FormData(e.target as HTMLFormElement);
    await fetch(`/api/projects/${params.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ownerId: form.get("ownerId") || undefined,
        approverId: form.get("approverId") || null,
        status: form.get("status"),
        startDate: form.get("startDate") ? new Date(form.get("startDate") as string).toISOString() : null,
        endDate: form.get("endDate") ? new Date(form.get("endDate") as string).toISOString() : null,
      }),
    });
    setShowEditForm(false);
    load();
  }

  if (!project) return <p className="text-sm text-gray-400">Carregando...</p>;

  return (
    <div>
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-gray-500">
            {project.team.name} · Responsável: {project.owner.name}
            {project.approver && ` · Aprovador: ${project.approver.name} (${project.approvalStatus})`}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-2 w-32 overflow-hidden rounded-full bg-gray-100">
                <div className="h-full bg-brand" style={{ width: `${project.percentComplete}%` }} />
              </div>
              <span className="text-xs font-medium text-gray-500">{project.percentComplete}% concluído</span>
            </div>
            {timelineSummary(project) && (
              <span className="text-xs text-gray-400">· {timelineSummary(project)}</span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {canManage && (
            <button
              onClick={() => setShowEditForm((v) => !v)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
            >
              Editar projeto
            </button>
          )}
          {canCreateTask && (
            <button
              onClick={() => setShowTaskForm((v) => !v)}
              className="rounded-md bg-brand px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-dark"
            >
              + Nova tarefa
            </button>
          )}
        </div>
      </div>

      {showEditForm && (
        <form onSubmit={handleEditProject} className="mb-6 mt-4 grid grid-cols-2 gap-3 rounded-xl border border-gray-200 bg-white p-4 text-sm">
          <label className="flex flex-col gap-1">
            Responsável
            <select name="ownerId" defaultValue={project.owner.id} className="rounded-md border border-gray-300 px-2 py-1.5">
              {project.team.members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Aprovador (opcional)
            <select name="approverId" defaultValue={project.approver?.id ?? ""} className="rounded-md border border-gray-300 px-2 py-1.5">
              <option value="">Nenhum</option>
              {project.team.members.map((m) => (
                <option key={m.user.id} value={m.user.id}>{m.user.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Status
            <select name="status" defaultValue={project.status} className="rounded-md border border-gray-300 px-2 py-1.5">
              {Object.entries(statusLabel).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </label>
          <div className="flex gap-2">
            <label className="flex flex-1 flex-col gap-1">
              Início
              <input type="date" name="startDate" defaultValue={project.startDate?.slice(0, 10)} className="rounded-md border border-gray-300 px-2 py-1.5" />
            </label>
            <label className="flex flex-1 flex-col gap-1">
              Fim previsto
              <input type="date" name="endDate" defaultValue={project.endDate?.slice(0, 10)} className="rounded-md border border-gray-300 px-2 py-1.5" />
            </label>
          </div>
          <button className="col-span-2 rounded-md bg-brand px-4 py-2 font-medium text-white hover:bg-brand-dark">
            Salvar
          </button>
        </form>
      )}

      {showTaskForm && canCreateTask && (
        <form onSubmit={handleCreateTask} className="mb-6 mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-white p-4">
          <input
            required
            placeholder="Título da tarefa"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-gray-500">
            Início
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" />
          </label>
          <label className="flex items-center gap-1 text-xs text-gray-500">
            Prazo
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="rounded-md border border-gray-300 px-2 py-2 text-sm" />
          </label>
          <button className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">
            Criar
          </button>
        </form>
      )}

      <div className="mb-4 mt-6 flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("kanban")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "kanban" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Kanban
        </button>
        <button
          onClick={() => setTab("board")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "board" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Mind Chart
        </button>
        <button
          onClick={() => setTab("metas")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "metas" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Metas
        </button>
        <button
          onClick={() => setTab("gantt")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "gantt" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Gantt
        </button>
        <button
          onClick={() => setTab("lista")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "lista" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Lista
        </button>
      </div>

      {tab === "kanban" && <KanbanBoard key={refreshKey} projectId={project.id} />}
      {tab === "board" && <Whiteboard projectId={project.id} />}
      {tab === "gantt" && <GanttChart tasks={ganttTasks} />}
      {tab === "lista" && (
        <TaskListView projectId={project.id} projectName={project.name} team={project.team} canManage={canManage} />
      )}
      {tab === "metas" && (
        <GoalsPanel
          projectId={project.id}
          team={project.team}
          canManage={canManage}
          currentUserId={(session?.user as any)?.id}
        />
      )}
    </div>
  );
}
