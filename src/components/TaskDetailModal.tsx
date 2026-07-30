"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";

type Comment = { id: string; body: string; createdAt: string; author: { id: string; name: string } };
type Attachment = { id: string; fileName: string; filePath: string; uploadedAt: string };
type Subtask = { id: string; title: string; status: string; locked: boolean; assignee: { id: string; name: string } | null };

type TaskDetail = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  startDate: string | null;
  dueDate: string | null;
  locked: boolean;
  assigneeId: string | null;
  assignee: { id: string; name: string } | null;
  project: { id: string; name: string; teamId: string } | null;
  parentTask: { id: string; title: string } | null;
  subtasks: Subtask[];
  attachments: Attachment[];
  comments: Comment[];
  actualStartedAt: string | null;
  actualEndedAt: string | null;
};

function elapsedLabel(task: Pick<TaskDetail, "actualStartedAt" | "actualEndedAt">) {
  if (!task.actualStartedAt) return null;
  const start = new Date(task.actualStartedAt);
  const end = task.actualEndedAt ? new Date(task.actualEndedAt) : new Date();
  const hours = (end.getTime() - start.getTime()) / 3600000;
  const formatted = hours < 1 ? `${Math.round(hours * 60)} min` : hours < 24 ? `${hours.toFixed(1)}h` : `${Math.round(hours / 24)} dia(s)`;
  return task.actualEndedAt ? `Concluída em ${formatted}` : `Em execução há ${formatted}`;
}

const statusLabel: Record<string, string> = {
  A_FAZER: "A fazer",
  FAZENDO: "Fazendo",
  BLOQUEADO: "Bloqueado",
  FEITO: "Feito",
};

const priorityLabel: Record<string, string> = {
  BAIXA: "Baixa",
  MEDIA: "Média",
  ALTA: "Alta",
  URGENTE: "Muito crítica",
};

