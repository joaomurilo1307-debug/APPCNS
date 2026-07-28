"use client";

import { useEffect, useState } from "react";
import Avatar from "./Avatar";

type Resource = {
  userId: string;
  name: string;
  avatarColor: string;
  avatarUrl: string | null;
  hourlyRate: number;
  hoursSpent: number;
  cost: number;
};

type Activity = {
  taskId: string;
  title: string;
  status: string;
  assigneeId: string | null;
  assigneeName: string;
  hoursSpent: number;
  hourlyRate: number;
  cost: number;
};

function fmtHours(h: number) {
  return h < 1 ? `${Math.round(h * 60)} min` : `${h.toFixed(1)}h`;
}

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function ResourcesPanel({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [resources, setResources] = useState<Resource[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const res = await fetch(`/api/projects/${projectId}/resources`);
    if (res.ok) {
      const data = await res.json();
      setResources(data.resources);
      setActivities(data.activities);
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function saveRate(userId: string, hourlyRate: number) {
    await fetch(`/api/projects/${projectId}/resources`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userId, hourlyRate }),
    });
    load();
  }

  if (!loaded) return <p className="text-sm text-gray-400">Carregando...</p>;

  const totalCost = resources.reduce((s, r) => s + r.cost, 0);
  const totalHours = resources.reduce((s, r) => s + r.hoursSpent, 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Horas gastas (total)</p>
          <p className="mt-1 text-2xl font-semibold">{fmtHours(totalHours)}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="text-xs text-gray-500">Custo total (recursos)</p>
          <p className="mt-1 text-2xl font-semibold">{fmtMoney(totalCost)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h3 className="text-sm font-semibold">Recursos (pessoas)</h3>
          <p className="text-xs text-gray-400">
            Horas gastas vêm do tempo real entre início e conclusão de cada tarefa. Defina o valor/hora de cada
            pessoa para calcular o custo.
          </p>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              <th className="px-4 py-2">Pessoa</th>
              <th className="px-4 py-2">Horas gastas</th>
              <th className="px-4 py-2">Valor/hora</th>
              <th className="px-4 py-2">Custo</th>
            </tr>
          </thead>
          <tbody>
            {resources.map((r) => (
              <tr key={r.userId} className="border-b border-gray-50">
                <td className="px-4 py-2">
                  <div className="flex items-center gap-2">
                    <Avatar name={r.name} color={r.avatarColor} photoUrl={r.avatarUrl} size={22} />
                    {r.name}
                  </div>
                </td>
                <td className="px-4 py-2">{fmtHours(r.hoursSpent)}</td>
                <td className="px-4 py-2">
                  {canManage ? (
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      defaultValue={r.hourlyRate}
                      onBlur={(e) => {
                        const v = Number(e.target.value);
                        if (!isNaN(v) && v !== r.hourlyRate) saveRate(r.userId, v);
                      }}
                      className="w-24 rounded-md border border-gray-200 px-2 py-1 text-sm"
                    />
                  ) : (
                    fmtMoney(r.hourlyRate)
                  )}
                </td>
                <td className="px-4 py-2 font-medium">{fmtMoney(r.cost)}</td>
              </tr>
            ))}
            {resources.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-400">
                  Nenhum membro na equipe deste projeto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <div className="border-b border-gray-100 p-4">
          <h3 className="text-sm font-semibold">Custo por atividade</h3>
          <p className="text-xs text-gray-400">Horas gastas × valor/hora do responsável, por tarefa.</p>
        </div>
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-xs text-gray-500">
              <th className="px-4 py-2">Tarefa</th>
              <th className="px-4 py-2">Responsável</th>
              <th className="px-4 py-2">Horas gastas</th>
              <th className="px-4 py-2">Custo</th>
            </tr>
          </thead>
          <tbody>
            {activities.map((a) => (
              <tr key={a.taskId} className="border-b border-gray-50">
                <td className="px-4 py-2">{a.title}</td>
                <td className="px-4 py-2 text-gray-500">{a.assigneeName}</td>
                <td className="px-4 py-2">{fmtHours(a.hoursSpent)}</td>
                <td className="px-4 py-2 font-medium">{fmtMoney(a.cost)}</td>
              </tr>
            ))}
            {activities.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-4 text-center text-sm text-gray-400">
                  Nenhuma tarefa com responsável ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
