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

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  locked: boolean;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
  _count?: { subtasks: number };
};

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

function canDelete(role: string | undefined) {
  return role === "ADMIN" || role === "GESTOR_PROJETO";
}

function canLock(role: string | undefined) {
  return role === "ADMIN" || role === "GESTOR_PROJETO";
}

export default function KanbanBoard({ projectId }: { projectId?: string }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function load() {
    const qs = projectId ? `?projectId=${projectId}` : "";
    const res = await fetch(`/api/tasks${qs}`);
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

  async function handleDelete(taskId: string) {
    if (!confirm("Excluir esta tarefa? Não tem como desfazer.")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    load();
  }

  async function handleToggleLock(task: Task) {
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: !task.locked }),
    });
    load();
  }

  return (
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
                  showDelete={canDelete(role) && !task.locked}
                  showLock={canLock(role)}
                  onDelete={() => handleDelete(task.id)}
                  onToggleLock={() => handleToggleLock(task)}
                />
              ))}
          </Column>
        ))}
      </div>
    </DndContext>
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
  showLock,
  onDelete,
  onToggleLock,
}: {
  task: Task;
  draggable: boolean;
  showDelete: boolean;
  showLock: boolean;
  onDelete: () => void;
  onToggleLock: () => void;
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
      style={style}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm ${
        draggable ? "cursor-grab active:cursor-grabbing" : "opacity-90"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          {task.locked && "🔒 "}
          {task.title}
        </p>
      </div>
      {task.project && <p className="mt-1 text-xs text-gray-400">{task.project.name}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs ${priorityColor[task.priority]}`}>
          {task.priority}
        </span>
        {task.assignee && <span className="text-xs text-gray-500">{task.assignee.name}</span>}
      </div>
      {(showDelete || showLock) && (
        <div className="mt-2 flex justify-end gap-2 border-t border-gray-50 pt-2">
          {showLock && (
            <button
              onClick={onToggleLock}
              className="text-xs text-gray-400 hover:text-gray-700"
              title={task.locked ? "Destravar" : "Travar (impede mover/excluir)"}
            >
              {task.locked ? "Destravar" : "Travar"}
            </button>
          )}
          {showDelete && (
            <button onClick={onDelete} className="text-xs text-red-400 hover:text-red-700">
              Excluir
            </button>
          )}
        </div>
      )}
      {task._count?.subtasks ? (
        <p className="mt-1 text-[11px] text-gray-400">{task._count.subtasks} subtarefa(s)</p>
      ) : null}
    </div>
  );
}
