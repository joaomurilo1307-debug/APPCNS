"use client";

// Seletor de periodo por mes: atalhos prontos + mes inicial e final livres. Usado na Previsao (olha para frente) e no Ao vivo (olha para tras).

import { somaMeses } from "@/lib/contratos/previsao";

type Atalho = { rotulo: string; de: string; ate: string };

export function atalhosDePeriodo(modo: "futuro" | "passado", mesAtual: string): Atalho[] {
  const ano = mesAtual.slice(0, 4);
  if (modo === "futuro") {
    return [
      { rotulo: "Este mês", de: mesAtual, ate: mesAtual },
      { rotulo: "Próximos 3 meses", de: mesAtual, ate: somaMeses(mesAtual, 2) },
      { rotulo: "Próximos 6 meses", de: mesAtual, ate: somaMeses(mesAtual, 5) },
      { rotulo: "Próximos 12 meses", de: mesAtual, ate: somaMeses(mesAtual, 11) },
      { rotulo: `Até dez/${ano.slice(2)}`, de: mesAtual, ate: `${ano}-12` },
    ];
  }
  return [
    { rotulo: "Este mês", de: mesAtual, ate: mesAtual },
    { rotulo: "Últimos 3 meses", de: somaMeses(mesAtual, -2), ate: mesAtual },
    { rotulo: "Últimos 6 meses", de: somaMeses(mesAtual, -5), ate: mesAtual },
    { rotulo: `Ano ${ano}`, de: `${ano}-01`, ate: mesAtual },
  ];
}

export default function SeletorPeriodo({ de, ate, mesAtual, modo, onMudar }: { de: string; ate: string; mesAtual: string; modo: "futuro" | "passado"; onMudar: (de: string, ate: string) => void }) {
  const atalhos = atalhosDePeriodo(modo, mesAtual);
  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Período">
      <div className="flex flex-wrap gap-1.5">
        {atalhos.map((a) => {
          const ativo = a.de === de && a.ate === ate;
          return (
            <button key={a.rotulo} type="button" onClick={() => onMudar(a.de, a.ate)}
              className={`rounded-lg border px-3 py-1.5 text-[13px] transition ${ativo ? "border-brand bg-brand/10 font-semibold text-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              {a.rotulo}
            </button>
          );
        })}
      </div>
      <span className="ml-1 flex items-center gap-1.5 text-[13px] text-gray-500">
        De
        <input type="month" value={de} max={ate} onChange={(e) => e.target.value && onMudar(e.target.value, ate < e.target.value ? e.target.value : ate)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] text-gray-800" aria-label="Mês inicial" />
        até
        <input type="month" value={ate} min={de} onChange={(e) => e.target.value && onMudar(de > e.target.value ? e.target.value : de, e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] text-gray-800" aria-label="Mês final" />
      </span>
    </div>
  );
}
