"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import KanbanBoard from "@/components/KanbanBoard";
import Whiteboard from "@/components/Whiteboard";
import GoalsPanel from "@/components/GoalsPanel";
import ScheduleChart from "@/components/ScheduleChart";
import GanttChart from "@/components/GanttChart";
import TaskListView from "@/components/TaskListView";
import ResourcesPanel from "@/components/ResourcesPanel";
import ProgressBar from "@/components/ProgressBar";
import TeamChatPanel from "@/components/TeamChatPanel";
import FilesPanel from "@/components/FilesPanel";

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
  nucleos: { id: string; name: string }[];
  diretores: { id: string; name: string }[];
  coordenadores: { id: string; name: string }[];
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
  const router = useRouter();
  const role = (session?.user as any)?.role;
  const canManage = role === "ADMIN" || role === "GESTOR_PROJETO";
  const canCreateTask = role && role !== "CLIENTE" && role !== "VISUALIZADOR";

  const [project, setProject] = useState<ProjectDetail | null>(null);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [nucleosList, setNucleosList] = useState<{ id: string; name: string }[]>([]);
  const [peopleList, setPeopleList] = useState<{ id: string; name: string; nivelHierarquico: string | null }[]>([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [showEditForm, setShowEditForm] = useState(false);
  const [title, setTitle] = useState("");
  const [startDate, setStartDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [isRotina, setIsRotina] = useState(false);
  const [frequencia, setFrequencia] = useState("SEMANAL");
  const [refreshKey, setRefreshKey] = useState(0);
  const [tab, setTab] = useState<"kanban" | "board" | "metas" | "cronograma" | "gantt" | "lista" | "recursos" | "chat" | "arquivos">("kanban");
  const [ganttTasks, setGanttTasks] = useState<
    {
      id: string;
      title: string;
      startDate: string | null;
      dueDate: string | null;
      durationDays: number | null;
      isEntrega: boolean;
      actualStartedAt: string | null;
      actualEndedAt: string | null;
      status: string;
      parentTaskId: string | null;
      assigneeId: string | null;
      assignee: { id: string; name: string } | null;
      predecessorLinks: { id: string; predecessorId: string; type: "FS" | "SS" | "FF" | "SF"; lagDays: number; predecessor: { id: string; title: string } }[];
    }[]
  >([]);

  async function load() {
    const res = await fetch(`/api/projects/${params.id}`);
    if (res.ok) setProject(await res.json());
  }

  useEffect(() => {
    load();
  }, [params.id]);

  useEffect(() => {
    if (!showEditForm) return;
    fetch("/api/teams").then((r) => r.json()).then(setTeams).catch(() => {});
    fetch("/api/nucleos")
      .then((r) => r.json())
      .then((data) => setNucleosList(data.map((n: any) => ({ id: n.id, name: n.name }))))
      .catch(() => {});
    fetch("/api/organograma")
      .then((r) => r.json())
      .then((data) => setPeopleList(data.map((p: any) => ({ id: p.id, name: p.name, nivelHierarquico: p.nivelHierarquico }))))
      .catch(() => {});
  }, [showEditForm]);

  useEffect(() => {
    if (tab !== "cronograma" && tab !== "gantt") return;
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
        isRotina,
        rotinaFrequencia: isRotina ? frequencia : null,
      }),
    });
    setTitle("");
    setStartDate("");
    setDueDate("");
    setIsRotina(false);
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
        teamId: form.get("teamId") || undefined,
        startDate: form.get("startDate") ? new Date(form.get("startDate") as string).toISOString() : null,
        endDate: form.get("endDate") ? new Date(form.get("endDate") as string).toISOString() : null,
        nucleoIds: form.getAll("nucleoIds"),
        diretorIds: form.getAll("diretorIds"),
        coordenadorIds: form.getAll("coordenadorIds"),
      }),
    });
    setShowEditForm(false);
    load();
  }

  async function handleDeleteProject() {
    if (!project) return;
    if (!confirm(`Excluir o projeto "${project.name}" permanentemente? Isso não pode ser desfeito.`)) return;
    const res = await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Não foi possível excluir o projeto.");
      return;
    }
    router.push("/projetos");
  }

  if (!project) return <p className="text-sm text-gray-400">Carregando...</p>;

  return (
    <div>
      <Link
        href="/projetos"
        className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-dark"
      >
        ← Voltar para Projetos
      </Link>
      <div className="mb-1 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-gray-500">
            {project.team.name} · Responsável: {project.owner.name}
            {project.approver && ` · Aprovador: ${project.approver.name} (${project.approvalStatus})`}
          </p>
          <div className="mt-2 flex items-center gap-3">
            <div className="w-40">
              <ProgressBar percent={project.percentComplete} />
            </div>
            {timelineSummary(project) && (
              <span className="text-xs text-gray-400">{timelineSummary(project)}</span>
            )}
          </div>
          {(project.nucleos.length > 0 || project.diretores.length > 0 || project.coordenadores.length > 0) && (
            <p className="mt-1 text-xs text-gray-400">
              {project.nucleos.length > 0 && `Núcleo(s): ${project.nucleos.map((n) => n.name).join(", ")}`}
              {project.diretores.length > 0 && ` · Diretor(es): ${project.diretores.map((d) => d.name).join(", ")}`}
              {project.coordenadores.length > 0 && ` · Coordenador(es): ${project.coordenadores.map((c) => c.name).join(", ")}`}
            </p>
          )}
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
          {canManage && (
            <button
              onClick={handleDeleteProject}
              className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50"
            >
              Excluir projeto
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
          <label className="flex flex-col gap-1">
            Equipe
            <select name="teamId" defaultValue={project.team.id} className="rounded-md border border-gray-300 px-2 py-1.5">
              {!teams.some((t) => t.id === project.team.id) && (
                <option value={project.team.id}>{project.team.name}</option>
              )}
              {teams.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
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

          <label className="col-span-2 flex flex-col gap-1">
            Núcleo(s) associado(s) — segure Ctrl/Cmd para selecionar mais de um
            <select name="nucleoIds" multiple defaultValue={project.nucleos.map((n) => n.id)} className="h-28 rounded-md border border-gray-300 px-2 py-1.5">
              {nucleosList.map((n) => (
                <option key={n.id} value={n.id}>{n.name}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Diretor(es) responsável(is)
            <select name="diretorIds" multiple defaultValue={project.diretores.map((d) => d.id)} className="h-28 rounded-md border border-gray-300 px-2 py-1.5">
              {peopleList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.nivelHierarquico === "DIRETORIA" ? " · Diretoria" : ""}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Coordenador(es) responsável(is)
            <select name="coordenadorIds" multiple defaultValue={project.coordenadores.map((c) => c.id)} className="h-28 rounded-md border border-gray-300 px-2 py-1.5">
              {peopleList.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.nivelHierarquico === "COORDENACAO" ? " · Coordenação" : ""}
                </option>
              ))}
            </select>
          </label>

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
          <label className="flex items-center gap-1 text-sm">
            <input type="checkbox" checked={isRotina} onChange={(e) => setIsRotina(e.target.checked)} />
            É rotina recorrente
          </label>
          {isRotina && (
            <select
              value={frequencia}
              onChange={(e) => setFrequencia(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="DIARIA">Diária</option>
              <option value="SEMANAL">Semanal</option>
              <option value="MENSAL">Mensal</option>
            </select>
          )}
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
          onClick={() => setTab("cronograma")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "cronograma" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Planejamento
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
        <button
          onClick={() => setTab("recursos")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "recursos" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Recursos
        </button>
        <button
          onClick={() => setTab("chat")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "chat" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Chat
        </button>
        <button
          onClick={() => setTab("arquivos")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${
            tab === "arquivos" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"
          }`}
        >
          Arquivos
        </button>
      </div>

      {tab === "kanban" && <KanbanBoard key={refreshKey} projectId={project.id} />}
      {tab === "board" && <Whiteboard projectId={project.id} />}
      {tab === "cronograma" && (
        <ScheduleChart
          tasks={ganttTasks}
          onChanged={() => setRefreshKey((k) => k + 1)}
          canManage={canManage}
          teamMembers={project.team.members.map((m) => m.user)}
        />
      )}
      {tab === "gantt" && <GanttChart tasks={ganttTasks} onChanged={() => setRefreshKey((k) => k + 1)} />}
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
      {tab === "recursos" && <ResourcesPanel projectId={project.id} canManage={canManage} />}
      {tab === "chat" && <TeamChatPanel teamId={project.team.id} />}
      {tab === "arquivos" && <FilesPanel scope={{ type: "project", id: project.id }} canManage={canManage} />}
    </div>
  );
}
