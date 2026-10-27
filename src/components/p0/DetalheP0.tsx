"use client";

// Gaveta com as linhas do P0 por tras de uma celula (conta x mes): de onde vem o valor previsto. Fecha com Esc ou clicando fora.

import { useEffect, useState } from "react";
import { mesLongo, moeda } from "@/lib/custos/formato";
import { SeloReembolsavel } from "@/components/custos/ui";

export type AlvoP0 = { codccu: string; conta: string; mes: string; valor: number; reembolsavel: boolean; rotulo: string };
type Linhas = { total: number; linhas: { historico: string | null; valor: number }[] };

export default function DetalheP0({ alvo, onFechar }: { alvo: AlvoP0 | null; onFechar: () => void }) {
  const [dados, setDados] = useState<Linhas | "carregando" | "erro">("carregando");

  useEffect(() => {
    if (!alvo) return;
    const controller = new AbortController();
    setDados("carregando");
    const qs = new URLSearchParams({ ccu: alvo.codccu, conta: alvo.conta, mes: alvo.mes });
    fetch(`/api/p0/linhas?${qs.toString()}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        const d = await r.json();
        if (!controller.signal.aborted) setDados(d);
      })
      .catch(() => {
        if (!controller.signal.aborted) setDados("erro");
      });
    return () => controller.abort();
  }, [alvo]);

  useEffect(() => {
    if (!alvo) return;
    const fechar = (e: KeyboardEvent) => {
      if (e.key === "Escape") onFechar();
    };
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [alvo, onFechar]);

  if (!alvo) return null;
  const pronto = dados !== "carregando" && dados !== "erro";
  const bate = pronto ? Math.abs(dados.total - alvo.valor) < 0.02 : null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/35 backdrop-blur-[1.5px]" onClick={onFechar}>
      <aside role="dialog" aria-modal="true" aria-label="Linhas do P0" className="flex h-full w-full max-w-2xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-brand/10 to-transparent px-6 py-4">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              {alvo.rotulo} · previsto em {mesLongo(alvo.mes)}
            </p>
            <h2 className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900">
              {alvo.conta}
              {alvo.reembolsavel && <SeloReembolsavel />}
            </h2>
          </div>
          <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
            ✕
          </button>
        </header>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-100 px-6 py-3">
          <div>
            <p className="text-xs text-gray-500">Valor da célula</p>
            <p className="text-xl font-semibold tabular-nums text-gray-900">{moeda(alvo.valor)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500">Linhas do P0</p>
            <p className="text-xl font-semibold tabular-nums text-gray-900">{pronto ? dados.linhas.length : "—"}</p>
          </div>
          {pronto && bate !== null && (
            <p className={`rounded-full px-2.5 py-1 text-xs font-medium ${bate ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
              {bate ? "✓ a soma das linhas fecha com a célula" : `✗ soma das linhas ${moeda(dados.total)} ≠ célula`}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          {dados === "carregando" && <p className="py-8 text-center text-sm text-gray-500">Carregando as linhas do P0…</p>}
          {dados === "erro" && <p className="py-8 text-center text-sm text-red-600">Não foi possível carregar as linhas do P0.</p>}
          {pronto && dados.linhas.length === 0 && <p className="py-8 text-center text-sm text-gray-500">Nenhuma linha do P0 nesta célula.</p>}
          {pronto && dados.linhas.length > 0 && (
            <table className="w-full text-[14px]">
              <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="border-b border-gray-200 py-2 pr-3">Histórico no P0</th>
                  <th className="border-b border-gray-200 py-2 text-right">Valor</th>
                </tr>
              </thead>
              <tbody>
                {dados.linhas.map((l, i) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 pr-3 text-gray-800">{l.historico || <span className="text-gray-300">sem histórico</span>}</td>
                    <td className="py-2 text-right tabular-nums text-gray-900">{moeda(l.valor)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="py-2 pr-3 text-gray-800">Total</td>
                  <td className="py-2 text-right tabular-nums text-gray-900">{moeda(dados.total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      </aside>
    </div>
  );
}
