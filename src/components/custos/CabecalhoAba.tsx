"use client";

// Cabecalho de uma "aba" recolhivel das telas de custo (Pagos / semana, Reembolsaveis): fechada por padrao; so' quando a pessoa abre e' que a aba
// carrega os dados. A seta e o titulo inteiro sao o botao.

import type { ReactNode } from "react";

export default function CabecalhoAba({ titulo, descricao, aberta, aoAlternar, direita }: { titulo: string; descricao: string; aberta: boolean; aoAlternar: () => void; direita?: ReactNode }) {
  return (
    <header className={`flex flex-wrap items-start justify-between gap-3 ${aberta ? "mb-4" : ""}`}>
      <button type="button" onClick={aoAlternar} aria-expanded={aberta} className="group flex min-w-0 flex-1 items-start gap-2 text-left">
        <span aria-hidden className={`mt-1 inline-block text-gray-400 transition-transform group-hover:text-gray-600 ${aberta ? "rotate-90" : ""}`}>▸</span>
        <span className="min-w-0">
          <span className="block text-lg font-semibold text-gray-900">{titulo}</span>
          <span className="mt-0.5 block max-w-3xl text-[13.5px] text-gray-500">{descricao}</span>
        </span>
      </button>
      {aberta && direita}
    </header>
  );
}
