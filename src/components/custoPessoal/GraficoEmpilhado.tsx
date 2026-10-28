"use client";

// Barras mes a mes do custo de pessoal, empilhadas por grupo (folha, provisoes, pro-labore). Passar o mouse mostra a composicao do mes; clicar numa barra escolhe o mes.

import { useEffect, useRef, useState } from "react";
import { mesCurto, mesLongo, moeda, moedaCompacta } from "@/lib/custos/formato";
import { GRUPOS_COMPONENTE, type GrupoComponente } from "@/lib/custoPessoal/componentes";

export type PontoEmpilhado = { mes: string } & Record<GrupoComponente, number>;

function useLargura<T extends HTMLElement>(): [React.RefObject<T>, number] {
  const ref = useRef<T>(null);
  const [w, setW] = useState(900);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setW(Math.max(320, el.clientWidth));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w];
}

/** Maior valor do eixo "bonito" (1, 1,5, 2, 2,5, 3, 4, 5, 6, 8 x 10^n) acima do maximo. */
function tetoDoEixo(max: number): number {
  if (max <= 0) return 1;
  const exp = Math.pow(10, Math.floor(Math.log10(max)));
  for (const f of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (f * exp >= max) return f * exp;
  return 10 * exp;
}

export default function GraficoEmpilhado({ pontos, mesSelecionado, onMes, altura = 300 }: { pontos: PontoEmpilhado[]; mesSelecionado?: string | null; onMes?: (mes: string) => void; altura?: number }) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 26, r: 12, b: 30, l: 62 };
  const areaW = Math.max(10, largura - m.l - m.r);
  const areaH = altura - m.t - m.b;
  const n = pontos.length;
  const banda = areaW / Math.max(1, n);
  const larguraBarra = Math.min(64, banda * 0.6);
  const totais = pontos.map((p) => p.folha + p.provisoes + p.prolabore);
  const teto = tetoDoEixo(Math.max(0, ...totais));
  const y = (v: number) => m.t + areaH - (v / teto) * areaH;
  const marcas = [0, 0.25, 0.5, 0.75, 1].map((f) => f * teto);
  const h = hover !== null ? pontos[hover] : null;

  return (
    <div ref={ref} className="relative w-full" onMouseLeave={() => setHover(null)}>
      <svg width={largura} height={altura} role="img" aria-label="Custo de pessoal mês a mês por grupo">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={largura - m.r} y1={y(v)} y2={y(v)} stroke="currentColor" strokeOpacity={v === 0 ? 0.3 : 0.1} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="currentColor" fillOpacity={0.55}>{v === 0 ? "0" : moedaCompacta(v).replace("R$ ", "")}</text>
          </g>
        ))}
        {pontos.map((p, i) => {
          const x0 = m.l + banda * i + (banda - larguraBarra) / 2;
          let base = 0;
          const selecionado = mesSelecionado === p.mes;
          return (
            <g key={p.mes} style={{ cursor: onMes ? "pointer" : undefined }} onMouseEnter={() => setHover(i)} onClick={() => onMes?.(p.mes)}>
              <rect x={m.l + banda * i} y={m.t} width={banda} height={areaH} fill={selecionado ? "#0e9f94" : "transparent"} fillOpacity={selecionado ? 0.08 : 0} />
              {GRUPOS_COMPONENTE.map((g) => {
                const v = p[g.id];
                if (v <= 0) return null;
                const y1 = y(base + v);
                const alt = y(base) - y1;
                base += v;
                return <rect key={g.id} x={x0} y={y1} width={larguraBarra} height={Math.max(0, alt - (alt > 3 ? 1 : 0))} fill={g.cor} rx={alt > 6 ? 2 : 0} opacity={hover === null || hover === i ? 1 : 0.55} />;
              })}
              <text x={x0 + larguraBarra / 2} y={y(totais[i]) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill="currentColor" fillOpacity={0.75}>{moedaCompacta(totais[i]).replace("R$ ", "")}</text>
              <text x={x0 + larguraBarra / 2} y={altura - 10} textAnchor="middle" fontSize={11.5} fontWeight={selecionado ? 700 : 400} fill="currentColor" fillOpacity={selecionado ? 0.9 : 0.6}>{mesCurto(p.mes)}</text>
            </g>
          );
        })}
      </svg>
      {h && hover !== null && (
        <div className="pointer-events-none absolute z-10 rounded-xl border border-gray-200 bg-white px-3 py-2 text-[12.5px] shadow-lg" style={{ left: Math.min(Math.max(8, m.l + banda * hover + banda / 2 - 90), largura - 190), top: 4 }}>
          <p className="mb-1 font-semibold text-gray-900">{mesLongo(h.mes)}</p>
          {GRUPOS_COMPONENTE.filter((g) => h[g.id] > 0).map((g) => (
            <p key={g.id} className="flex items-center justify-between gap-4 text-gray-600">
              <span className="inline-flex items-center gap-1.5"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: g.cor }} />{g.rotulo}</span>
              <span className="tabular-nums text-gray-900">{moeda(h[g.id])}</span>
            </p>
          ))}
          <p className="mt-1 flex justify-between gap-4 border-t border-gray-100 pt-1 font-semibold text-gray-900"><span>Total</span><span className="tabular-nums">{moeda(h.folha + h.provisoes + h.prolabore)}</span></p>
        </div>
      )}
    </div>
  );
}

export function LegendaEmpilhado({ grupos }: { grupos: ReadonlyArray<GrupoComponente> }) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {GRUPOS_COMPONENTE.filter((g) => grupos.includes(g.id)).map((g) => (
        <span key={g.id} className="inline-flex items-center gap-2 text-[13px] text-gray-600"><span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: g.cor }} />{g.rotulo}</span>
      ))}
    </div>
  );
}
