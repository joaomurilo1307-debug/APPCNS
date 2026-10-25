"use client";

// Projetos ligados a este contrato (Project.codccu): saude, andamento e prazo, para o contrato mostrar tambem o que esta sendo executado nele.
// Usa a mesma lista de Projetos (cada pessoa so' ve os projetos que ja pode ver).
import Link from "next/link";
import { useEffect, useState } from "react";
import ProgressBar from "@/components/ProgressBar";
import SeloSaude, { type SaudeDoProjeto } from "@/components/projetos/SeloSaude";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";

type ProjetoDoContrato = {
  id: string; name: string; status: string; percentComplete: number; overdueCount: number; endDate: string | null;
  owner: { name: string }; contrato?: { codccu: string } | null; saude?: SaudeDoProjeto;
};

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");

export default function ProjetosDoContrato({ codccu }: { codccu: string }) {
  const [lista, setLista] = useState<ProjetoDoContrato[] | null>(null);

  async function carregar() {
    const r = await fetch("/api/projects", { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (r.ok && Array.isArray(d)) setLista((d as ProjetoDoContrato[]).filter((p) => p.contrato?.codccu === codccu));
    else setLista((x) => x ?? []);
  }
  useEffect(() => { void carregar(); }, [codccu]); // eslint-disable-line react-hooks/exhaustive-deps
  useAtualizarAoVoltar(carregar);

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft lg:col-span-2">
      <header className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Projetos deste contrato</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">O que está sendo executado neste contrato, com a saúde de cada projeto. Para ligar um projeto ao contrato, escolha o contrato ao criar o projeto.</p>
        </div>
        <Link href="/projetos" className="text-[13px] font-medium text-brand hover:text-brand-dark">Ver em Projetos →</Link>
      </header>
      {lista === null ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-gray-400">Nenhum projeto ligado a este contrato que você possa ver.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                <th className="py-2 pr-3">Projeto</th><th className="px-3 py-2">Saúde</th><th className="px-3 py-2">Andamento</th><th className="px-3 py-2 text-center">Atrasadas</th><th className="px-3 py-2">Responsável</th><th className="px-3 py-2">Prazo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => (
                <tr key={p.id} className="border-b border-gray-50 hover:bg-gray-50/60">
                  <td className="py-2 pr-3"><Link href={`/projetos/${p.id}`} className="font-medium text-gray-800 hover:text-brand-dark hover:underline">{p.name}</Link></td>
                  <td className="px-3 py-2"><SeloSaude saude={p.saude} /></td>
                  <td className="px-3 py-2"><div className="w-28"><ProgressBar percent={p.percentComplete} size="sm" /></div></td>
                  <td className="px-3 py-2 text-center tabular-nums">{p.overdueCount > 0 ? <span className="rounded-full bg-rose-50 px-2 py-0.5 font-medium text-rose-600">{p.overdueCount}</span> : <span className="text-gray-300">0</span>}</td>
                  <td className="px-3 py-2 text-gray-600">{p.owner.name}</td>
                  <td className="px-3 py-2 tabular-nums text-gray-600">{dataBr(p.endDate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
