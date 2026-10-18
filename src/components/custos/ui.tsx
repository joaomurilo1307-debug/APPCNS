"use client";

import type { ReactNode } from "react";
import { variacaoTexto } from "@/lib/custos/formato";

export function Cartao({ titulo, subtitulo, acao, children, className = "" }: { titulo?: string; subtitulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-gray-100 bg-white p-5 shadow-soft ${className}`}>
      {(titulo || acao) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            {titulo && <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>}
            {subtitulo && <p className="mt-0.5 text-xs text-gray-500">{subtitulo}</p>}
          </div>
          {acao}
        </header>
      )}
      {children}
    </section>
  );
}

export function Kpi({ rotulo, valor, detalhe, destaque }: { rotulo: string; valor: ReactNode; detalhe?: ReactNode; destaque?: boolean }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-4 shadow-soft ${destaque ? "border-brand/30 bg-brand-light/60" : "border-gray-100 bg-white"}`}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-gray-500">{rotulo}</p>
      <p className="mt-1 truncate text-2xl font-semibold tabular-nums tracking-tight text-gray-900">{valor}</p>
      {detalhe && <div className="mt-1 text-xs text-gray-500">{detalhe}</div>}
    </div>
  );
}

/** Variacao de custo: subiu = vermelho, caiu = verde, estavel = cinza. Sempre com seta/sinal (nao depende so' da cor). */
export function Variacao({ v, sufixo }: { v: number | null; sufixo?: string }) {
  const cor = v === null || Math.abs(v) < 0.005 ? "text-gray-500" : v > 0 ? "text-red-600" : "text-emerald-700";
  return (
    <span className={`font-medium tabular-nums ${cor}`}>
      {variacaoTexto(v)}
      {sufixo && v !== null && <span className="ml-1 font-normal text-gray-400">{sufixo}</span>}
    </span>
  );
}

export function SeloReembolsavel({ curto = false }: { curto?: boolean }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold text-sky-800" title="Conta reembolsável (conta antiga “Despesas Reembolsáveis” ou plano novo “R - …”)">
      {curto ? "R" : "Reembolsável"}
    </span>
  );
}

export function SeloInativa() {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800" title="Conta marcada como inativa no plano de contas do Senior (ainda tem lançamento no período)">
      inativa no Senior
    </span>
  );
}

export function VazioPeriodo({ texto = "Sem custo neste período com os filtros escolhidos." }: { texto?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-12 text-center">
      <p className="text-sm font-medium text-gray-700">{texto}</p>
      <p className="mt-1 text-xs text-gray-400">Amplie o período ou limpe os filtros para ver mais.</p>
    </div>
  );
}
