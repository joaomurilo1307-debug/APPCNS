"use client";

// Graficos da tela Custo por Contrato -- SVG/HTML proprios (sem biblioteca), feitos para este dado:
//  * ColunasEmpilhadas: custo mensal por grupo, com mes de referencia, mes parcial hachurado e dica ao passar o mouse;
//  * BarrasRanking: ranking horizontal com participacao e mini-evolucao;
//  * Sparkline: evolucao em miniatura.
// Cor segue o GRUPO (paleta validada para daltonismo em agregacao.ts); numeros sempre visiveis no rotulo/dica/tabela.

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { COR_DEMAIS, escalaBonita } from "@/lib/custos/agregacao";
import { maiusculaInicial, mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";

export function useLargura<T extends HTMLElement>(inicial = 640) {
  const ref = useRef<T>(null);
  const [largura, setLargura] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => setLargura(Math.max(280, Math.round(el.getBoundingClientRect().width)));
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, largura] as const;
}

function moedaEixo(v: number): string {
  if (v === 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
}

// ------------------------------------------------------------------------------------------ colunas empilhadas

export type SerieEmpilhada = { chave: string; nome: string; cor: string; valores: number[] };

export function ColunasEmpilhadas({
  meses,
  series,
  mesDestaque,
  mesParcial,
  altura = 280,
  onMesClick,
}: {
  meses: string[];
  series: SerieEmpilhada[];
  mesDestaque?: string;
  mesParcial?: string;
  altura?: number;
  onMesClick?: (mes: string) => void;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const idHachura = useId().replace(/:/g, "");
  const m = { t: 24, r: 10, b: 30, l: 52 };
  const w = largura;
  const h = altura;
  const areaW = w - m.l - m.r;
  const areaH = h - m.t - m.b;
  const banda = areaW / Math.max(1, meses.length);
  const larguraBarra = Math.max(10, Math.min(58, banda * 0.64));

  const totais = meses.map((_, i) => series.reduce((s, x) => s + (x.valores[i] ?? 0), 0));
  const { topo, marcas } = escalaBonita(Math.max(...totais, 0));
  const y = (v: number) => m.t + areaH - (v / topo) * areaH;
  const passoRotulo = banda < 34 ? 3 : banda < 52 ? 2 : 1;

  const tip = hover !== null ? montarDica(hover) : null;

  function montarDica(i: number) {
    const itens = series
      .map((s) => ({ nome: s.nome, cor: s.cor, valor: s.valores[i] ?? 0 }))
      .filter((x) => x.valor !== 0)
      .sort((a, b) => b.valor - a.valor);
    return { mes: meses[i], total: totais[i], itens };
  }

  const xCentro = (i: number) => m.l + banda * i + banda / 2;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: h }}>
      <svg width={w} height={h} role="img" aria-label="Custo mensal empilhado por grupo de contas" className="absolute left-0 top-0 block">
        <defs>
          <pattern id={`h${idHachura}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="#ffffff" fillOpacity="0.0" />
            <line x1="0" y1="0" x2="0" y2="6" stroke="#ffffff" strokeWidth="2.6" strokeOpacity="0.55" />
          </pattern>
        </defs>

        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#cbd5e1" : "#eef1f4"} strokeWidth={1} />
            <text x={m.l - 8} y={y(v) + 3.5} textAnchor="end" fontSize={12} fill="#6b7280">
              {moedaEixo(v)}
            </text>
          </g>
        ))}

        {meses.map((mes, i) => {
          const x = m.l + banda * i + (banda - larguraBarra) / 2;
          const ehDestaque = mes === mesDestaque;
          const parcial = mes === mesParcial;
          let acumulado = 0;
          const visiveis = series.filter((s) => (s.valores[i] ?? 0) > 0);
          return (
            <g key={mes}>
              {ehDestaque && <rect x={m.l + banda * i + 2} y={m.t - 6} width={banda - 4} height={areaH + 6} rx={6} fill="#e6f7f6" />}
              {hover === i && !ehDestaque && <rect x={m.l + banda * i + 2} y={m.t - 6} width={banda - 4} height={areaH + 6} rx={6} fill="#f3f5f7" />}
              {visiveis.map((s, k) => {
                const v = s.valores[i];
                const yTopo = y(acumulado + v);
                const yBase = y(acumulado);
                const alt = Math.max(0, yBase - yTopo);
                acumulado += v;
                const ultimo = k === visiveis.length - 1;
                const r = Math.min(4, alt / 2);
                const caminho = ultimo
                  ? `M${x},${yBase} L${x},${yTopo + r} Q${x},${yTopo} ${x + r},${yTopo} L${x + larguraBarra - r},${yTopo} Q${x + larguraBarra},${yTopo} ${x + larguraBarra},${yTopo + r} L${x + larguraBarra},${yBase} Z`
                  : `M${x},${yBase} L${x},${yTopo} L${x + larguraBarra},${yTopo} L${x + larguraBarra},${yBase} Z`;
                return (
                  <g key={s.chave}>
                    <path d={caminho} fill={s.cor} stroke="#ffffff" strokeWidth={1.5} />
                    {parcial && <path d={caminho} fill={`url(#h${idHachura})`} />}
                  </g>
                );
              })}
              {(passoRotulo === 1 || i % passoRotulo === 0 || ehDestaque) && totais[i] > 0 && (
                <text x={xCentro(i)} y={y(totais[i]) - 7} textAnchor="middle" fontSize={12} fontWeight={ehDestaque ? 700 : 500} fill={ehDestaque ? "#00635b" : "#4b5563"}>
                  {moedaCompacta(totais[i]).replace("R$ ", "")}
                </text>
              )}
              {(i % passoRotulo === 0 || ehDestaque) && (
                <text x={xCentro(i)} y={h - 10} textAnchor="middle" fontSize={12.5} fontWeight={ehDestaque ? 700 : 500} fill={ehDestaque ? "#00635b" : "#6b7280"}>
                  {mesCurto(mes)}
                  {parcial ? "*" : ""}
                </text>
              )}
              <rect
                x={m.l + banda * i}
                y={0}
                width={banda}
                height={h}
                fill="transparent"
                style={{ cursor: onMesClick ? "pointer" : "default" }}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover((c) => (c === i ? null : c))}
                onClick={() => onMesClick?.(mes)}
              />
            </g>
          );
        })}
      </svg>

      {tip && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 w-64 rounded-xl border border-gray-200 bg-white/95 p-3 text-[13px] shadow-elevated backdrop-blur"
          style={{ left: Math.min(Math.max(8, xCentro(hover) - 120), w - 248), top: 4 }}
        >
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="font-semibold text-gray-800">{maiusculaInicial(mesLongo(tip.mes))}</span>
            {tip.mes === mesParcial && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">em andamento</span>}
          </div>
          <div className="mb-1.5 flex items-baseline justify-between border-b border-gray-100 pb-1.5">
            <span className="text-gray-500">Total</span>
            <span className="text-sm font-semibold tabular-nums text-gray-900">{moeda(tip.total)}</span>
          </div>
          <ul className="space-y-1">
            {tip.itens.slice(0, 7).map((it) => (
              <li key={it.nome} className="flex items-center justify-between gap-2">
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: it.cor }} />
                  <span className="truncate text-gray-600">{it.nome}</span>
                </span>
                <span className="shrink-0 tabular-nums text-gray-800">{moeda(it.valor)}</span>
              </li>
            ))}
            {tip.itens.length > 7 && <li className="text-gray-400">+ {tip.itens.length - 7} grupos menores</li>}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LegendaGrupos({
  itens,
  ocultos,
  onAlternar,
}: {
  itens: { chave: string; nome: string; cor: string; total: number }[];
  ocultos: Set<string>;
  onAlternar: (chave: string) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {itens.map((it) => {
        const off = ocultos.has(it.chave);
        return (
          <button
            key={it.chave}
            type="button"
            onClick={() => onAlternar(it.chave)}
            title={off ? "Mostrar no gráfico" : "Ocultar do gráfico"}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium transition ${
              off ? "border-gray-200 bg-white text-gray-400" : "border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50"
            }`}
          >
            <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: off ? "#d1d5db" : it.cor }} />
            <span className={off ? "line-through" : ""}>{it.nome}</span>
          </button>
        );
      })}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ sparkline

export function Sparkline({ valores, cor = "#0e9f94", largura = 84, altura = 24 }: { valores: number[]; cor?: string; largura?: number; altura?: number }) {
  const max = Math.max(...valores, 0);
  if (valores.length < 2 || max <= 0) return <span className="inline-block text-xs text-gray-300">—</span>;
  const pad = 3;
  const xs = valores.map((_, i) => pad + (i * (largura - pad * 2)) / (valores.length - 1));
  const ys = valores.map((v) => altura - pad - (v / max) * (altura - pad * 2));
  const pontos = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const ultimo = valores.length - 1;
  return (
    <svg width={largura} height={altura} aria-hidden className="block">
      <polyline points={`${pad},${altura - pad} ${pontos} ${xs[ultimo]},${altura - pad}`} fill={cor} fillOpacity={0.12} stroke="none" />
      <polyline points={pontos} fill="none" stroke={cor} strokeWidth={1.6} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={xs[ultimo]} cy={ys[ultimo]} r={2.6} fill={cor} stroke="#fff" strokeWidth={1.2} />
    </svg>
  );
}

// ------------------------------------------------------------------------------------------ ranking

export type ItemRanking = { chave: string; rotulo: string; subrotulo?: string; valor: number; cor: string; serie?: number[]; selo?: ReactNode };

export function BarrasRanking({
  itens,
  total,
  onClick,
  vazio = "Sem dados no período.",
}: {
  itens: ItemRanking[];
  total: number;
  onClick?: (chave: string) => void;
  vazio?: string;
}) {
  const max = Math.max(...itens.map((i) => i.valor), 0);
  if (itens.length === 0) return <p className="py-6 text-center text-sm text-gray-400">{vazio}</p>;
  return (
    <ul className="space-y-0.5">
      {itens.map((it) => {
        const pct = total > 0 ? it.valor / total : 0;
        const conteudo = (
          <>
            <div className="flex items-baseline justify-between gap-3">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium text-gray-800" title={it.rotulo}>
                  {it.rotulo}
                </span>
                {it.selo}
              </span>
              <span className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-sm font-semibold text-gray-900">{moedaCompacta(it.valor)}</span>
                <span className="w-10 text-right text-xs text-gray-400">{percentual(pct, pct < 0.1 ? 1 : 0)}</span>
              </span>
            </div>
            <div className="mt-0.5 flex items-center gap-3">
              <div className="h-2.5 flex-1 overflow-hidden rounded-r-[4px] rounded-l-[2px] bg-gray-100">
                <div className="h-full rounded-r-[4px]" style={{ width: `${max > 0 ? Math.max(1.5, (it.valor / max) * 100) : 0}%`, background: it.cor }} />
              </div>
              {it.serie && <Sparkline valores={it.serie} cor={it.cor} largura={72} altura={20} />}
            </div>
            {it.subrotulo && <p className="truncate text-xs leading-4 text-gray-500">{it.subrotulo}</p>}
          </>
        );
        return (
          <li key={it.chave}>
            {onClick ? (
              <button type="button" onClick={() => onClick(it.chave)} className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-50">
                {conteudo}
              </button>
            ) : (
              <div className="px-2 py-1.5">{conteudo}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------ mapa de calor (celulas da tabela)

/** Fundo/texto de uma celula de valor pela intensidade (0..1), rampa de um tom so' (teal da marca). */
export function estiloCelulaCalor(valor: number, max: number): { background?: string; color?: string } {
  if (valor <= 0 || max <= 0) return {};
  const t = Math.pow(Math.min(1, valor / max), 0.7);
  const alpha = 0.07 + t * 0.78;
  return { background: `rgba(0, 150, 140, ${alpha.toFixed(3)})`, color: alpha > 0.52 ? "#ffffff" : undefined };
}

export { COR_DEMAIS };
