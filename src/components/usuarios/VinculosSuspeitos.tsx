"use client";

import { useCallback, useEffect, useState } from "react";

// Painel admin: vinculos usuario Senior -> conta cujo nome nao bate (origem do "lancado por" trocado). Lista e corrige.
type Suspeito = { codigo: string; nomeSenior: string; contaAtual: { name: string; email: string }; proposta: { name: string } | null };

export default function VinculosSuspeitos({ aoCorrigir }: { aoCorrigir?: () => void }) {
  const [lista, setLista] = useState<Suspeito[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/senior/usuarios/vinculos-suspeitos", { cache: "no-store" });
    if (r.ok) setLista((await r.json()).suspeitos);
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  async function corrigir(codigos: string[]) {
    setOcupado(true);
    setMsg(null);
    const r = await fetch("/api/senior/usuarios/vinculos-suspeitos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ codigos }) });
    const d = await r.json().catch(() => ({}));
    setOcupado(false);
    setMsg(r.ok ? `${d.corrigidos} vínculo(s) corrigido(s).` : d.error || "Não foi possível corrigir.");
    await carregar();
    aoCorrigir?.();
  }

  if (!lista || lista.length === 0) return msg ? <p className="mb-4 text-sm text-green-700">{msg}</p> : null;
  return (
    <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-amber-900">{lista.length} vínculo(s) com nome diferente do usuário da Senior</p>
        <button disabled={ocupado} onClick={() => corrigir(lista.map((s) => s.codigo))} className="rounded-lg bg-amber-600 px-3 py-1 text-xs font-medium text-white disabled:opacity-50">Corrigir todos</button>
      </div>
      <p className="mb-3 text-xs text-amber-800">Corrigir troca pela conta de nome igual ao da Senior ou, se não houver, só desfaz o vínculo.</p>
      <table className="w-full text-xs">
        <thead className="text-left text-amber-900"><tr><th className="py-1">Código</th><th>Usuário na Senior</th><th>Conta ligada hoje</th><th>Passa a ser</th><th /></tr></thead>
        <tbody>
          {lista.map((s) => (
            <tr key={s.codigo} className="border-t border-amber-200">
              <td className="py-1.5">{s.codigo}</td><td>{s.nomeSenior}</td><td>{s.contaAtual.name} <span className="text-gray-500">({s.contaAtual.email})</span></td>
              <td>{s.proposta ? s.proposta.name : <span className="text-gray-500">sem vínculo</span>}</td>
              <td className="text-right"><button disabled={ocupado} onClick={() => corrigir([s.codigo])} className="rounded border border-amber-400 px-2 py-0.5 disabled:opacity-50">Corrigir</button></td>
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <p className="mt-2 text-xs text-green-700">{msg}</p>}
    </div>
  );
}