export default function TaskDetailModal({
  taskId,
  onClose,
  onChanged,
}: {
  taskId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const userId = (session?.user as any)?.id;

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [teamMembers, setTeamMembers] = useState<{ id: string; name: string }[]>([]);
  const [allPeople, setAllPeople] = useState<{ id: string; name: string; nucleo: { name: string } | null }[]>([]);
  const [newComment, setNewComment] = useState("");
  const [newSubtask, setNewSubtask] = useState("");
  const [uploading, setUploading] = useState(false);
  const [openSubtaskId, setOpenSubtaskId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/tasks/${taskId}`);
    if (res.ok) setTask(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId]);

  useEffect(() => {
    if (!task?.project?.teamId) return;
    fetch("/api/teams")
      .then((r) => r.json())
      .then((teams: any[]) => {
        const team = teams.find((t) => t.id === task?.project?.teamId);
        setTeamMembers(team ? team.members.map((m: any) => m.user) : []);
      });
  }, [task?.project?.teamId]);

  useEffect(() => {
    fetch("/api/organograma")
      .then((r) => r.json())
      .then(setAllPeople)
      .catch(() => {});
  }, []);

  if (!task) return null;

  const canModify =
    role === "ADMIN" ||
    role === "GESTOR_PROJETO" ||
    (role === "COLABORADOR" && task.assigneeId === userId && !task.locked);
  const canDelete = (role === "ADMIN" || role === "GESTOR_PROJETO") && !task.locked;
  const canLock = role === "ADMIN" || role === "GESTOR_PROJETO";

  async function patch(data: any) {
    await fetch(`/api/tasks/${taskId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    load();
    onChanged();
  }

  async function handleAddComment(e: React.FormEvent) {
    e.preventDefault();
    if (!newComment.trim()) return;
    await fetch(`/api/tasks/${taskId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ body: newComment }),
    });
    setNewComment("");
    load();
  }

  async function handleAddSubtask(e: React.FormEvent) {
    e.preventDefault();
    if (!newSubtask.trim()) return;
    await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: newSubtask, parentTaskId: taskId, projectId: task?.project?.id ?? null }),
    });
    setNewSubtask("");
    load();
    onChanged();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const formData = new FormData();
    formData.append("file", file);
    formData.append("taskId", taskId);
    await fetch("/api/upload", { method: "POST", body: formData });
    setUploading(false);
    load();
  }

  async function handleDelete() {
    if (!confirm("Excluir esta tarefa e suas subtarefas?")) return;
    await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
    onChanged();
    onClose();
  }

  async function handleDeleteSubtask(subtaskId: string) {
    if (!confirm("Excluir esta subtarefa?")) return;
    await fetch(`/api/tasks/${subtaskId}`, { method: "DELETE" });
    load();
    onChanged();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between border-b border-gray-100 p-4">
          <div className="flex-1">
            {task.parentTask && (
              <p className="mb-1 text-xs text-gray-400">Subtarefa de: {task.parentTask.title}</p>
            )}
            {canModify ? (
              <input
                defaultValue={task.title}
                onBlur={(e) => e.target.value !== task.title && patch({ title: e.target.value })}
                className="w-full text-lg font-semibold outline-none focus:bg-gray-50"
              />
            ) : (
              <p className="text-lg font-semibold">{task.title}</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4 grid grid-cols-2 gap-3 text-sm">
            <div>
              <label className="mb-1 block text-xs text-gray-500">Status</label>
              <select
                disabled={!canModify}
                value={task.status}
                onChange={(e) => patch({ status: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                {Object.entries(statusLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Criticidade</label>
              <select
                disabled={!canModify}
                value={task.priority}
                onChange={(e) => patch({ priority: e.target.value })}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                {Object.entries(priorityLabel).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Responsável</label>
              <select
                disabled={!canModify}
                value={task.assigneeId ?? ""}
                onChange={(e) => patch({ assigneeId: e.target.value || null })}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              >
                <option value="">Ninguém</option>
                <optgroup label="Equipe do projeto">
                  {teamMembers.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Outras pessoas (outro núcleo)">
                  {allPeople
                    .filter((p) => !teamMembers.some((m) => m.id === p.id))
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                        {p.nucleo ? ` · ${p.nucleo.name}` : ""}
                      </option>
                    ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Início</label>
              <input
                type="date"
                disabled={!canModify}
                defaultValue={task.startDate?.slice(0, 10) ?? ""}
                onBlur={(e) => patch({ startDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-gray-500">Prazo</label>
              <input
                type="date"
                disabled={!canModify}
                defaultValue={task.dueDate?.slice(0, 10) ?? ""}
                onBlur={(e) => patch({ dueDate: e.target.value ? new Date(e.target.value).toISOString() : null })}
                className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm disabled:bg-gray-50"
              />
            </div>
          </div>

          {elapsedLabel(task) && (
            <p className="mb-4 text-xs text-gray-400">⏱ {elapsedLabel(task)}</p>
          )}

          {canModify && (
            <textarea
              defaultValue={task.description ?? ""}
              onBlur={(e) => e.target.value !== task.description && patch({ description: e.target.value })}
              placeholder="Descrição..."
              rows={2}
              className="mb-4 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
            />
          )}

          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-gray-500">
              Subtarefas ({task.subtasks.length})
            </p>
            <div className="mb-2 flex flex-col gap-1">
              {task.subtasks.map((s) => (
                <div
                  key={s.id}
                  onClick={() => setOpenSubtaskId(s.id)}
                  className="group flex items-center justify-between rounded-md bg-gray-50 px-2 py-1.5 text-sm hover:bg-gray-100 cursor-pointer"
                >
                  <span>{s.locked && "🔒 "}{s.title}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-400">{statusLabel[s.status]}</span>
                    {canDelete && !s.locked && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteSubtask(s.id);
                        }}
                        className="hidden text-xs text-red-400 hover:text-red-700 group-hover:inline"
                      >
                        Excluir
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {task.subtasks.length === 0 && (
                <p className="text-xs text-gray-400">Nenhuma subtarefa ainda.</p>
              )}
            </div>
            {canModify && (
              <form onSubmit={handleAddSubtask} className="flex gap-2">
                <input
                  value={newSubtask}
                  onChange={(e) => setNewSubtask(e.target.value)}
                  placeholder="+ Adicionar subtarefa"
                  className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                />
                <button className="rounded-md bg-gray-100 px-3 py-1.5 text-sm hover:bg-gray-200">Add</button>
              </form>
            )}
          </div>

          <div className="mb-4">
            <p className="mb-2 text-xs font-semibold text-gray-500">Anexos ({task.attachments.length})</p>
            <div className="mb-2 flex flex-col gap-1">
              {task.attachments.map((a) => (
                <a
                  key={a.id}
                  href={`/api/attachments/${a.id}`}
                  className="rounded-md bg-gray-50 px-2 py-1.5 text-sm text-brand-dark hover:bg-gray-100 hover:underline"
                >
                  📎 {a.fileName}
                </a>
              ))}
            </div>
            <input type="file" onChange={handleUpload} disabled={uploading} className="text-sm" />
          </div>

          <div>
            <p className="mb-2 text-xs font-semibold text-gray-500">Comentários</p>
            <div className="mb-2 flex max-h-48 flex-col gap-2 overflow-y-auto">
              {task.comments.map((c) => (
                <div key={c.id} className="rounded-md bg-gray-50 p-2 text-sm">
                  <p className="text-xs font-medium text-gray-600">{c.author.name}</p>
                  <p>{c.body}</p>
                </div>
              ))}
              {task.comments.length === 0 && <p className="text-xs text-gray-400">Nenhum comentário ainda.</p>}
            </div>
            <form onSubmit={handleAddComment} className="flex gap-2">
              <input
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                placeholder="Escreva um comentário..."
                className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              />
              <button className="rounded-md bg-brand px-3 py-1.5 text-sm text-white hover:bg-brand-dark">Enviar</button>
            </form>
          </div>
        </div>

        <div className="flex justify-between border-t border-gray-100 p-3">
          <div>
            {canLock && (
              <button
                onClick={() => patch({ locked: !task.locked })}
                className="rounded-md px-3 py-1.5 text-xs text-gray-500 hover:bg-gray-100"
              >
                {task.locked ? "🔒 Destravar" : "Travar"}
              </button>
            )}
          </div>
          {canDelete && (
            <button onClick={handleDelete} className="rounded-md px-3 py-1.5 text-xs text-red-500 hover:bg-red-50">
              Excluir tarefa
            </button>
          )}
        </div>
      </div>

      {openSubtaskId && (
        <TaskDetailModal
          taskId={openSubtaskId}
          onClose={() => setOpenSubtaskId(null)}
          onChanged={() => {
            load();
            onChanged();
          }}
        />
      )}
    </div>
  );
}
