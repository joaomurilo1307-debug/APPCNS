"use client";

// Grafico da aba P0: SEMPRE previsto (P0) contra realizado (Senior), mes a mes. Mensal = duas colunas por mes (previsto em azul claro, realizado em
// verde; vermelho quando o realizado passou do previsto; mes em andamento mais claro, so' o ja' pago). Acumulado = duas linhas (quanto o P0 previa
// acumular x quanto o Senior ja' realizou). Meses futuros mostram so' o previsto. Nada de media, tendencia ou previsto contra previsto.

import { useState } from "react";
import { acumulado, escalaBonita, variacao } from "@/lib/custos/agregacao";
import { maiusculaInicial, mesCurto, mesLongo, moeda, moedaCompacta, variacaoTexto } from "@/lib/custos/formato";
import { useLargura } from "@/components/custos/graficos";

export const COR_PREVISTO = "#aebfd8";
const COR_PREVISTO_LINHA = "#5b7db1";
const COR_REALIZADO = "#0e9f94";
const COR_ACIMA = "#e5675f";

function eixo(v: number): string {
  if (v === 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
}

export function LegendaPrevistoRealizado({ modo, temRealizado }: { modo: "mensal" | "linha" | "acumulado"; temRealizado: boolean }) {
  const item = (cor: string, texto: string, linha = false) => (
    <span className="inline-flex items-center gap-2 text-[13px] text-gray-600">
      {linha ? <span className="inline-block h-[3px] w-5 rounded" style={{ background: cor }} /> : <span className="inline-block h-3 w-3 rounded-[3px]" style={{ background: cor }} />}
      {texto}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {modo === "mensal" ? item(COR_PREVISTO, "Previsto no P0") : item(COR_PREVISTO_LINHA, modo === "linha" ? "Previsto no P0" : "Previsto no P0 (acumulado)", true)}
      {temRealizado && (modo === "mensal" ? item(COR_REALIZADO, "Realizado no Senior · dentro do previsto") : item(COR_REALIZADO, modo === "linha" ? "Realizado no Senior" : "Realizado no Senior (acumulado)", true))}
      {temRealizado && modo === "mensal" && item(COR_ACIMA, "Realizado · acima do previsto")}
    </div>
  );
}

export default function GraficoPrevistoRealizado({
  meses,
  previsto,
  realizado,
  mesCorrente,
  modo,
  mesDestaque,
  altura = 340,
  onMesClick,
}: {
  meses: string[];
  previsto: number[];
  /** realizado de cada mes; null = sem realizado (mes futuro ou realizado indisponivel) */
  realizado: (number | null)[];
  /** mes em andamento (aaaa-mm): o realizado dele e' parcial */
  mesCorrente: string;
  modo: "mensal" | "linha" | "acumulado";
  mesDestaque?: string;
  altura?: number;
  onMesClick?: (mes: string) => void;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 28, r: 14, b: 32, l: 58 };
  const w = largura;
  const areaW = Math.max(10, w - m.l - m.r);
  const areaH = altura - m.t - m.b;
  const n = meses.length;
  const banda = areaW / Math.max(1, n);
  const iParcial = mesCorrente ? meses.indexOf(mesCorrente) : -1;
  const iDestaque = mesDestaque ? meses.indexOf(mesDestaque) : -1;

  const cumPrev = acumulado(previsto);
  const cumReal: (number | null)[] = (() => {
    let s = 0;
    return realizado.map((v) => (v === null ? null : (s += v)));
  })();
  const serieP = modo === "acumulado" ? cumPrev : previsto;
  const serieR = modo === "acumulado" ? cumReal : realizado;
  const maxV = Math.max(...serieP, ...serieR.map((v) => v ?? 0), 0);
  const { topo, marcas } = escalaBonita(maxV * 1.1);
  const x = (i: number) => m.l + banda * i + banda / 2;
  const y = (v: number) => m.t + areaH - (v / topo) * areaH;
  const passoRotulo = banda < 30 ? 3 : banda < 46 ? 2 : 1;
  const bw = Math.max(4, Math.min(34, banda * 0.4));
  const comRotulos = bw >= 20;
  const ultimoReal = serieR.reduce<number>((u, v, i) => (v !== null ? i : u), -1);

  const caminho = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const tem = serieR.some((v) => v !== null);

  function dica(i: number) {
    const p = serieP[i];
    const r = serieR[i];
    return { mes: meses[i], p, r, d: r !== null ? r - p : null, pct: r !== null && Math.abs(p) > 0.005 ? variacao(r, p) : null, parcial: i === iParcial, mensal: previsto[i], realizadoMes: realizado[i] };
  }
  const tip = hover !== null ? dica(hover) : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: altura }}>
      <svg width={w} height={altura} role="img" aria-label={modo === "mensal" ? "Colunas do previsto no P0 e do realizado no Senior, mês a mês" : modo === "linha" ? "Linhas do previsto no P0 e do realizado no Senior, mês a mês" : "Linhas do previsto e do realizado acumulados"} className="absolute left-0 top-0 block">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#cbd5e1" : "#eef1f4"} strokeWidth={1} />
            <text x={m.l - 10} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#6b7280">
              {eixo(v)}
            </text>
          </g>
        ))}

        {iDestaque >= 0 && hover === null && <rect x={m.l + banda * iDestaque + 1} y={m.t - 10} width={Math.max(1, banda - 2)} height={areaH + 10} rx={6} fill="#eef6f5" />}
        {hover !== null && <rect x={m.l + banda * hover + 1} y={m.t - 10} width={Math.max(1, banda - 2)} height={areaH + 10} rx={6} fill="#f1f5f9" />}

        {modo === "mensal" &&
          meses.map((mes, i) => {
            const p = previsto[i];
            const r = realizado[i];
            const parcial = i === iParcial;
            const acima = r !== null && !parcial && r > p + 0.005;
            const xp = r === null ? x(i) - bw / 2 : x(i) - bw - 1;
            const xr = x(i) + 1;
            return (
              <g key={mes}>
                {p > 0 && <rect x={xp} y={y(p)} width={bw} height={y(0) - y(p)} rx={2} fill={COR_PREVISTO} fillOpacity={r === null ? 0.65 : 1} />}
                {r !== null && r > 0 && (
                  <rect x={xr} y={y(r)} width={bw} height={y(0) - y(r)} rx={2} fill={acima ? COR_ACIMA : COR_REALIZADO} fillOpacity={parcial ? 0.4 : 1} stroke={parcial ? COR_REALIZADO : "none"} strokeDasharray={parcial ? "3 2" : undefined} strokeWidth={parcial ? 1.4 : 0} />
                )}
                {comRotulos && p > 0 && (
                  <text x={xp + bw / 2} y={y(p) - 5} textAnchor="middle" fontSize={11.5} fill="#6b7f9c">
                    {moedaCompacta(p).replace("R$ ", "")}
                  </text>
                )}
                {comRotulos && r !== null && r > 0 && (
                  <text x={xr + bw / 2} y={y(r) - 5} textAnchor="middle" fontSize={12} fontWeight={700} fill={acima ? "#b91c1c" : "#00635b"}>
                    {moedaCompacta(r).replace("R$ ", "")}
                  </text>
                )}
              </g>
            );
          })}

        {modo !== "mensal" && (
          <g>
            {modo === "acumulado" && <path d={`${caminho(serieP.map((v, i) => ({ x: x(i), y: y(v) })))} L${x(n - 1)},${y(0)} L${x(0)},${y(0)} Z`} fill={COR_PREVISTO} fillOpacity={0.18} />}
            {modo === "linha" && tem && ultimoReal > 0 && (
              <path d={`${caminho(serieR.slice(0, ultimoReal + 1).map((v, i) => ({ x: x(i), y: y(v ?? 0) })))} L${x(ultimoReal)},${y(0)} L${x(0)},${y(0)} Z`} fill={COR_REALIZADO} fillOpacity={0.1} />
            )}
            <path d={caminho(serieP.map((v, i) => ({ x: x(i), y: y(v) })))} fill="none" stroke={COR_PREVISTO_LINHA} strokeWidth={2.6} strokeDasharray={modo === "linha" ? "7 4" : undefined} strokeLinejoin="round" strokeLinecap="round" />
            {tem && (
              <>
                <path
                  d={caminho(
                    serieR
                      .map((v, i) => (v === null ? null : { x: x(i), y: y(v) }))
                      .filter((p): p is { x: number; y: number } => p !== null)
                      .slice(0, iParcial >= 0 ? iParcial : undefined)
                  )}
                  fill="none"
                  stroke={COR_REALIZADO}
                  strokeWidth={3.2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
                {iParcial > 0 && serieR[iParcial] !== null && serieR[iParcial - 1] !== null && (
                  <path d={`M${x(iParcial - 1)},${y(serieR[iParcial - 1] as number)} L${x(iParcial)},${y(serieR[iParcial] as number)}`} fill="none" stroke={COR_REALIZADO} strokeWidth={2.6} strokeDasharray="5 4" />
                )}
                {serieR.map((v, i) => (v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={i === ultimoReal ? 5 : 3.6} fill={i === iParcial ? "#fff" : COR_REALIZADO} stroke={i === iParcial ? COR_REALIZADO : "#fff"} strokeWidth={i === iParcial ? 2.4 : 1.6} />))}
                {modo === "acumulado" && ultimoReal >= 0 && (
                  <g>
                    <circle cx={x(ultimoReal)} cy={y(serieP[ultimoReal])} r={4.2} fill={COR_PREVISTO_LINHA} stroke="#fff" strokeWidth={1.6} />
                    <text x={x(ultimoReal) + 10} y={y(serieR[ultimoReal] as number) + 4} fontSize={12.5} fontWeight={700} fill="#00635b">
                      Realizado {moedaCompacta(serieR[ultimoReal] as number)}
                    </text>
                    <text x={x(ultimoReal) + 10} y={y(serieP[ultimoReal]) - 8} fontSize={12.5} fontWeight={700} fill={COR_PREVISTO_LINHA}>
                      Previsto {moedaCompacta(serieP[ultimoReal])}
                    </text>
                  </g>
                )}
                {modo === "linha" &&
                  serieR.map((v, i) =>
                    v === null || !(banda >= 40 || i === ultimoReal || i === iDestaque) ? null : (
                      <text key={i} x={x(i)} y={y(v) - 11} textAnchor="middle" fontSize={12} fontWeight={700} fill="#00635b">
                        {moedaCompacta(v).replace("R$ ", "")}
                      </text>
                    )
                  )}
                {modo === "linha" && serieP.map((v, i) => (v > 0 && (banda >= 40 || i === iDestaque) ? <text key={`p${i}`} x={x(i)} y={y(v) + (serieR[i] !== null && (serieR[i] as number) > v ? 16 : -9)} textAnchor="middle" fontSize={11} fill="#6b7f9c">{moedaCompacta(v).replace("R$ ", "")}</text> : null))}
              </>
            )}
          </g>
        )}

        {meses.map((mes, i) => {
          const destaque = i === iDestaque || i === iParcial;
          return (
            <g key={mes}>
              {(((i % passoRotulo === 0) && !(passoRotulo > 1 && iDestaque >= 0 && i !== iDestaque && Math.abs(i - iDestaque) < passoRotulo)) || i === iDestaque) && (
                <text x={x(i)} y={altura - 11} textAnchor="middle" fontSize={12.5} fontWeight={destaque ? 700 : 500} fill={destaque ? "#00635b" : "#6b7280"}>
                  {mesCurto(mes)}
                  {i === iParcial ? "*" : ""}
                </text>
              )}
              <rect
                x={m.l + banda * i}
                y={0}
                width={banda}
                height={altura}
                fill="transparent"
                style={onMesClick && serieR[i] !== null ? { cursor: "pointer" } : undefined}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((c) => (c === i ? null : c))}
                onClick={onMesClick && realizado[i] !== null ? () => onMesClick(mes) : undefined}
              />
            </g>
          );
        })}
      </svg>

      {tip && hover !== null && (
        <div className="pointer-events-none absolute z-10 w-64 rounded-xl border border-gray-200 bg-white/95 p-3 text-[13px] shadow-elevated backdrop-blur" style={{ left: Math.min(Math.max(8, x(hover) - 128), Math.max(8, w - 272)), top: 2 }}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="font-semibold text-gray-800">{maiusculaInicial(mesLongo(tip.mes))}</span>
            {tip.parcial && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">em andamento</span>}
          </div>
          <ul className="space-y-1 text-gray-600">
            <li className="flex justify-between">
              <span>Previsto no P0{modo === "acumulado" ? " (acum.)" : ""}</span>
              <span className="font-semibold tabular-nums text-gray-900">{moeda(tip.p)}</span>
            </li>
            <li className="flex justify-between">
              <span>Realizado no Senior{modo === "acumulado" ? " (acum.)" : ""}</span>
              <span className="font-semibold tabular-nums text-gray-900">{tip.r !== null ? moeda(tip.r) : <span className="font-normal text-gray-400">ainda não há</span>}</span>
            </li>
            {tip.d !== null && !tip.parcial && (
              <li className="flex justify-between border-t border-gray-100 pt-1">
                <span>Diferença</span>
                <span className={`font-semibold tabular-nums ${tip.d > 0.005 ? "text-red-600" : tip.d < -0.005 ? "text-emerald-700" : "text-gray-500"}`}>
                  {tip.d > 0.005 ? "+" : tip.d < -0.005 ? "−" : ""}
                  {moeda(Math.abs(tip.d))} {tip.pct !== null && <span className="text-xs font-normal">({variacaoTexto(tip.pct)})</span>}
                </span>
              </li>
            )}
            {tip.parcial && <li className="text-xs text-gray-500">Mês em andamento: o realizado é só o que já foi pago.</li>}
          </ul>
        </div>
      )}
    </div>
  );
}
