"use client";

// Contratantes (usuarios CLIENTE) ligados ao contrato: acompanham o andamento e registram demandas no portal do cliente.
import { useEffect, useState } from "react";

type Cliente = { id: string; name: string; email: string };

export default function ClientesDoContrato({ codccu }: { codccu: string }) {
  const [clientes, setClientes] = useState<Cliente[] | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState("");

  const carregar = async () => {
    const r = await fetch(`/api/contratos/${codccu}/clientes`, { cache: "no-store" });
    if (!r.ok) return;
    const j = await r.json();
    setClientes(j.clientes); setPodeEditar(!!j.podeEditar);
  };
  useEffect(() => { void carregar(); }, [codccu]); // eslint-disable-line react-hooks/exhaustive-deps

  async function adicionar(e: React.FormEvent) {
    e.preventDefault(); setMsg("");
    const r = await fetch(`/api/contratos/${codccu}/clientes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(typeof j.error === "string" ? j.error : "Não foi possível adicionar.");
    setEmail(""); await carregar();
  }
  async function remover(id: string) {
    await fetch(`/api/contratos/${codccu}/clientes?userId=${id}`, { method: "DELETE" });
    await carregar();
  }

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft lg:col-span-2">
      <h2 className="text-base font-semibold text-gray-900">Contratante</h2>
      <p className="mb-3 mt-0.5 text-[13px] text-gray-500">Quem acompanha este contrato como cliente: vê o andamento dos projetos e registra demandas no portal do cliente (somente leitura nos projetos).</p>
      {clientes === null ? <div className="h-10 animate-pulse rounded-lg bg-gray-100" /> : clientes.length === 0 ? <p className="text-sm text-gray-400">Nenhum contratante ligado a este contrato.</p> : (
        <ul className="mb-3 divide-y divide-gray-100">
          {clientes.map((c) => <li key={c.id} className="flex items-center gap-3 py-1.5 text-[14px]"><span className="font-medium text-gray-800">{c.name}</span><span className="text-gray-500">{c.email}</span>{podeEditar && <button onClick={() => remover(c.id)} className="ml-auto text-xs text-red-600">remover</button>}</li>)}
        </ul>
      )}
      {podeEditar && (
        <form onSubmit={adicionar} className="flex flex-wrap gap-2">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mail do contratante (usuário com papel Cliente)" className="min-w-[18rem] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          <button className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark">Ligar ao contrato</button>
          {msg && <p className="w-full text-sm text-red-600">{msg}</p>}
        </form>
      )}
    </section>
  );
}
