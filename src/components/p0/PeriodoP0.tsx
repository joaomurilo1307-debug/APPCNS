"use client";

// Periodo de analise da aba P0 (igual ao da aba Custos): vale para TODOS os graficos e tabelas. De/ate pelos meses do P0 e atalhos
// (mes atual, ultimos 3 e 6 meses, P0 inteiro).

import { mesLongo } from "@/lib/custos/formato";

export default function PeriodoP0({ meses, de, ate, mesCorrente, onMudar }: { meses: string[]; de: string; ate: string; mesCorrente: string; onMudar: (de: string, ate: string) => void }) {
  const n = meses.length;
  // ancora dos atalhos: o mes corrente, limitado ao periodo do P0
  const iAncora = !mesCorrente || mesCorrente < meses[0] ? 0 : mesCorrente > meses[n - 1] ? n - 1 : meses.indexOf(mesCorrente);
  const ultimos = (k: number) => onMudar(meses[Math.max(0, iAncora - (k - 1))], meses[iAncora]);
  const ativo = (a: string, b: string) => de === a && ate === b;
  const pill = (rotulo: string, a: string, b: string, acao: () => void) => (
    <button key={rotulo} type="button" onClick={acao} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${ativo(a, b) ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
      {rotulo}
    </button>
  );
  const rotuloMes = (m: string) => mesLongo(m).replace(" de ", " ");
  const seletor = (valor: string, aoMudar: (m: string) => void, rotulo: string) => (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13.5px] focus:border-brand focus:outline-none">
      {meses.map((m) => (
        <option key={m} value={m}>
          {rotuloMes(m)}
        </option>
      ))}
    </select>
  );
  return (
    <section className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-soft" aria-label="Período de análise">
      <div>
        <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Período de análise</p>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
          {seletor(de, (m) => onMudar(m, ate < m ? m : ate), "Mês inicial")}
          até
          {seletor(ate, (m) => onMudar(de > m ? m : de, m), "Mês final")}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pill("Mês atual", meses[iAncora], meses[iAncora], () => ultimos(1))}
        {pill("Últimos 3 meses", meses[Math.max(0, iAncora - 2)], meses[iAncora], () => ultimos(3))}
        {pill("Últimos 6 meses", meses[Math.max(0, iAncora - 5)], meses[iAncora], () => ultimos(6))}
        {pill("Todo o P0", meses[0], meses[n - 1], () => onMudar(meses[0], meses[n - 1]))}
      </div>
    </section>
  );
}
