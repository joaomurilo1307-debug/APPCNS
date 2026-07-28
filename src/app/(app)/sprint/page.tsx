"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";

type Task = {
  id: string;
  title: string;
  status: string;
  priority: string;
  dueDate: string | null;
  project: { name: string } | null;
  assignee: { id: string; name: string; avatarColor: string } | null;
};

const statusLabel: Record<string, string> = {
  A_FAZER: "A fazer",
  FAZENDO: "Fazendo",
  BLOQUEADO: "Bloqueado",
  FEITO: "Feito",
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
  const userId = (session?.user as any)?.id;

  const [tasks, setTasks] = useState<Task[]>([]);

  useEffect(() => {
    if (!userId) return;
    fetch(`/api/tasks?assigneeId=${userId}`)
      .then((r) => r.json())
      .then(setTasks);
  }, [userId]);

  const { start: weekStart, end: weekEnd } = mondayToFridayRangeUTC();

  const weekTasks = tasks.filter((t) => {
    if (!t.dueDate) return false;
    const d = new Date(t.dueDate);
    return d >= weekStart && d <= weekEnd;
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Sprint da Semana</h1>
      <p className="mb-6 text-sm text-gray-500">
        Suas tarefas com prazo entre {weekStart.toLocaleDateString("pt-BR", { timeZone: "UTC" })} e {weekEnd.toLocaleDateString("pt-BR", { timeZone: "UTC" })}.
      </p>

      <div className="grid gap-2">
        {weekTasks.map((t) => (
          <div key={t.id} className="flex items-center justify-between rounded-xl border border-gray-200 bg-white p-4">
            <div className="flex items-center gap-3">
              {t.assignee && <Avatar name={t.assignee.name} color={t.assignee.avatarColor} />}
              <div>
                <p className="text-sm font-medium">{t.title}</p>
                <p className="text-xs text-gray-400">{t.project?.name ?? "Sem projeto"}</p>
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-gray-500">{statusLabel[t.status]}</span>
              <span className="text-gray-400">
                {t.dueDate && new Date(t.dueDate).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
              </span>
            </div>
          </div>
        ))}
        {weekTasks.length === 0 && (
          <p className="text-sm text-gray-400">Nenhuma tarefa sua com prazo nesta semana.</p>
        )}
      </div>
    </div>
  );
}
