"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import ConsominasLogo from "@/components/ConsominasLogo";

export default function ResetSenhaPage({ params }: { params: { token: string } }) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    fetch(`/api/auth/reset-password?token=${encodeURIComponent(params.token)}`)
      .then((r) => r.json())
      .then((d) => {
        setValid(!!d.valid);
        setName(d.name ?? "");
        setChecking(false);
      });
  }, [params.token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha precisa ter pelo menos 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token: params.token, password }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      setError(data?.error ?? "Não foi possível redefinir a senha.");
      return;
    }
    setDone(true);
    setTimeout(() => router.push("/login"), 2500);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-100 bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="mb-6">
          <ConsominasLogo size={40} />
        </div>

        {checking && <p className="text-sm text-gray-500">Verificando link...</p>}

        {!checking && !valid && (
          <>
            <h1 className="mb-2 text-lg font-semibold">Link inválido ou expirado</h1>
            <p className="mb-6 text-sm text-gray-500">
              Esse link de redefinição não é mais válido. Peça um novo link.
            </p>
            <Link href="/esqueci-senha" className="text-sm font-medium text-brand-dark hover:underline">
              Pedir novo link →
            </Link>
          </>
        )}

        {!checking && valid && done && (
          <>
            <h1 className="mb-2 text-lg font-semibold">Senha redefinida!</h1>
            <p className="text-sm text-gray-500">Redirecionando pro login...</p>
          </>
        )}

        {!checking && valid && !done && (
          <form onSubmit={handleSubmit}>
            <h1 className="mb-2 text-lg font-semibold">Nova senha{name ? ` — ${name}` : ""}</h1>
            <p className="mb-6 text-sm text-gray-500">Escolha uma nova senha com pelo menos 8 caracteres.</p>

            <label className="mb-1 block text-sm font-medium">Nova senha</label>
            <input
              type="password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />

            <label className="mb-1 block text-sm font-medium">Confirmar nova senha</label>
            <input
              type="password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
            />

            {error && <p className="mb-4 text-sm text-red-600">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Salvando..." : "Redefinir senha"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
