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

const columns = [
  { key: "A_FAZER", label: "A fazer" },
  { key: "FAZENDO", label: "Fazendo" },
  { key: "BLOQUEADO", label: "Bloqueado" },
  { key: "FEITO", label: "Feito" },
];

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

  const [tasks, setTasks] = useState<Task[]>([]);
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    const params = new URLSearchParams({ topLevel: "true" });
    if (projectId) params.set("projectId", projectId);
    const res = await fetch(`/api/tasks?${params.toString()}`);
    setTasks(await res.json());
  }

  useEffect(() => {
    load();
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

  return (
    <>
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
          {columns.map((col) => (
            <Column key={col.key} id={col.key} label={col.label}>
              {tasks
                .filter((t) => t.status === col.key)
                .map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    draggable={canModify(role, task, userId)}
                    showDelete={canDelete(role, task)}
                    onOpen={() => setOpenTaskId(task.id)}
                    onDelete={() => handleQuickDelete(task.id)}
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

function Column({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[300px] rounded-xl border p-3 ${
        isOver ? "border-brand bg-brand/5" : "border-gray-200 bg-gray-50"
      }`}
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-600">{label}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function TaskCard({
  task,
  draggable,
  showDelete,
  onOpen,
  onDelete,
}: {
  task: Task;
  draggable: boolean;
  showDelete: boolean;
  onOpen: () => void;
  onDelete: () => void;
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
      style={{ ...style, borderLeftColor: task.assignee?.avatarColor || "#e5e7eb", borderLeftWidth: 4 }}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      onClick={onOpen}
      className={`group relative rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
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
        <p className="text-sm font-medium">
          {task.locked && "🔒 "}
          {task.title}
        </p>
        {task.assignee && <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={22} />}
      </div>
      {task.project && <p className="mt-1 text-xs text-gray-400">{task.project.name}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className={`rounded-full px-2 py-0.5 text-xs ${priorityColor[task.priority]}`}>
          {task.priority}
        </span>
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
