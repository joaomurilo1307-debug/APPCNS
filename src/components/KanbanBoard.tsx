"use client";

import { useEffect, useState } from "react";
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
  assignee: { id: string; name: string } | null;
  project: { id: string; name: string } | null;
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

export default function KanbanBoard({ projectId }: { projectId?: string }) {
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

    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)));
    await fetch(`/api/tasks/${task.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    });
  }

  return (
    <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {columns.map((col) => (
          <Column key={col.key} id={col.key} label={col.label}>
            {tasks
              .filter((t) => t.status === col.key)
              .map((task) => (
                <TaskCard key={task.id} task={task} />
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

function TaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({ id: task.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 10 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className="cursor-grab rounded-lg border border-gray-200 bg-white p-3 shadow-sm active:cursor-grabbing"
    >
      <p className="text-sm font-medium">{task.title}</p>
      {task.project && <p className="mt-1 text-xs text-gray-400">{task.project.name}</p>}
      <div className="mt-2 flex items-center justify-between">
        <span className={`rounded-full px-2 py-0.5 text-xs ${priorityColor[task.priority]}`}>
          {task.priority}
        </span>
        {task.assignee && <span className="text-xs text-gray-500">{task.assignee.name}</span>}
      </div>
    </div>
  );
}
