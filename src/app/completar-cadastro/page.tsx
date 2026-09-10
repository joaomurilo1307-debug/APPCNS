"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession, signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import ConsominasLogo from "@/components/ConsominasLogo";
import { CARGOS_LISTA } from "@/lib/cargos";

type Projeto = { id: string; name: string; teamId: string; codccu: string | null };
type Nucleo = { id: string; name: string };

// areas de engenharia que o Joao cita e que podem ainda nao existir como
// nucleo -- ficam no topo do seletor; a API cria o nucleo se for novo
const AREAS_EXTRA = ["Engenharia - Empreendimentos (EMB)", "Engenharia - Civil (CIV)"];

export default function CompletarCadastroPage() {
  const { data: session, update } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [cargo, setCargo] = useState("");
  const [area, setArea] = useState("");
  const [projetoIds, setProjetoIds] = useState<string[]>([]);
  const [projetos, setProjetos] = useState<Projeto[]>([]);
  const [nucleos, setNucleos] = useState<Nucleo[]>([]);
  const [buscaProj, setBuscaProj] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/completar-cadastro/opcoes")
      .then((r) => (r.ok ? r.json() : { projetos: [], nucleos: [] }))
      .then((d) => {
        setProjetos(d.projetos ?? []);
        setNucleos(d.nucleos ?? []);
      })
      .catch(() => {});
  }, []);

  const projetosFiltrados = useMemo(() => {
    const t = buscaProj.trim().toLowerCase();
    if (!t) return projetos;
    return projetos.filter((p) => p.name.toLowerCase().includes(t) || (p.codccu ?? "").includes(t));
  }, [projetos, buscaProj]);

  function toggleProjeto(id: string) {
    setProjetoIds((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!cargo) {
      setError("Escolha seu cargo.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/completar-cadastro", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        cargo,
        nucleoNome: area || undefined,
        projetoIds,
      }),
    });
    const data = await res.json().catch(() => ({}));
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Não foi possível salvar. Tente de novo.");
      return;
    }

    await update();
    router.push("/projetos");
    router.refresh();
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden py-10">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-md rounded-2xl border border-gray-100 bg-white/90 p-8 shadow-xl backdrop-blur"
      >
        <div className="mb-6">
          <ConsominasLogo size={40} />
        </div>
        <h1 className="mb-1 text-lg font-semibold">Bem-vindo(a), {session?.user?.name?.split(" ")[0]}!</h1>
        <p className="mb-6 text-sm text-gray-500">
          Primeiro acesso — confirme seu e-mail, escolha uma senha e diga seu cargo, sua área e em quais contratos
          você atua. Isso define o que você enxerga no sistema.
        </p>

        <label className="mb-1 block text-sm font-medium">Seu e-mail real</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          placeholder="voce@consominas.com.br"
        />

        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">Nova senha</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              placeholder="mín. 8"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">Confirme</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />
          </div>
        </div>

        <label className="mb-1 block text-sm font-medium">Cargo</label>
        <select
          required
          value={cargo}
          onChange={(e) => setCargo(e.target.value)}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">Selecione...</option>
          {CARGOS_LISTA.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium">Área / setor</label>
        <select
          value={area}
          onChange={(e) => setArea(e.target.value)}
          className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        >
          <option value="">Selecione...</option>
          {AREAS_EXTRA.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
          <option disabled>──────────</option>
          {nucleos.map((n) => (
            <option key={n.id} value={n.name}>
              {n.name}
            </option>
          ))}
        </select>

        <label className="mb-1 block text-sm font-medium">
          Contratos em que você atua <span className="font-normal text-gray-400">({projetoIds.length} selecionados)</span>
        </label>
        <input
          type="text"
          placeholder="Filtrar contratos..."
          value={buscaProj}
          onChange={(e) => setBuscaProj(e.target.value)}
          className="mb-2 w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <div className="mb-4 max-h-52 space-y-1 overflow-y-auto rounded-md border border-gray-200 p-2">
          {projetosFiltrados.length === 0 && (
            <p className="px-1 py-2 text-xs text-gray-400">Nenhum contrato encontrado.</p>
          )}
          {projetosFiltrados.map((p) => (
            <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-gray-50">
              <input
                type="checkbox"
                checked={projetoIds.includes(p.id)}
                onChange={() => toggleProjeto(p.id)}
                className="rounded border-gray-300 text-brand focus:ring-brand"
              />
              <span className="flex-1 truncate">{p.name}</span>
              {p.codccu && <span className="text-xs text-gray-400">CCU {p.codccu}</span>}
            </label>
          ))}
        </div>

        {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={loading}
          className="mb-3 w-full rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
        >
          {loading ? "Salvando..." : "Confirmar e entrar"}
        </button>
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="w-full text-center text-xs text-gray-400 hover:underline"
        >
          Sair
        </button>
      </form>
    </div>
  );
}
