"use client";

import { Fragment, useEffect, useState } from "react";

type AuditEntry = {
  id: string;
  action: string;
  entityType: string | null;
  entityId: string | null;
  metadata: string | null;
  createdAt: string;
  user: { id: string; name: string; email: string } | null;
};

const actionLabel: Record<string, string> = {
  "login.success": "Login bem-sucedido",
  "login.failed": "Tentativa de login falhou",
  "user.create": "Usuário criado",
  "user.update": "Usuário atualizado",
  "user.password_reset": "Senha redefinida",
  "user.delete": "Usuário excluído",
  "user.offboard_anonymize": "Vínculo encerrado (anonimizado)",
};

const actionColor: Record<string, string> = {
  "login.success": "bg-emerald-100 text-emerald-700",
  "login.failed": "bg-rose-100 text-rose-700",
  "user.create": "bg-blue-100 text-blue-700",
  "user.update": "bg-gray-100 text-gray-600",
  "user.password_reset": "bg-amber-100 text-amber-700",
  "user.delete": "bg-rose-100 text-rose-700",
  "user.offboard_anonymize": "bg-purple-100 text-purple-700",
};

export default function AuditLogPanel() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load(nextCursor?: string) {
    setLoading(true);
    const res = await fetch(`/api/audit-log${nextCursor ? `?cursor=${nextCursor}` : ""}`);
    if (!res.ok) {
      setError("Sem permissão para ver a auditoria.");
      setLoading(false);
      return;
    }
    const data = await res.json();
    setLogs((prev) => (nextCursor ? [...prev, ...data.logs] : data.logs));
    setCursor(data.nextCursor);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  return (
    <div>
      <h2 className="mb-1 text-sm font-semibold text-gray-600">Auditoria</h2>
      <p className="mb-3 text-xs text-gray-400">
        Registro de ações sensíveis do sistema — login, criação/edição/exclusão de usuários, anonimização de dados (LGPD). Só visível para administradores.
      </p>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="shadow-elevated overflow-hidden rounded-2xl border border-gray-100 bg-white">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="glass text-[11px] font-semibold uppercase tracking-wide text-gray-400">
              <th className="px-4 py-2.5">Quando</th>
              <th className="px-4 py-2.5">Ação</th>
              <th className="px-4 py-2.5">Por</th>
              <th className="px-4 py-2.5">Entidade</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <Fragment key={l.id}>
                <tr className="border-t border-gray-50 hover:bg-gray-50/60">
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(l.createdAt).toLocaleString("pt-BR")}
                  </td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${actionColor[l.action] ?? "bg-gray-100 text-gray-600"}`}>
                      {actionLabel[l.action] ?? l.action}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-600">{l.user ? l.user.name : "—"}</td>
                  <td className="px-4 py-2 text-xs text-gray-400">
                    {l.entityType ?? "—"} {l.entityId ? `· ${l.entityId.slice(-8)}` : ""}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {l.metadata && (
                      <button
                        onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                        className="text-xs text-brand-dark hover:underline"
                      >
                        {expandedId === l.id ? "Ocultar" : "Detalhes"}
                      </button>
                    )}
                  </td>
                </tr>
                {expandedId === l.id && l.metadata && (
                  <tr className="border-t border-gray-50 bg-gray-50/50">
                    <td colSpan={5} className="px-4 py-2 text-xs text-gray-500">
                      <pre className="whitespace-pre-wrap">{JSON.stringify(JSON.parse(l.metadata), null, 2)}</pre>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
            {logs.length === 0 && !loading && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-sm text-gray-400">
                  Nenhum registro ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {cursor && (
        <button
          onClick={() => load(cursor)}
          disabled={loading}
          className="mt-3 rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-600 shadow-soft hover:border-brand/30 disabled:opacity-50"
        >
          {loading ? "Carregando..." : "Carregar mais"}
        </button>
      )}
    </div>
  );
}
