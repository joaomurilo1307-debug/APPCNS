"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import TaskDetailModal from "./TaskDetailModal";
import Avatar from "./Avatar";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  locked: boolean;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string; avatarColor: string } | null;
  project: { id: string; name: string } | null;
  _count?: { subtasks: number; attachments: number; comments: number };
};

function fmtDueDate(iso: string) {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
}

type ColumnConfig = { key: string; label: string; visible: boolean };

const defaultColumns: ColumnConfig[] = [
  { key: "A_FAZER", label: "A fazer", visible: true },
  { key: "FAZENDO", label: "Fazendo", visible: true },
  { key: "BLOQUEADO", label: "Bloqueado", visible: true },
  { key: "FEITO", label: "Feito", visible: true },
];

const columnAccent: Record<string, { dot: string; bar: string; tint: string; badgeBg: string; badgeText: string }> = {
  A_FAZER: { dot: "bg-slate-400", bar: "from-slate-300 to-slate-400", tint: "from-slate-50/80 to-white", badgeBg: "bg-slate-100", badgeText: "text-slate-600" },
  FAZENDO: { dot: "bg-blue-500", bar: "from-blue-400 to-blue-500", tint: "from-blue-50/70 to-white", badgeBg: "bg-blue-100", badgeText: "text-blue-700" },
  BLOQUEADO: { dot: "bg-rose-500", bar: "from-rose-400 to-rose-500", tint: "from-rose-50/70 to-white", badgeBg: "bg-rose-100", badgeText: "text-rose-700" },
  FEITO: { dot: "bg-emerald-500", bar: "from-emerald-400 to-emerald-500", tint: "from-emerald-50/70 to-white", badgeBg: "bg-emerald-100", badgeText: "text-emerald-700" },
};
const fallbackAccent = { dot: "bg-brand", bar: "from-brand/60 to-brand", tint: "from-brand/[0.04] to-white", badgeBg: "bg-brand/10", badgeText: "text-brand-dark" };

function parseColumns(raw: string | null | undefined): ColumnConfig[] {
  if (!raw) return defaultColumns;
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) {
      // garante que todo status padrão continue presente (mesmo que oculto), pra não perder tarefas de vista
      const byKey = new Map(parsed.map((c: ColumnConfig) => [c.key, c]));
      return defaultColumns.map((d) => byKey.get(d.key) ?? { ...d, visible: false });
    }
  } catch {
    // config antiga/invalida, cai no padrão
  }
  return defaultColumns;
}

const priorityLabel: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Muito crítica",
};

const priorityColor: Record<string, string> = {
  BAIXA: "bg-gray-100 text-gray-600",
  MEDIA: "bg-blue-100 text-blue-700",
  ALTA: "bg-orange-100 text-orange-700",
  URGENTE: "bg-red-100 text-red-700",
};

function canModify(role: string | undefined, task: Task, userId: string | undefined) {
  if (!role) return false;
  if (task.locked) return role === "ADMIN" || role === "GESTOR_PROJETO";
  if (role === "ADMIN" || role === "GESTOR_PROJETO") return true;
  if (role === "COLABORADOR") return task.assigneeId === userId;
  return false;
}

function canDelete(role: string | undefined, task: Task) {
  return (role === "ADMIN" || role === "GESTOR_PROJETO") && !task.locked;
}

