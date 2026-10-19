"use client";

// Financeiro > Receita e Medicao: contratos com linhas contratadas no Senior, quanto ja foi medido e quanto falta, mes a mes por linha.

import MedicaoLista from "@/components/medicao/MedicaoLista";

export default function MedicaoPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Receita e Medição</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-500">Cada contrato tem, no Senior, as linhas contratadas com seu saldo. Aqui você acompanha quanto foi medido mês a mês em cada linha, o acumulado e o que ainda falta, em valor e em quantidade. Só aparecem os contratos que têm linhas contratadas.</p>
      </header>
      <MedicaoLista />
    </div>
  );
}
