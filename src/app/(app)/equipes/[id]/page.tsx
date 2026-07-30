"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import Avatar from "@/components/Avatar";
import TeamChatPanel from "@/components/TeamChatPanel";
import FilesPanel from "@/components/FilesPanel";

type TeamDetail = {
  id: string;
  name: string;
  description: string | null;
  members: { user: { id: string; name: string; avatarColor: string; avatarUrl?: string | null; cargo?: string | null }; role: string }[];
  projects: { id: string; name: string; status: string; nucleos: { id: string; name: string }[] }[];
  nucleos: { id: string; name: string }[];
};

const statusLabel: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
};

export default function TeamDetailPage({ params }: { params: { id: string } }) {
  const { data: session } = useSession();
  const role = (session?.user as any)?.role;
  const myId = (session?.user as any)?.id;
  const canManage = role === "ADMIN" || role === "GESTOR_PROJETO";

  const [team, setTeam] = useState<TeamDetail | null>(null);
  const [tab, setTab] = useState<"visao" | "chat" | "arquivos">("visao");

  async function load() {
    const res = await fetch(`/api/teams/${params.id}`);
    if (res.ok) setTeam(await res.json());
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (!team) return <p className="text-sm text-gray-400">Carregando...</p>;

  const isMemberHere = team.members.some((m) => m.user.id === myId);
  const canFiles = canManage || isMemberHere;

  return (
    <div>
      <Link href="/equipes" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-gray-500 hover:text-brand-dark">
        ← Voltar para Equipes
      </Link>
      <h1 className="text-2xl font-semibold">{team.name}</h1>
      {team.description && <p className="mt-1 text-sm text-gray-500">{team.description}</p>}

      <div className="mb-4 mt-6 flex gap-1 border-b border-gray-200">
        <button
          onClick={() => setTab("visao")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === "visao" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"}`}
        >
          Visão geral
        </button>
        <button
          onClick={() => setTab("chat")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === "chat" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"}`}
        >
          Chat
        </button>
        <button
          onClick={() => setTab("arquivos")}
          className={`rounded-t-md px-4 py-2 text-sm font-medium ${tab === "arquivos" ? "border-b-2 border-brand text-brand-dark" : "text-gray-500"}`}
        >
          Arquivos
        </button>
      </div>

      {tab === "visao" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <h2 className="mb-3 text-sm font-semibold text-gray-600">Membros ({team.members.length})</h2>
            <ul className="space-y-2">
              {team.members.map((m) => (
                <li key={m.user.id} className="flex items-center gap-2 text-sm text-gray-600">
                  <Avatar name={m.user.name} color={m.user.avatarColor} photoUrl={m.user.avatarUrl} />
                  {m.user.name} <span className="text-xs text-gray-400">({m.role})</span>
                </li>
              ))}
              {team.members.length === 0 && <p className="text-sm text-gray-400">Nenhum membro ainda.</p>}
            </ul>
          </div>

          <div className="flex flex-col gap-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-600">Núcleos ({team.nucleos.length})</h2>
              {team.nucleos.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum — os núcleos aparecem aqui a partir dos projetos da equipe.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {team.nucleos.map((n) => (
                    <span key={n.id} className="rounded-full bg-gray-100 px-2.5 py-1 text-xs text-gray-600">
                      {n.name}
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <h2 className="mb-3 text-sm font-semibold text-gray-600">Projetos ({team.projects.length})</h2>
              {team.projects.length === 0 ? (
                <p className="text-sm text-gray-400">Nenhum projeto ainda.</p>
              ) : (
                <ul className="space-y-2">
                  {team.projects.map((p) => (
                    <li key={p.id}>
                      <Link href={`/projetos/${p.id}`} className="text-sm text-brand-dark hover:underline">
                        {p.name}
                      </Link>
                      <span className="ml-2 text-xs text-gray-400">
                        {statusLabel[p.status] ?? p.status}
                        {p.nucleos.length > 0 && ` · ${p.nucleos.map((n) => n.name).join(", ")}`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "chat" && <TeamChatPanel teamId={team.id} />}
      {tab === "arquivos" && <FilesPanel scope={{ type: "team", id: team.id }} canManage={canFiles} />}
    </div>
  );
}
