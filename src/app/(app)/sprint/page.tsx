"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import {
  DndContext,
  DragEndEvent,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import TaskDetailModal from "@/components/TaskDetailModal";
import GanttChart from "@/components/GanttChart";
import Avatar from "@/components/Avatar";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  locked: boolean;
  startDate: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  assignee: { id: string; name: string; avatarColor: string } | null;
  project: { name: string } | null;
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

/** Segunda a sexta da semana corrente, em limites UTC-meia-noite — mesmo referencial usado ao salvar datas de tarefas (input date -> new Date(str).toISOString()), evitando exclusoes por fuso horario. */
function mondayToFridayRangeUTC() {
  const now = new Date();
  const day = now.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + mondayOffset);
  const friday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 4);
  const start = new Date(Date.UTC(monday.getFullYear(), monday.getMonth(), monday.getDate()));
  const end = new Date(Date.UTC(friday.getFullYear(), friday.getMonth(), friday.getDate(), 23, 59, 59, 999));
  return { start, end };
}

export default function SprintPage() {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [view, setView] = useState<"kanban" | "gantt">("kanban");
  const [openTaskId, setOpenTaskId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const isManager = role === "ADMIN" || role === "DIRETOR" || role === "GESTOR_PROJETO";

  async function load() {
    if (!userId) return;
    const url = isManager ? "/api/tasks" : `/api/tasks?assigneeId=${userId}`;
    const res = await fetch(url);
    setTasks(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, isManager]);

  const { start: weekStart, end: weekEnd } = mondayToFridayRangeUTC();

  const weekTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (!t.startDate && !t.dueDate) return false;
      const rangeStart = new Date(t.startDate ?? t.dueDate!);
      const rangeEnd = new Date(t.dueDate ?? t.startDate!);
      return rangeEnd >= weekStart && rangeStart <= weekEnd;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tasks]);

  function canModify(task: Task) {
    if (task.locked) return role === "ADMIN" || role === "GESTOR_PROJETO";
    if (role === "ADMIN" || role === "GESTOR_PROJETO") return true;
    return task.assigneeId === userId;
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const newStatus = over.id as string;
    const task = weekTasks.find((t) => t.id === active.id);
    if (!task || task.status === newStatus || !canModify(task)) return;

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Sprint da Semana</h1>
          <p className="text-sm text-gray-500">
            Segunda a sexta: {weekStart.toLocaleDateString("pt-BR", { timeZone: "UTC" })} a{" "}
            {weekEnd.toLocaleDateString("pt-BR", { timeZone: "UTC" })}
            {" · "}
            {isManager ? "tarefas de toda a equipe" : "suas tarefas"}
          </p>
        </div>
        <div className="flex rounded-md border border-gray-300 text-sm">
          <button
            onClick={() => setView("kanban")}
            className={`px-3 py-1.5 ${view === "kanban" ? "bg-brand text-white" : "hover:bg-gray-50"}`}
          >
            Kanban
          </button>
          <button
            onClick={() => setView("gantt")}
            className={`border-l border-gray-300 px-3 py-1.5 ${view === "gantt" ? "bg-brand text-white" : "hover:bg-gray-50"}`}
          >
            Gantt
          </button>
        </div>
      </div>

      {weekTasks.length === 0 && (
        <p className="mb-4 text-sm text-gray-400">
          {isManager
            ? "Nenhuma tarefa da equipe com início ou prazo nesta semana."
            : "Nenhuma tarefa sua com início ou prazo nesta semana."}
        </p>
      )}

      {view === "kanban" && weekTasks.length > 0 && (
        <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
            {columns.map((col) => (
              <Column key={col.key} id={col.key} label={col.label}>
                {weekTasks
                  .filter((t) => t.status === col.key)
                  .map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      draggable={canModify(task)}
                      onOpen={() => setOpenTaskId(task.id)}
                    />
                  ))}
              </Column>
            ))}
          </div>
        </DndContext>
      )}

      {view === "gantt" && weekTasks.length > 0 && <GanttChart tasks={weekTasks} onChanged={load} />}

      {openTaskId && <TaskDetailModal taskId={openTaskId} onClose={() => setOpenTaskId(null)} onChanged={load} />}
    </div>
  );
}

function Column({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[200px] rounded-xl border p-3 ${isOver ? "border-brand bg-brand/5" : "border-gray-200 bg-gray-50"}`}
    >
      <h3 className="mb-3 text-sm font-semibold text-gray-600">{label}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </div>
  );
}

function TaskCard({ task, draggable, onOpen }: { task: Task; draggable: boolean; onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id, disabled: !draggable });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{ ...style, borderLeftColor: task.assignee?.avatarColor || "#e5e7eb", borderLeftWidth: 4 }}
      {...(draggable ? { ...listeners, ...attributes } : {})}
      onClick={onOpen}
      className={`rounded-lg border border-gray-200 bg-white p-3 shadow-sm transition-shadow hover:shadow-md ${
        draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer opacity-90"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-medium">
          {task.locked && "🔒 "}
          {task.title}
        </p>
        {task.assignee && <Avatar name={task.assignee.name} color={task.assignee.avatarColor} size={22} />}
      </div>
      {task.project && <p className="mt-1 text-xs text-gray-400">{task.project.name}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs ${priorityColor[task.priority]}`}>{task.priority}</span>
        {task.dueDate && (
          <span className="text-[11px] text-gray-400">
            {new Date(task.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
          </span>
        )}
      </div>
    </div>
  );
}