export default function KanbanBoard({ projectId }: { projectId?: string }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;
  const canManage = role === "ADMIN" || role === "GESTOR_PROJETO";

  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const [columns, setColumns] = useState<ColumnConfig[]>(defaultColumns);
  const [editingColumns, setEditingColumns] = useState(false);
  const [draftColumns, setDraftColumns] = useState<ColumnConfig[]>(defaultColumns);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    const params = new URLSearchParams({ topLevel: "true" });
    if (projectId) params.set("projectId", projectId);
    const res = await fetch(`/api/tasks?${params.toString()}`);
    setTasks(await res.json());
  }

  async function loadColumns() {
    if (!projectId) return;
    const res = await fetch(`/api/projects/${projectId}`);
    if (!res.ok) return;
    const project = await res.json();
    setColumns(parseColumns(project.kanbanColumns));
  }

  useEffect(() => {
    load();
    loadColumns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as string;
    const task = tasks.find((t) => t.id === active.id);
    if (!task || task.status === newStatus) return;
    if (!canModify(role, task, userId)) return;

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  async function handleQuickDelete(taskId: string) {
    if (!confirm("Excluir esta tarefa?")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    load();
  }

  async function handlePriorityChange(taskId: string, priority: string) {
    setTasks((prev) => prev.map((t) => (t.id === taskId ? { ...t, priority } : t)));
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ priority }),
    });
  }

  function openColumnEditor() {
    setDraftColumns(columns);
    setEditingColumns(true);
  }

  function updateDraftLabel(key: string, label: string) {
    setDraftColumns((prev) => prev.map((c) => (c.key === key ? { ...c, label } : c)));
  }

  function toggleDraftVisible(key: string) {
    setDraftColumns((prev) => prev.map((c) => (c.key === key ? { ...c, visible: !c.visible } : c)));
  }

  async function saveColumns() {
    if (!projectId) return;
    await fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kanbanColumns: JSON.stringify(draftColumns) }),
    });
    setColumns(draftColumns);
    setEditingColumns(false);
  }

  const visibleColumns = columns.filter((c) => c.visible);

  return (
    <>
      {projectId && canManage && (
        <div className="mb-3 flex justify-end">
          <button
            onClick={openColumnEditor}
            className="rounded-full border border-gray-200 bg-white/70 px-3 py-1.5 text-xs font-medium text-gray-500 shadow-sm hover:border-brand/30 hover:text-brand-dark"
          >
            ✏️ Editar colunas
          </button>
        </div>
      )}

      {editingColumns && (
        <div className="shadow-elevated mb-4 rounded-2xl border border-gray-100 bg-white p-4">
          <p className="mb-3 text-sm font-semibold text-gray-700">Colunas do quadro</p>
          <div className="flex flex-col gap-2">
            {draftColumns.map((c) => {
              const accent = columnAccent[c.key] ?? fallbackAccent;
              return (
                <div key={c.key} className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${accent.dot}`} />
                  <input
                    value={c.label}
                    onChange={(e) => updateDraftLabel(c.key, e.target.value)}
                    className="flex-1 rounded-md border border-gray-200 px-2.5 py-1.5 text-sm"
                  />
                  <label className="flex shrink-0 items-center gap-1.5 text-xs text-gray-500">
                    <input type="checkbox" checked={c.visible} onChange={() => toggleDraftVisible(c.key)} />
                    Mostrar
                  </label>
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-gray-400">
            Ocultar uma coluna não apaga as tarefas nela — elas continuam existindo, só somem da visão do quadro.
          </p>
          <div className="mt-3 flex gap-2">
            <button onClick={saveColumns} className="rounded-md bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-dark">
              Salvar
            </button>
            <button onClick={() => setEditingColumns(false)} className="rounded-md border border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-50">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {visibleColumns.map((col) => (
            <Column key={col.key} id={col.key} label={col.label} count={tasks.filter((t) => t.status === col.key).length}>
              {tasks
                .filter((t) => t.status === col.key)
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    draggable={canModify(role, task, userId)}
                    canEditPriority={canModify(role, task, userId)}
                    showDelete={canDelete(role, task)}
                    onOpen={() => setOpenTaskId(task.id)}
                    onDelete={() => handleQuickDelete(task.id)}
                    onPriorityChange={(priority) => handlePriorityChange(task.id, priority)}
                  />
                ))}
            </Column>
          ))}
        </div>
      </DndContext>

      {openTaskId && (
        <TaskDetailModal
          taskId={openTaskId}
          onClose={() => setOpenTaskId(null)}
          onChanged={load}
        />
      )}
    </>
  );
}

function Column({ id, label, count, children }: { id: string; label: string; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  const accent = columnAccent[id] ?? fallbackAccent;
  return (
    <div
      ref={setNodeRef}
      className={`relative flex min-h-[320px] flex-col overflow-hidden rounded-2xl border bg-gradient-to-b p-3 pt-4 transition-colors ${accent.tint} ${
        isOver ? "border-brand/50 shadow-soft" : "border-gray-200/80"
      }`}
    >
      <div className={`absolute inset-x-0 top-0 h-1 bg-gradient-to-r ${accent.bar}`} />
      <div className="mb-3 flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${accent.dot}`} />
        <h3 className="text-sm font-semibold text-gray-700">{label}</h3>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold ${accent.badgeBg} ${accent.badgeText}`}>
          {count}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2">{children}</div>
    </div>
  );
}

function TaskCard({
  task,
  draggable,
  canEditPriority,
  showDelete,
  onOpen,
  onDelete,
  onPriorityChange,
}: {
  task: Task;
  draggable: boolean;
  canEditPriority: boolean;
  showDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
  onPriorityChange: (priority: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: task.id,
    disabled: !draggable,
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: task.assignee?.avatarColor || "#e5e7eb", borderLeftWidth: 3 }}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      onClick={onOpen}
      className={`card-hover group relative rounded-xl border border-gray-100 bg-white p-3 shadow-soft ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer opacity-90"
      }`}
    >
      {showDelete && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="absolute right-1 top-1 hidden h-5 w-5 items-center justify-center rounded text-gray-300 hover:bg-red-50 hover:text-red-500 group-hover:flex"
          title="Excluir tarefa"
        >
          ✕
        </button>
      )}
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium leading-snug">
          {task.locked && "🔒 "}
          {task.title}
        </p>
        {task.assignee && <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={22} />}
      </div>
      {task.project && <p className="mt-1 text-xs text-gray-400">{task.project.name}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {canEditPriority ? (
          <select
            value={task.priority}
            onChange={(e) => onPriorityChange(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            className={`rounded-full border-0 px-2 py-0.5 text-xs font-medium ${priorityColor[task.priority]}`}
          >
            {Object.entries(priorityLabel).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        ) : (
          <span className={`rounded-full px-2 py-0.5 text-xs ${priorityColor[task.priority]}`}>
            {priorityLabel[task.priority] ?? task.priority}
          </span>
        )}
        {task.dueDate && (
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              task.status !== "FEITO" && new Date(task.dueDate) < new Date()
                ? "bg-rose-100 text-rose-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            📅 {fmtDueDate(task.dueDate)}
          </span>
        )}
        {!!task._count?.subtasks && (
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {task._count.subtasks} subtarefa(s)
          </span>
        )}
        {!!task._count?.attachments && (
          <span className="text-xs text-gray-400">📎 {task._count.attachments}</span>
        )}
        {!!task._count?.comments && (
          <span className="text-xs text-gray-400">💬 {task._count.comments}</span>
        )}
      </div>
    </div>
  );
}
