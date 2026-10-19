"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

type Usuario = { id: string; name: string; email: string; role: string; cargo: string | null; _count: { acessosProjeto: number } };
type Projeto = { id: string; name: string; status: string; equipe: string; responsavel: string; convidado: boolean; viaEquipe: boolean; dono: boolean };

const STATUS: Record<string, string> = { PLANEJADO: "Planejado", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", CONCLUIDO: "Concluído" };

function Tela() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const params = useSearchParams();
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [busca, setBusca] = useState("");
  const [escolhido, setEscolhido] = useState<string | null>(params.get("user"));
  const [projetos, setProjetos] = useState<Projeto[] | null>(null);
  const [buscaProj, setBuscaProj] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (status === "authenticated" && (session?.user as any)?.role !== "ADMIN") router.replace("/dashboard");
  }, [status, session, router]);

  useEffect(() => {
    fetch("/api/projetos-acesso").then((r) => r.json()).then((d) => setUsuarios(d.usuarios ?? []));
  }, []);

  const carregar = useCallback((id: string) => {
    setProjetos(null);
    fetch(`/api/projetos-acesso?userId=${id}`).then((r) => r.json()).then((d) => setProjetos(d.projetos ?? []));
  }, []);
  useEffect(() => {
    if (escolhido) carregar(escolhido);
  }, [escolhido, carregar]);

  const lista = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return usuarios.filter((u) => !t || u.name.toLowerCase().includes(t) || u.email.toLowerCase().includes(t)).slice(0, 80);
  }, [usuarios, busca]);
  const pessoa = usuarios.find((u) => u.id === escolhido);

  async function alternar(p: Projeto) {
    if (!escolhido || !projetos) return;
    const novos = projetos.map((x) => (x.id === p.id ? { ...x, convidado: !x.convidado } : x));
    setProjetos(novos);
    setSalvando(true);
    setMsg("");
    const r = await fetch("/api/projetos-acesso", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: escolhido, projectIds: novos.filter((x) => x.convidado).map((x) => x.id) }) });
    setSalvando(false);
    setMsg(r.ok ? "Salvo" : "Não foi possível salvar");
    if (r.ok) setUsuarios((us) => us.map((u) => (u.id === escolhido ? { ...u, _count: { acessosProjeto: novos.filter((x) => x.convidado).length } } : u)));
  }

  const visiveis = (projetos ?? []).filter((p) => !buscaProj.trim() || (p.name + p.equipe).toLowerCase().includes(buscaProj.trim().toLowerCase()));

  return (
    <div>
      <a href="/usuarios" className="text-[13px] font-medium text-brand hover:text-brand-dark">← Usuários</a>
      <h1 className="mt-1 text-2xl font-semibold">Projetos de cada pessoa</h1>
      <p className="mb-5 text-sm text-gray-500">Escolha em quais projetos a pessoa entra. Ela só vê o que criou, o que é da equipe dela e o que você marcar aqui. Ninguém vê projeto só por ser gestor ou diretor.</p>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <section className="rounded-xl border border-gray-200 bg-white p-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar pessoa…" className="mb-2 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
          <ul className="max-h-[60vh] space-y-0.5 overflow-auto">
            {lista.map((u) => (
              <li key={u.id}>
                <button onClick={() => setEscolhido(u.id)} className={`flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-sm hover:bg-gray-50 ${u.id === escolhido ? "bg-brand-light/60 font-medium" : ""}`}>
                  <span className="truncate">
                    {u.name}
                    <span className="block truncate text-xs font-normal text-gray-400">{u.cargo ?? u.email}</span>
                  </span>
                  {u._count.acessosProjeto > 0 && <span className="ml-2 shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">{u._count.acessosProjeto}</span>}
                </button>
              </li>
            ))}
            {lista.length === 0 && <li className="px-2 py-3 text-sm text-gray-400">Ninguém encontrado.</li>}
          </ul>
        </section>
        <section className="rounded-xl border border-gray-200 bg-white p-4">
          {!escolhido ? (
            <p className="py-10 text-center text-sm text-gray-500">Escolha uma pessoa à esquerda.</p>
          ) : (
            <>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-base font-semibold">{pessoa?.name ?? "Pessoa"}</h2>
                <span className="text-xs text-gray-400">{salvando ? "Salvando…" : msg}</span>
              </div>
              <input value={buscaProj} onChange={(e) => setBuscaProj(e.target.value)} placeholder="Buscar projeto ou equipe…" className="mb-3 w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
              {projetos === null ? (
                <div className="h-32 animate-pulse rounded-lg bg-gray-100" />
              ) : (
                <ul className="max-h-[60vh] divide-y divide-gray-100 overflow-auto">
                  {visiveis.map((p) => {
                    const fixo = p.dono || p.viaEquipe;
                    return (
                      <li key={p.id} className="flex items-center gap-3 py-2">
                        <input type="checkbox" checked={fixo || p.convidado} disabled={fixo} onChange={() => alternar(p)} className="h-4 w-4 accent-teal-600" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-gray-800">{p.name}</p>
                          <p className="truncate text-xs text-gray-400">
                            {p.equipe} · {STATUS[p.status] ?? p.status} · responsável {p.responsavel}
                          </p>
                        </div>
                        {p.dono && <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-800">criou</span>}
                        {!p.dono && p.viaEquipe && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs text-sky-800">pela equipe</span>}
                        {!fixo && p.convidado && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs text-teal-800">convidado</span>}
                      </li>
                    );
                  })}
                  {visiveis.length === 0 && <li className="py-6 text-center text-sm text-gray-400">Nenhum projeto.</li>}
                </ul>
              )}
              <p className="mt-3 text-xs text-gray-400">“Pela equipe” sai quando a pessoa deixa a equipe (tela Equipes). “Convidado” é o convite desta tela.</p>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <Tela />
    </Suspense>
  );
}
