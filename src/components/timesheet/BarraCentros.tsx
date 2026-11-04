"use client";

import { useRef } from "react";

// Barra unica de 100% dividida por centro de custo (uma cor por centro). A cor segue o CENTRO, nunca a posicao: enquanto a tela estiver aberta o mesmo
// centro mantem a mesma cor, mesmo quando o ranking muda ao vivo. Centro sem identificacao usa listras (nao e' um centro, e' um alerta).

const PALETA = ["#2563eb", "#0d9488", "#d97706", "#7c3aed", "#db2777", "#65a30d", "#0891b2", "#dc2626", "#4f46e5", "#a16207", "#be185d", "#047857"];
export const SEM_CENTRO_CHAVE = "__sem_cc__";
export const SEM_PROJETO_CHAVE = "__sem_projeto__";

export function useCoresDosCentros() {
  const mapa = useRef(new Map<string, number>());
  return (chave: string): string => {
    if (chave === SEM_CENTRO_CHAVE) return "#475569";
    if (chave === SEM_PROJETO_CHAVE) return "#94a3b8";
    if (!mapa.current.has(chave)) mapa.current.set(chave, mapa.current.size % PALETA.length);
    return PALETA[mapa.current.get(chave)!];
  };
}

export type SegmentoCentro = { chave: string; codccu: string | null; percentual: number; horas: number; identificado: boolean };

export function rotuloDoCentro(c: { chave: string; codccu: string | null }, nomes: Record<string, string>) {
  return c.codccu ? `${c.codccu}${nomes[c.codccu] ? ` · ${nomes[c.codccu]}` : ""}` : c.chave === SEM_PROJETO_CHAVE ? "Tarefas sem projeto" : "Projetos sem centro de custo";
}

const fundo = (cor: string, identificado: boolean) =>
  identificado ? cor : `repeating-linear-gradient(135deg, ${cor} 0 6px, ${cor}99 6px 12px)`;

export default function BarraCentros({
  centros, nomes, cor, altura = 28, legenda = true, vazio = "Sem horas no período.",
}: {
  centros: SegmentoCentro[];
  nomes: Record<string, string>;
  cor: (chave: string) => string;
  altura?: number;
  legenda?: boolean;
  vazio?: string;
}) {
  const total = centros.reduce((s, c) => s + c.percentual, 0);
  const resumo = centros.map((c) => `${rotuloDoCentro(c, nomes)}: ${c.percentual.toFixed(2).replace(".", ",")}%`).join("; ");
  return (
    <div>
      {total <= 0 ? (
        <div className="flex items-center justify-center rounded-full border border-dashed border-gray-300 text-[12px] text-gray-400" style={{ height: altura }}>{vazio}</div>
      ) : (
        <div className="flex w-full overflow-hidden rounded-full bg-gray-100" style={{ height: altura }} role="img" aria-label={`Distribuição por centro de custo — ${resumo}`}>
          {centros.filter((c) => c.percentual > 0).map((c, i, arr) => (
            <div
              key={c.chave}
              title={`${rotuloDoCentro(c, nomes)} — ${c.percentual.toFixed(2).replace(".", ",")}% (${c.horas.toFixed(2).replace(".", ",")} h)`}
              className="flex min-w-[3px] items-center justify-center overflow-hidden text-[11px] font-semibold text-white transition-[flex-basis] duration-700 ease-out"
              style={{ flexBasis: `${c.percentual}%`, flexGrow: 0, flexShrink: 1, background: fundo(cor(c.chave), c.identificado), marginLeft: i === 0 ? 0 : 2, borderRadius: i === 0 ? "9999px 0 0 9999px" : i === arr.length - 1 ? "0 9999px 9999px 0" : 0 }}
            >
              {altura >= 18 && c.percentual >= 9 && <span className="px-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.35)]">{Math.round(c.percentual)}%</span>}
            </div>
          ))}
        </div>
      )}
      {legenda && total > 0 && (
        <ul className="mt-2.5 flex flex-wrap gap-x-5 gap-y-1.5">
          {centros.filter((c) => c.percentual > 0).map((c) => (
            <li key={c.chave} className="flex items-center gap-1.5 text-[12.5px] text-gray-700">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: fundo(cor(c.chave), c.identificado) }} aria-hidden />
              <span className="max-w-[16rem] truncate">{rotuloDoCentro(c, nomes)}</span>
              <span className="tabular-nums text-gray-500">{c.percentual.toFixed(1).replace(".", ",")}%</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
