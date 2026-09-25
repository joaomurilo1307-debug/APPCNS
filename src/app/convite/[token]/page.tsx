"use client";

import { useEffect, useState } from "react";
import ConsominasLogo from "@/components/ConsominasLogo";

type InviteData = {
  guestName: string;
  guestEmail: string;
  status: string;
  event: {
    title: string;
    description: string | null;
    startAt: string;
    endAt: string | null;
    allDay: boolean;
    onlineMeetingUrl: string | null;
    creator: { name: string };
    project: { name: string } | null;
  };
};

const statusLabel: Record<string, string> = {
  PENDENTE: "Aguardando sua resposta",
  APROVADO: "Você confirmou presença",
  REJEITADO: "Você recusou o convite",
};

export default function ConvitePage({ params }: { params: { token: string } }) {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<InviteData | null>(null);
  const [error, setError] = useState(false);
  const [responding, setResponding] = useState(false);

  function load() {
    fetch(`/api/public/convite/${params.token}`)
      .then((r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then((d) => {
        setData(d);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }

  useEffect(load, [params.token]);

  async function respond(status: "APROVADO" | "REJEITADO") {
    setResponding(true);
    await fetch(`/api/public/convite/${params.token}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setResponding(false);
    load();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="mb-6">
          <ConsominasLogo size={40} />
        </div>

        {loading && <p className="text-sm text-gray-500">Carregando convite...</p>}

        {!loading && error && (
          <>
            <h1 className="mb-2 text-lg font-semibold">Convite não encontrado</h1>
            <p className="text-sm text-gray-500">Esse link não é válido, ou o evento pode ter sido excluído.</p>
          </>
        )}

        {!loading && data && (
          <>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-brand-dark">
              {data.event.project ? data.event.project.name : "Convite"}
            </p>
            <h1 className="mb-2 text-xl font-semibold">{data.event.title}</h1>
            <p className="mb-4 text-sm text-gray-500">
              {new Date(data.event.startAt).toLocaleString("pt-BR", {
                timeZone: "UTC",
                day: "2-digit",
                month: "long",
                year: "numeric",
                ...(data.event.allDay ? {} : { hour: "2-digit", minute: "2-digit" }),
              })}
              {data.event.allDay && " · Dia inteiro"}
            </p>
            {data.event.description && <p className="mb-4 text-sm text-gray-600">{data.event.description}</p>}
            <p className="mb-4 text-sm text-gray-500">
              Organizado por <strong>{data.event.creator.name}</strong>
            </p>
            {data.event.onlineMeetingUrl && (
              <a
                href={data.event.onlineMeetingUrl}
                target="_blank"
                rel="noreferrer"
                className="mb-4 inline-block text-sm font-medium text-brand-dark underline"
              >
                Link da videochamada
              </a>
            )}

            <div className="mb-4 rounded-md bg-gray-50 px-3 py-2 text-sm">
              <span className="text-gray-500">Olá, {data.guestName}. </span>
              <span
                className={
                  data.status === "APROVADO"
                    ? "font-medium text-green-600"
                    : data.status === "REJEITADO"
                    ? "font-medium text-red-500"
                    : "font-medium text-gray-500"
                }
              >
                {statusLabel[data.status]}
              </span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => respond("APROVADO")}
                disabled={responding}
                className="flex-1 rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
              >
                Confirmar presença
              </button>
              <button
                onClick={() => respond("REJEITADO")}
                disabled={responding}
                className="flex-1 rounded-md border border-gray-300 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60"
              >
                Recusar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
