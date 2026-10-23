"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Avatar, { AVATAR_PALETTE } from "@/components/Avatar";
import PainelAcesso from "@/components/usuarios/PainelAcesso";

type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  verTodosCustos: boolean;
  avatarColor: string;
  avatarUrl?: string | null;
  cargo?: string | null;
  diretoria?: string | null;
  ramal?: string | null;
  whatsapp?: string | null;
  dataInicio?: string | null;
  gestorImediatoId?: string | null;
  gestorImediato?: { id: string; name: string } | null;
  nivelHierarquico?: string | null;
  nucleoId?: string | null;
  nucleo?: { id: string; name: string } | null;
  teams: { team: { id: string; name: string } }[];
  anonymizedAt?: string | null;
};

type NucleoOption = { id: string; name: string };

const roleLabel: Record<string, string> = {
  ADMIN: "Admin",
  DIRETOR: "Diretor",
  GESTOR_PROJETO: "Gestor de Projeto",
  APROVADOR: "Aprovador",
  COLABORADOR: "Colaborador",
  CLIENTE: "Cliente",
  VISUALIZADOR: "Visualizador (só leitura)",
};

const nivelLabel: Record<string, string> = {
  DIRETORIA: "Diretoria",
  GERENCIA: "Gerência",
  COORDENACAO: "Coordenação",
  SUPERVISOR: "Supervisor",
  COLABORADOR: "Colaborador",
};

