"use client";

import { useEffect, useState } from "react";

export default function OutlookConnect() {
  const [status, setStatus] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const res = await fetch("/api/integrations/outlook/status");
    if (res.ok) setStatus(await res.json());
  }

  useEffect(() => {
    load();
  }, []);

  async function handleSync() {
    setSyncing(true);
    await fetch("/api/integrations/outlook/sync", { method: "POST" });
    setSyncing(false);
    window.location.reload();
  }

  async function handleDisconnect() {
    if (!confirm("Desconectar o Outlook? Os eventos já sincronizados continuam no sistema.")) return;
    await fetch("/api/integrations/outlook/disconnect", { method: "POST" });
    load();
  }

  if (!status) return null;

  if (!status.connected) {
    return (
      <a
        href="/api/integrations/outlook/connect"
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50"
      >
        Conectar Outlook
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="rounded-md bg-green-50 px-2 py-1.5 text-xs text-green-700">Outlook: {status.email}</span>
      <button
        onClick={handleSync}
        disabled={syncing}
        className="rounded-md border border-gray-300 px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
      >
        {syncing ? "Sincronizando..." : "Sincronizar agora"}
      </button>
      <button onClick={handleDisconnect} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-red-500 hover:bg-red-50">
        Desconectar
      </button>
    </div>
  );
}
