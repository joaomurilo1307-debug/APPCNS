"use client";

import { useState } from "react";
import Link from "next/link";
import ConsominasLogo from "@/components/ConsominasLogo";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    setLoading(false);
    setSent(true);
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden">
      <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-accent/10 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-brand/15 blur-3xl" />
      <div className="relative w-full max-w-sm rounded-2xl border border-gray-100 bg-white/90 p-8 shadow-xl backdrop-blur">
        <div className="mb-6">
          <ConsominasLogo size={40} />
        </div>

        {sent ? (
          <>
            <h1 className="mb-2 text-lg font-semibold">Verifique seu e-mail</h1>
            <p className="mb-6 text-sm text-gray-500">
              Se <strong>{email}</strong> estiver cadastrado, você vai receber um link pra redefinir sua senha em
              alguns instantes. O link vale por 1 hora.
            </p>
            <Link href="/login" className="text-sm font-medium text-brand-dark hover:underline">
              ← Voltar para o login
            </Link>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <h1 className="mb-2 text-lg font-semibold">Esqueci minha senha</h1>
            <p className="mb-6 text-sm text-gray-500">
              Digite seu e-mail cadastrado e enviaremos um link pra você criar uma nova senha.
            </p>

            <label className="mb-1 block text-sm font-medium">E-mail</label>
            <input
              type="email"
              required
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none"
              placeholder="voce@consominas.com.br"
            />

            <button
              type="submit"
              disabled={loading}
              className="mb-4 w-full rounded-md bg-brand py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60"
            >
              {loading ? "Enviando..." : "Enviar link de redefinição"}
            </button>

            <Link href="/login" className="text-sm font-medium text-gray-500 hover:text-brand-dark">
              ← Voltar para o login
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
