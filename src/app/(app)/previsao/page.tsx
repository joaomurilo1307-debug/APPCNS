"use client";

// Financeiro > Previsao: o que o Senior ja tem programado e previsto, mes a mes, por centro de custo e linha de custo.
// Somente leitura. O realizado (o que ja foi pago) fica em "Custo por Centro de Custo".

import PrevisaoMensal from "@/components/contratos/PrevisaoMensal";

export default function PrevisaoPage() {
  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Previsão</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-500">Quanto precisa em cada mês: o que já está programado (parcelas, títulos e OCs com data) e o que está previsto (recorrentes e previsões do Senior), com a variação de um mês para o outro. Escolha o período, clique num mês e veja o que há nele.</p>
      </header>
      <PrevisaoMensal />
    </div>
  );
}
