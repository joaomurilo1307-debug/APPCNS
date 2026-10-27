"use client";

import { avisoDoCentro, RESUMO_DO_AVISO, temAviso } from "@/lib/contratos/avisosPorCentro";

const CAIXA = "rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900";

/**
 * Aviso nas telas de centro de custo quando custo e faturamento ficam em centros diferentes (ver avisosPorCentro.ts).
 * Recebe os CCUs que estao a vista; nada aparece para os demais. `resumo` = uma linha so', para telas que listam varios centros.
 */
export default function AvisoCentroDeCusto({ codccus, resumo = false }: { codccus: readonly (string | null | undefined)[]; resumo?: boolean }) {
  if (resumo) {
    if (!temAviso(codccus)) return null;
    return (
      <aside role="note" className={`mb-4 ${CAIXA}`}>
        <span className="font-semibold">Atenção, CCU 210 e 230: </span>{RESUMO_DO_AVISO}
      </aside>
    );
  }
  const avisos = [...new Set(codccus)].flatMap((c) => {
    const aviso = avisoDoCentro(c);
    return c && aviso ? [{ codccu: c, aviso }] : [];
  });
  if (avisos.length === 0) return null;
  return (
    <div className="mb-4 space-y-2">
      {avisos.map(({ codccu, aviso }) => (
        <aside key={codccu} role="note" className={CAIXA}>
          <p className="font-semibold">CCU {codccu} · {aviso.titulo}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {aviso.linhas.map((l) => <li key={l}>{l}</li>)}
          </ul>
        </aside>
      ))}
    </div>
  );
}