export default function UsuariosPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const currentRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status === "authenticated" && currentRole !== "ADMIN") {
      router.replace("/dashboard");
    }
  }, [status, currentRole, router]);

  const [users, setUsers] = useState<UserRow[]>([]);
  // lista leve: busca, filtros e paginacao (renderizar centenas de linhas com ~15 controles cada deixava a tela travada)
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"ativos" | "inativos" | "todos">("ativos");
  const [filtroPapel, setFiltroPapel] = useState("");
  const [pagina, setPagina] = useState(0);
  const POR_PAGINA = 25;
  // janela unica de criacao: dados da pessoa + telas de cada modulo + projetos, contratos, nucleos e Senior
  const [criarAberto, setCriarAberto] = useState(false);
  const [nucleos, setNucleos] = useState<NucleoOption[]>([]);
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  // painel de acesso aberto pelo botao "Acesso" da linha
  const [acessoDe, setAcessoDe] = useState<{ id: string } | null>(null);

  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return users.filter((u) => {
      if (filtroStatus === "ativos" && !u.active) return false;
      if (filtroStatus === "inativos" && u.active) return false;
      if (filtroPapel && u.role !== filtroPapel) return false;
      return !t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t) || (u.cargo ?? "").toLowerCase().includes(t);
    });
  }, [users, busca, filtroStatus, filtroPapel]);
  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);

  async function load() {
    try {
      const res = await fetch("/api/users");
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data)) setUsers(data);
    } catch {
      // rede instavel ou deploy em andamento; a tela mantem os dados anteriores
    }
  }

  async function loadNucleos() {
    const res = await fetch("/api/nucleos");
    if (res.ok) setNucleos(await res.json());
  }

  useEffect(() => {
    load();
    loadNucleos();
  }, []);

  async function updateRole(id: string, newRole: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role: newRole }),
    });
    load();
  }

  async function updateColor(id: string, color: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ avatarColor: color }),
    });
    load();
  }

  async function updateField(id: string, field: string, value: string) {
    await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value || null }),
    });
    load();
  }

  async function handleResetPassword(id: string) {
    if (newPassword.length < 8) {
      setResetError("Mínimo de 8 caracteres.");
      return;
    }
    setResetError(null);
    const res = await fetch(`/api/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: newPassword }),
    });
    if (!res.ok) {
      setResetError("Não foi possível redefinir a senha.");
      return;
    }
    alert(`Senha redefinida. Repasse para a pessoa: ${newPassword}`);
    setResettingId(null);
    setNewPassword("");
  }

  async function toggleActive(u: UserRow) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: !u.active }),
    });
    load();
  }

  async function toggleVerTodosCustos(u: UserRow) {
    await fetch(`/api/users/${u.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ verTodosCustos: !u.verTodosCustos }),
    });
    load();
  }

  async function handleDelete(u: UserRow) {
    if (!confirm(`Excluir "${u.name}" permanentemente? Isso não pode ser desfeito.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Não foi possível excluir.");
      return;
    }
    load();
  }

  async function handleOffboard(u: UserRow) {
    if (
      !confirm(
        `Encerrar vínculo de "${u.name}" e anonimizar os dados pessoais dela (nome, e-mail, whatsapp, foto)?\n\n` +
          "Isso é IRREVERSÍVEL. O histórico de tarefas, projetos e PDI continua vinculado, mas o nome real não aparece mais em lugar nenhum."
      )
    )
      return;
    const res = await fetch(`/api/users/${u.id}/offboard`, { method: "POST" });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Não foi possível encerrar o vínculo.");
      return;
    }
    load();
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Usuários e Governança</h1>
          <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1">
            <a href="/usuarios/projetos" className="text-[13px] font-medium text-brand hover:text-brand-dark">Escolher em quais projetos cada pessoa entra →</a>
            <a href="/custos/acessos" className="text-[13px] font-medium text-brand hover:text-brand-dark">Escolher quais centros de custo cada pessoa vê nos custos →</a>
          </div>
          <p className="text-sm text-gray-500">Cadastro de acesso e papéis. Restrito a Admin.</p>
        </div>
        <button
          onClick={() => setCriarAberto(true)}
          className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark"
        >
          + Novo usuário
        </button>
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input
          value={busca}
          onChange={(e) => { setBusca(e.target.value); setPagina(0); }}
          placeholder="Buscar por nome, e-mail ou cargo…"
          className="w-72 rounded-md border border-gray-300 px-3 py-2 text-sm"
        />
        <select value={filtroStatus} onChange={(e) => { setFiltroStatus(e.target.value as any); setPagina(0); }} className="rounded-md border border-gray-300 px-2 py-2 text-sm">
          <option value="ativos">Ativos</option>
          <option value="inativos">Inativos</option>
          <option value="todos">Todos</option>
        </select>
        <select value={filtroPapel} onChange={(e) => { setFiltroPapel(e.target.value); setPagina(0); }} className="rounded-md border border-gray-300 px-2 py-2 text-sm">
          <option value="">Todos os papéis</option>
          {Object.entries(roleLabel).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
        <span className="ml-auto text-sm text-gray-500">
          {filtrados.length} {filtrados.length === 1 ? "pessoa" : "pessoas"} · página {paginaAtual + 1} de {totalPaginas}
        </span>
        <button disabled={paginaAtual === 0} onClick={() => setPagina(paginaAtual - 1)} className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-40">‹ Anterior</button>
        <button disabled={paginaAtual >= totalPaginas - 1} onClick={() => setPagina(paginaAtual + 1)} className="rounded-md border border-gray-300 px-3 py-2 text-sm disabled:opacity-40">Próxima ›</button>
      </div>

      <div className="max-h-[calc(100vh-17rem)] overflow-auto rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 border-b bg-gray-50 text-left text-gray-500">
            <tr>
              <th className="px-4 py-3">Nome</th>
              <th className="px-4 py-3">E-mail</th>
              <th className="px-4 py-3">Papel</th>
              <th className="px-4 py-3">Vê todos os custos?</th>
              <th className="px-4 py-3">Cargo</th>
              <th className="px-4 py-3">Diretoria</th>
              <th className="px-4 py-3">Ramal</th>
              <th className="px-4 py-3">WhatsApp</th>
              <th className="px-4 py-3">Nível</th>
              <th className="px-4 py-3">Núcleo</th>
              <th className="px-4 py-3">Gestor imediato</th>
              <th className="px-4 py-3">Cor</th>
              <th className="px-4 py-3">Equipes</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Senha</th>
              <th className="px-4 py-3">Ações</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.map((u) => (
              <tr key={u.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">
                  <div className="flex items-center gap-2">
                    <Avatar name={u.name} color={u.avatarColor} photoUrl={u.avatarUrl} />
                    {u.name}
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500">{u.email}</td>
                <td className="px-4 py-3">
                  <select
                    value={u.role}
                    onChange={(e) => updateRole(u.id, e.target.value)}
                    className="rounded-md border border-gray-300 px-2 py-1 text-xs"
                  >
                    {Object.entries(roleLabel).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  {["ADMIN", "DIRETOR"].includes(u.role) ? (
                    <span className="text-xs text-gray-400" title="Admin e Diretor já veem tudo por causa do papel">
                      já vê tudo
                    </span>
                  ) : (
                    <button
                      onClick={() => toggleVerTodosCustos(u)}
                      title="Custo por Plano de Contas mostra os custos de TODA a empresa pra essa pessoa, mesmo sem ela ser Diretor"
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        u.verTodosCustos ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {u.verTodosCustos ? "Sim, tudo" : "Só das equipes"}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.cargo ?? ""}
                    onBlur={(e) => e.target.value !== (u.cargo ?? "") && updateField(u.id, "cargo", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.diretoria ?? ""}
                    onBlur={(e) => e.target.value !== (u.diretoria ?? "") && updateField(u.id, "diretoria", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.ramal ?? ""}
                    onBlur={(e) => e.target.value !== (u.ramal ?? "") && updateField(u.id, "ramal", e.target.value)}
                    className="w-16 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <input
                    defaultValue={u.whatsapp ?? ""}
                    onBlur={(e) => e.target.value !== (u.whatsapp ?? "") && updateField(u.id, "whatsapp", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  />
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.nivelHierarquico ?? ""}
                    onChange={(e) => updateField(u.id, "nivelHierarquico", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {Object.entries(nivelLabel).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.nucleoId ?? ""}
                    onChange={(e) => updateField(u.id, "nucleoId", e.target.value)}
                    className="w-28 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {nucleos.map((n) => (
                      <option key={n.id} value={n.id}>{n.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <select
                    value={u.gestorImediatoId ?? ""}
                    onChange={(e) => updateField(u.id, "gestorImediatoId", e.target.value)}
                    className="w-32 rounded-md border border-gray-200 px-2 py-1 text-xs"
                  >
                    <option value="">—</option>
                    {users.filter((o) => o.id !== u.id).map((o) => (
                      <option key={o.id} value={o.id}>{o.name}</option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-1">
                    {AVATAR_PALETTE.slice(0, 6).map((c) => (
                      <button
                        key={c}
                        onClick={() => updateColor(u.id, c)}
                        className={`h-4 w-4 rounded-full ${u.avatarColor === c ? "ring-2 ring-offset-1 ring-gray-500" : ""}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                  {u.teams.map((t) => t.team.name).join(", ") || "—"}
                </td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleActive(u)}
                    className={`rounded-full px-2 py-0.5 text-xs ${
                      u.active ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"
                    }`}
                  >
                    {u.active ? "Ativo" : "Inativo"}
                  </button>
                  {u.anonymizedAt && (
                    <span className="ml-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-400" title={`Anonimizado em ${new Date(u.anonymizedAt).toLocaleDateString("pt-BR")}`}>
                      🔒 anonimizado
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {resettingId === u.id ? (
                    <div className="flex flex-col gap-1">
                      <input
                        type="text"
                        autoFocus
                        placeholder="Nova senha (mín. 8)"
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        className="w-36 rounded-md border border-gray-300 px-2 py-1 text-xs"
                      />
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleResetPassword(u.id)}
                          className="rounded-md bg-brand px-2 py-1 text-[11px] font-medium text-white hover:bg-brand-dark"
                        >
                          Salvar
                        </button>
                        <button
                          onClick={() => {
                            setResettingId(null);
                            setNewPassword("");
                            setResetError(null);
                          }}
                          className="rounded-md border border-gray-300 px-2 py-1 text-[11px] text-gray-500 hover:bg-gray-50"
                        >
                          Cancelar
                        </button>
                      </div>
                      {resetError && <p className="text-[11px] text-red-600">{resetError}</p>}
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        setResettingId(u.id);
                        setNewPassword("");
                        setResetError(null);
                      }}
                      className="text-xs text-brand-dark underline hover:text-brand"
                    >
                      Redefinir
                    </button>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-col items-start gap-1">
                    <button
                      onClick={() => setAcessoDe({ id: u.id })}
                      className="rounded-md bg-brand px-2.5 py-1 text-xs font-semibold text-white hover:bg-brand-dark"
                    >
                      Acesso
                    </button>
                    <button
                      onClick={() => handleDelete(u)}
                      className="text-xs text-red-500 hover:text-red-700 hover:underline"
                    >
                      Excluir
                    </button>
                    {!u.anonymizedAt && (
                      <button
                        onClick={() => handleOffboard(u)}
                        title="Anonimiza nome, e-mail, whatsapp e foto — mantém histórico de tarefas/projetos/PDI. Irreversível."
                        className="text-[11px] text-gray-400 hover:text-gray-700 hover:underline"
                      >
                        Encerrar vínculo
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {acessoDe && <PainelAcesso userId={acessoDe.id} onFechar={() => setAcessoDe(null)} onSalvo={load} />}
      {criarAberto && (
        <PainelAcesso
          userId={null}
          usuarios={users.filter((u) => u.active && !u.anonymizedAt).map((u) => ({ id: u.id, name: u.name }))}
          onFechar={() => setCriarAberto(false)}
          onSalvo={() => { load(); loadNucleos(); }}
        />
      )}
    </div>
  );
}
