"use client";

// Graficos de ACOMPANHAMENTO da tela Custo por Centro de Custo: linha mensal (ou acumulada) com media, media movel de 3 meses e
// meta; variacao mensal; ponte (cascata) entre dois meses; e a tabela das maiores altas e quedas. SVG/HTML proprios, fonte
// grande, valores sempre visiveis (rotulo, dica e tabela).

import { useState } from "react";
import { acumulado, mediaDoPeriodo, mediaMovel, variacao, type Movimento, type PassoPonte, escalaBonita } from "@/lib/custos/agregacao";
import { maiusculaInicial, mesCurto, mesLongo, moeda, moedaCompacta, percentual, variacaoTexto } from "@/lib/custos/formato";
import { useLargura } from "./graficos";

const COR_LINHA = "#0e9f94";
const COR_MEDIA = "#64748b";
const COR_MM3 = "#6b4fd0";
const COR_META = "#E63329";
const COR_ALTA = "#e5675f";
const COR_QUEDA = "#0e9f94";

function eixo(v: number): string {
  if (v === 0) return "0";
  if (v >= 1_000_000) return `${(v / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (v >= 1_000) return `${(v / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return v.toLocaleString("pt-BR");
}

// ------------------------------------------------------------------------------------------ linha de acompanhamento

/** Acumulado que preserva os meses sem dado (null): a linha comparada para onde o dado acaba. */
function acumuladoComNulos(valores: ReadonlyArray<number | null>): (number | null)[] {
  let s = 0;
  return valores.map((v) => (v === null ? null : (s += v)));
}

/** Trechos seguidos sem lacuna (null), com o indice do mes e o valor de cada ponto. */
function trechosContinuos(serie: ReadonlyArray<number | null>): { i: number; v: number }[][] {
  const out: { i: number; v: number }[][] = [];
  let atual: { i: number; v: number }[] = [];
  serie.forEach((v, i) => {
    if (v === null) {
      if (atual.length) out.push(atual);
      atual = [];
    } else atual.push({ i, v });
  });
  if (atual.length) out.push(atual);
  return out;
}

export function LinhaAcompanhamento({
  meses,
  valores,
  mesParcial,
  mesDestaque,
  modo,
  mostrarMedia,
  mostrarMediaMovel,
  meta,
  altura = 320,
  rotuloAcessivel = "Linha de acompanhamento do custo mensal",
  rotuloMensal = "Custo no mês",
  rotuloAcumulado = "Acumulado",
  comparacao,
}: {
  meses: string[];
  valores: number[];
  mesParcial?: string;
  mesDestaque?: string;
  modo: "mensal" | "acumulado";
  mostrarMedia: boolean;
  mostrarMediaMovel: boolean;
  meta?: number | null;
  altura?: number;
  rotuloAcessivel?: string;
  rotuloMensal?: string;
  rotuloAcumulado?: string;
  /**
   * Segunda linha para comparar (ex.: o P0 sobre o realizado). `valores` alinhado a `meses`, null onde nao ha dado (a linha para ali);
   * `desvios` (opcional) e' o desvio da linha principal contra esta, por mes, mostrado no balao; `parcialEm` marca o mes em andamento.
   */
  comparacao?: { rotulo: string; cor: string; valores: (number | null)[]; parcialEm?: string; desvios?: (number | null)[]; rotuloDesvio?: string };
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 30, r: 16, b: 34, l: 62 };
  const w = largura;
  const h = altura;
  const areaW = w - m.l - m.r;
  const areaH = h - m.t - m.b;
  const n = meses.length;
  const banda = areaW / Math.max(1, n);
  const iParcial = mesParcial ? meses.indexOf(mesParcial) : -1;
  const temParcial = iParcial >= 0;

  const serie = modo === "acumulado" ? acumulado(valores) : valores;
  const media = modo === "mensal" ? mediaDoPeriodo(valores, temParcial) : null;
  const mm3 = modo === "mensal" && mostrarMediaMovel ? mediaMovel(valores, 3, temParcial) : null;
  const metaSerie = meta && meta > 0 ? (modo === "acumulado" ? valores.map((_, i) => meta * (i + 1)) : valores.map(() => meta)) : null;
  const cmp = comparacao ? (modo === "acumulado" ? acumuladoComNulos(comparacao.valores) : comparacao.valores) : null;
  const iCmpParcial = comparacao?.parcialEm ? meses.indexOf(comparacao.parcialEm) : -1;

  const topoBruto = Math.max(...serie, ...(metaSerie ?? [0]), media ?? 0, ...(mm3 ?? []).map((v) => v ?? 0), ...(cmp ?? []).map((v) => v ?? 0), 0) * 1.08;
  const { topo, marcas } = escalaBonita(topoBruto);
  const x = (i: number) => m.l + banda * i + banda / 2;
  const y = (v: number) => m.t + areaH - (v / topo) * areaH;

  const caminho = (pts: { x: number; y: number }[]) => pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const fechados = temParcial ? serie.slice(0, iParcial) : serie;
  const ptsFechados = fechados.map((v, i) => ({ x: x(i), y: y(v) }));
  const passoRotulo = banda < 46 ? 2 : 1;
  // em grafico denso (rotulo de 2 em 2), o rotulo vizinho do mes em destaque some para nao ficar um em cima do outro
  const iDestaque = mesDestaque ? meses.indexOf(mesDestaque) : -1;
  const vizinhoDoDestaque = (i: number) => passoRotulo > 1 && iDestaque >= 0 && i !== iDestaque && Math.abs(i - iDestaque) < passoRotulo;
  const area = ptsFechados.length > 1 ? `${caminho(ptsFechados)} L${ptsFechados[ptsFechados.length - 1].x},${y(0)} L${ptsFechados[0].x},${y(0)} Z` : "";

  function dica(i: number) {
    const v = valores[i];
    const anterior = i > 0 ? valores[i - 1] : null;
    return {
      mes: meses[i],
      valor: serie[i],
      mensal: v,
      acumulado: modo === "acumulado",
      vsAnterior: anterior !== null && !(temParcial && i === iParcial) ? variacao(v, anterior) : null,
      vsMedia: media && !(temParcial && i === iParcial) ? variacao(v, media) : null,
      vsMeta: metaSerie ? variacao(serie[i], metaSerie[i]) : null,
      metaValor: metaSerie ? metaSerie[i] : null,
      parcial: temParcial && i === iParcial,
      cmpValor: cmp ? cmp[i] : null,
      cmpDesvio: comparacao?.desvios && modo === "mensal" ? comparacao.desvios[i] ?? null : null,
    };
  }
  const tip = hover !== null ? dica(hover) : null;

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: h }}>
      <svg width={w} height={h} role="img" aria-label={rotuloAcessivel} className="absolute left-0 top-0 block">
        {marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#cbd5e1" : "#eef1f4"} strokeWidth={1} />
            <text x={m.l - 10} y={y(v) + 4} textAnchor="end" fontSize={12} fill="#6b7280">
              {eixo(v)}
            </text>
          </g>
        ))}

        {hover !== null && <rect x={m.l + banda * hover + 1} y={m.t - 8} width={banda - 2} height={areaH + 8} rx={6} fill="#f1f5f9" />}
        {mesDestaque && meses.includes(mesDestaque) && hover === null && (
          <rect x={m.l + banda * meses.indexOf(mesDestaque) + 1} y={m.t - 8} width={banda - 2} height={areaH + 8} rx={6} fill="#e6f7f6" />
        )}

        {area && <path d={area} fill={COR_LINHA} fillOpacity={0.1} />}

        {metaSerie && (
          <g>
            <path d={caminho(metaSerie.map((v, i) => ({ x: x(i), y: y(v) })))} fill="none" stroke={COR_META} strokeWidth={2} strokeDasharray="7 5" />
            {modo === "mensal" && (
              <text x={w - m.r - 4} y={y(metaSerie[metaSerie.length - 1]) - 8} textAnchor="end" fontSize={12.5} fontWeight={700} fill={COR_META}>
                Meta {moedaCompacta(meta!)}
              </text>
            )}
          </g>
        )}

        {media !== null && mostrarMedia && (
          <g>
            <line x1={m.l} x2={w - m.r} y1={y(media)} y2={y(media)} stroke={COR_MEDIA} strokeWidth={1.8} strokeDasharray="3 5" />
            <text x={w - m.r - 4} y={y(media) + 17} textAnchor="end" fontSize={12.5} fontWeight={700} fill={COR_MEDIA}>
              Média {moedaCompacta(media)}
            </text>
          </g>
        )}

        {mm3 && (
          <path
            d={mm3
              .map((v, i) => (v === null ? null : { x: x(i), y: y(v) }))
              .filter((p): p is { x: number; y: number } => p !== null)
              .map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)},${p.y.toFixed(1)}`)
              .join(" ")}
            fill="none"
            stroke={COR_MM3}
            strokeWidth={2.2}
            strokeDasharray="9 4 2 4"
          />
        )}

        {cmp && comparacao && (
          <g>
            {trechosContinuos(cmp).map((t, k) =>
              t.length > 1 ? <path key={k} d={caminho(t.map((p) => ({ x: x(p.i), y: y(p.v) })))} fill="none" stroke={comparacao.cor} strokeWidth={2.6} strokeDasharray="7 4" strokeLinejoin="round" strokeLinecap="round" /> : null
            )}
            {cmp.map((v, i) =>
              v === null ? null : <circle key={i} cx={x(i)} cy={y(v)} r={4} fill={i === iCmpParcial ? "#ffffff" : comparacao.cor} stroke={i === iCmpParcial ? comparacao.cor : "#ffffff"} strokeWidth={i === iCmpParcial ? 2.2 : 1.6} />
            )}
          </g>
        )}

        {ptsFechados.length > 1 && <path d={caminho(ptsFechados)} fill="none" stroke={COR_LINHA} strokeWidth={3} strokeLinejoin="round" strokeLinecap="round" />}
        {temParcial && ptsFechados.length > 0 && (
          <path d={`M${ptsFechados[ptsFechados.length - 1].x},${ptsFechados[ptsFechados.length - 1].y} L${x(iParcial)},${y(serie[iParcial])}`} fill="none" stroke={COR_LINHA} strokeWidth={2.4} strokeDasharray="5 5" />
        )}

        {serie.map((v, i) => {
          const parcial = temParcial && i === iParcial;
          const destaque = meses[i] === mesDestaque;
          return (
            <g key={meses[i]}>
              <circle cx={x(i)} cy={y(v)} r={destaque ? 6 : 4.5} fill={parcial ? "#ffffff" : COR_LINHA} stroke={parcial ? COR_LINHA : "#ffffff"} strokeWidth={parcial ? 2.5 : 2} />
              {((i % passoRotulo === 0 && !vizinhoDoDestaque(i)) || destaque || parcial) && (
                <text x={x(i)} y={y(v) - 12} textAnchor="middle" fontSize={12} fontWeight={destaque ? 700 : 600} fill={destaque ? "#00635b" : "#374151"}>
                  {moedaCompacta(v).replace("R$ ", "")}
                </text>
              )}
              {((i % passoRotulo === 0 && !vizinhoDoDestaque(i)) || destaque) && (
                <text x={x(i)} y={h - 11} textAnchor="middle" fontSize={12.5} fontWeight={destaque ? 700 : 500} fill={destaque ? "#00635b" : "#6b7280"}>
                  {mesCurto(meses[i])}
                  {parcial ? "*" : ""}
                </text>
              )}
              <rect x={m.l + banda * i} y={0} width={banda} height={h} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover((c) => (c === i ? null : c))} />
            </g>
          );
        })}
      </svg>

      {tip && hover !== null && (
        <div className="pointer-events-none absolute z-10 w-64 rounded-xl border border-gray-200 bg-white/95 p-3 text-[13px] shadow-elevated backdrop-blur" style={{ left: Math.min(Math.max(8, x(hover) - 128), w - 272), top: 2 }}>
          <div className="mb-1.5 flex items-baseline justify-between gap-2">
            <span className="font-semibold text-gray-800">{maiusculaInicial(mesLongo(tip.mes))}</span>
            {tip.parcial && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">em andamento</span>}
          </div>
          <div className="flex items-baseline justify-between border-b border-gray-100 pb-1.5">
            <span className="text-gray-500">{tip.acumulado ? rotuloAcumulado : rotuloMensal}</span>
            <span className="text-base font-semibold tabular-nums text-gray-900">{moeda(tip.valor)}</span>
          </div>
          <ul className="mt-1.5 space-y-1 text-gray-600">
            {tip.acumulado && (
              <li className="flex justify-between">
                <span>No mês</span>
                <span className="tabular-nums text-gray-800">{moeda(tip.mensal)}</span>
              </li>
            )}
            {tip.vsAnterior !== null && (
              <li className="flex justify-between">
                <span>vs mês anterior</span>
                <span className={`font-medium tabular-nums ${tip.vsAnterior > 0.005 ? "text-red-600" : tip.vsAnterior < -0.005 ? "text-emerald-700" : "text-gray-500"}`}>{variacaoTexto(tip.vsAnterior)}</span>
              </li>
            )}
            {tip.vsMedia !== null && (
              <li className="flex justify-between">
                <span>vs média do período</span>
                <span className={`font-medium tabular-nums ${tip.vsMedia > 0.005 ? "text-red-600" : tip.vsMedia < -0.005 ? "text-emerald-700" : "text-gray-500"}`}>{variacaoTexto(tip.vsMedia)}</span>
              </li>
            )}
            {tip.cmpValor !== null && comparacao && (
              <li className="flex justify-between">
                <span style={{ color: comparacao.cor }}>{comparacao.rotulo}</span>
                <span className="tabular-nums text-gray-800">{moeda(tip.cmpValor)}</span>
              </li>
            )}
            {tip.cmpDesvio !== null && comparacao && (
              <li className="flex justify-between">
                <span>{comparacao.rotuloDesvio ?? `vs ${comparacao.rotulo}`}</span>
                <span className={`font-medium tabular-nums ${tip.cmpDesvio > 0.005 ? "text-red-600" : tip.cmpDesvio < -0.005 ? "text-emerald-700" : "text-gray-500"}`}>{variacaoTexto(tip.cmpDesvio)}</span>
              </li>
            )}
            {tip.metaValor !== null && (
              <li className="flex justify-between">
                <span>Meta</span>
                <span className="tabular-nums text-gray-800">
                  {moeda(tip.metaValor)} {tip.vsMeta !== null && <span className={tip.vsMeta > 0 ? "font-medium text-red-600" : "font-medium text-emerald-700"}>({variacaoTexto(tip.vsMeta)})</span>}
                </span>
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

export function LegendaLinha({
  modo,
  mostrarMedia,
  mostrarMediaMovel,
  temMeta,
  rotuloMensal = "Custo do mês",
  rotuloAcumulado = "Custo acumulado",
  comparacao,
}: {
  modo: "mensal" | "acumulado";
  mostrarMedia: boolean;
  mostrarMediaMovel: boolean;
  temMeta: boolean;
  rotuloMensal?: string;
  rotuloAcumulado?: string;
  comparacao?: { rotulo: string; cor: string };
}) {
  const item = (cor: string, texto: string, tracejado?: string) => (
    <span className="inline-flex items-center gap-2 text-[13px] text-gray-600">
      <svg width="28" height="10" aria-hidden>
        <line x1="0" y1="5" x2="28" y2="5" stroke={cor} strokeWidth="3" strokeDasharray={tracejado} />
      </svg>
      {texto}
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {item(COR_LINHA, modo === "acumulado" ? rotuloAcumulado : rotuloMensal)}
      {modo === "mensal" && mostrarMedia && item(COR_MEDIA, "Média do período (meses fechados)", "3 5")}
      {modo === "mensal" && mostrarMediaMovel && item(COR_MM3, "Média móvel de 3 meses", "9 4 2 4")}
      {temMeta && item(COR_META, modo === "acumulado" ? "Meta acumulada" : "Meta mensal", "7 5")}
      {comparacao && item(comparacao.cor, modo === "acumulado" ? `${comparacao.rotulo} (acumulado)` : comparacao.rotulo, "7 4")}
    </div>
  );
}

// ------------------------------------------------------------------------------------------ variacao mensal

export function BarrasVariacao({
  meses,
  variacoes,
  altura = 170,
  selecionado,
  onSelecionar,
  dicas,
  contra = "o mês anterior",
  dicaClique = "clique para ver as contas que variaram",
  rotuloAlta = "▲ sobe",
  rotuloQueda = "▼ cai",
}: {
  meses: string[];
  variacoes: (number | null)[];
  /** contra o que a variacao e' medida (texto do balao e da acessibilidade) */
  contra?: string;
  dicaClique?: string;
  rotuloAlta?: string;
  rotuloQueda?: string;
  altura?: number;
  /** mes (aaaa-mm) em analise: fica destacado e o painel "O que mudou" mostra as contas que mais variaram */
  selecionado?: string;
  onSelecionar?: (mes: string) => void;
  /** texto extra no balao de cada mes (as contas que mais variaram) */
  dicas?: (string | null)[];
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const m = { t: 22, r: 16, b: 30, l: 62 };
  const w = largura;
  const areaW = w - m.l - m.r;
  const areaH = altura - m.t - m.b;
  const banda = areaW / Math.max(1, meses.length);
  const maxAbs = Math.min(1.2, Math.max(0.25, ...variacoes.map((v) => (v === null ? 0 : Math.abs(v)))));
  const zero = m.t + areaH / 2;
  const escala = (areaH / 2 - 14) / maxAbs;
  const passoRotulo = banda < 46 ? 2 : 1;
  const larg = Math.max(12, Math.min(40, banda * 0.55));

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: altura }}>
      <svg width={w} height={altura} role="img" aria-label={`Variação do custo contra ${contra}`} className="absolute left-0 top-0 block">
        <line x1={m.l} x2={w - m.r} y1={zero} y2={zero} stroke="#cbd5e1" strokeWidth={1.5} />
        <text x={m.l - 10} y={zero + 4} textAnchor="end" fontSize={12} fill="#6b7280">
          0%
        </text>
        <text x={m.l - 10} y={m.t + 6} textAnchor="end" fontSize={11.5} fill="#b45309">
          {rotuloAlta}
        </text>
        <text x={m.l - 10} y={altura - m.b - 2} textAnchor="end" fontSize={11.5} fill="#047857">
          {rotuloQueda}
        </text>
        {variacoes.map((v, i) => {
          const cx = m.l + banda * i + banda / 2;
          const sel = selecionado === meses[i];
          const clicavel = !!onSelecionar && v !== null;
          const faixa = (
            <rect
              x={m.l + banda * i + 1}
              y={m.t - 8}
              width={Math.max(1, banda - 2)}
              height={areaH + 12}
              rx={6}
              fill={sel ? "rgba(14,159,148,0.10)" : "transparent"}
              stroke={sel ? "rgba(14,159,148,0.45)" : "none"}
              style={clicavel ? { cursor: "pointer" } : undefined}
              onClick={clicavel ? () => onSelecionar!(meses[i]) : undefined}
            />
          );
          if (v === null) {
            return (
              <g key={meses[i]}>
                <text x={cx} y={zero - 6} textAnchor="middle" fontSize={12} fill="#9ca3af">
                  —
                </text>
                {(i % passoRotulo === 0) && (
                  <text x={cx} y={altura - 9} textAnchor="middle" fontSize={12.5} fill="#6b7280">
                    {mesCurto(meses[i])}
                  </text>
                )}
              </g>
            );
          }
          const alt = Math.max(2, Math.min(areaH / 2 - 14, Math.abs(v) * escala));
          const sobe = v > 0;
          return (
            <g key={meses[i]}>
              {faixa}
              <title>{`${mesLongo(meses[i])}: ${variacaoTexto(v)} contra ${contra}${dicas?.[i] ? "\n" + dicas[i] : ""}${clicavel ? `\n(${dicaClique})` : ""}`}</title>
              <rect style={{ pointerEvents: "none" }} x={cx - larg / 2} y={sobe ? zero - alt : zero} width={larg} height={alt} rx={3} fill={sobe ? COR_ALTA : COR_QUEDA} />
              <text x={cx} y={sobe ? zero - alt - 5 : zero + alt + 14} textAnchor="middle" fontSize={12} fontWeight={600} fill={sobe ? "#b91c1c" : "#047857"}>
                {sobe ? "+" : "−"}
                {percentual(Math.abs(v), Math.abs(v) < 0.1 ? 1 : 0)}
              </text>
              {(i % passoRotulo === 0) && (
                <text x={cx} y={altura - 9} textAnchor="middle" fontSize={12.5} fill="#6b7280">
                  {mesCurto(meses[i])}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ ponte (cascata)

export function Cascata({
  rotuloInicio,
  valorInicio,
  rotuloFim,
  valorFim,
  passos,
  altura = 330,
}: {
  rotuloInicio: string;
  valorInicio: number;
  rotuloFim: string;
  valorFim: number;
  passos: PassoPonte[];
  altura?: number;
}) {
  const [ref, largura] = useLargura<HTMLDivElement>();
  const m = { t: 30, r: 10, b: 66, l: 10 };
  const w = largura;
  const areaW = w - m.l - m.r;
  const areaH = altura - m.t - m.b;

  type Barra = { nome: string; de: number; ate: number; tipo: "total" | "alta" | "queda"; delta?: number };
  const barras: Barra[] = [{ nome: rotuloInicio, de: 0, ate: valorInicio, tipo: "total" }];
  let atual = valorInicio;
  for (const p of passos) {
    const prox = atual + p.delta;
    barras.push({ nome: p.nome, de: atual, ate: prox, tipo: p.delta >= 0 ? "alta" : "queda", delta: p.delta });
    atual = prox;
  }
  barras.push({ nome: rotuloFim, de: 0, ate: valorFim, tipo: "total" });

  const maximo = Math.max(...barras.map((b) => Math.max(b.de, b.ate)), 1) * 1.1;
  const y = (v: number) => m.t + areaH - (v / maximo) * areaH;
  const banda = areaW / barras.length;
  const larg = Math.max(18, Math.min(70, banda * 0.62));

  const rotulo = (nome: string) => (nome.length > 15 ? nome.slice(0, 14) + "…" : nome);

  return (
    <div ref={ref} className="relative w-full select-none" style={{ height: altura }}>
      <svg width={w} height={altura} role="img" aria-label="Ponte do custo entre dois meses" className="absolute left-0 top-0 block">
        <line x1={m.l} x2={w - m.r} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth={1.5} />
        {barras.map((b, i) => {
          const cx = m.l + banda * i + banda / 2;
          const topo = y(Math.max(b.de, b.ate));
          const base = y(Math.min(b.de, b.ate));
          const alt = Math.max(2, base - topo);
          const cor = b.tipo === "total" ? "#14324A" : b.tipo === "alta" ? COR_ALTA : COR_QUEDA;
          const proxima = barras[i + 1];
          return (
            <g key={`${b.nome}-${i}`}>
              <title>{`${b.nome}: ${b.tipo === "total" ? moeda(b.ate) : `${b.delta! > 0 ? "+" : "−"}${moeda(Math.abs(b.delta!))}`}`}</title>
              <rect x={cx - larg / 2} y={topo} width={larg} height={alt} rx={4} fill={cor} />
              {proxima && <line x1={cx + larg / 2} x2={cx + banda - larg / 2} y1={y(b.ate)} y2={y(b.ate)} stroke="#94a3b8" strokeWidth={1.2} strokeDasharray="3 3" />}
              <text x={cx} y={topo - 7} textAnchor="middle" fontSize={12.5} fontWeight={700} fill={b.tipo === "total" ? "#14324A" : b.tipo === "alta" ? "#b91c1c" : "#047857"}>
                {b.tipo === "total" ? moedaCompacta(b.ate).replace("R$ ", "") : `${b.delta! > 0 ? "+" : "−"}${moedaCompacta(Math.abs(b.delta!)).replace("R$ ", "")}`}
              </text>
              <text x={cx} y={altura - m.b + 18} textAnchor="middle" fontSize={12.5} fontWeight={b.tipo === "total" ? 700 : 500} fill="#4b5563">
                {rotulo(b.nome)}
              </text>
              {b.nome.length > 15 && (
                <title>{b.nome}</title>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------------------------------------ maiores altas e quedas

export function TabelaMovimentos({ titulo, itens, tom, rotuloAnterior, rotuloAtual }: { titulo: string; itens: Movimento[]; tom: "alta" | "queda"; rotuloAnterior: string; rotuloAtual: string }) {
  return (
    <div>
      <h3 className={`mb-2 text-sm font-semibold ${tom === "alta" ? "text-red-700" : "text-emerald-700"}`}>
        {tom === "alta" ? "▲ " : "▼ "}
        {titulo}
      </h3>
      {itens.length === 0 ? (
        <p className="py-4 text-[13px] text-gray-400">Sem movimentos relevantes.</p>
      ) : (
        <table className="w-full text-[13px]">
          <thead className="text-left text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="pb-1.5 font-semibold">Item</th>
              <th className="pb-1.5 text-right font-semibold">{rotuloAnterior}</th>
              <th className="pb-1.5 text-right font-semibold">{rotuloAtual}</th>
              <th className="pb-1.5 text-right font-semibold">Variação</th>
            </tr>
          </thead>
          <tbody>
            {itens.map((m) => (
              <tr key={m.nome} className="border-t border-gray-100">
                <td className="max-w-[14rem] truncate py-1.5 pr-2 text-gray-800" title={m.nome}>
                  {m.nome}
                </td>
                <td className="py-1.5 text-right tabular-nums text-gray-500">{moedaCompacta(m.anterior).replace("R$ ", "")}</td>
                <td className="py-1.5 text-right tabular-nums text-gray-800">{moedaCompacta(m.atual).replace("R$ ", "")}</td>
                <td className={`py-1.5 text-right font-semibold tabular-nums ${tom === "alta" ? "text-red-700" : "text-emerald-700"}`}>
                  {m.delta > 0 ? "+" : "−"}
                  {moedaCompacta(Math.abs(m.delta)).replace("R$ ", "")}
                  {m.pct !== null && <span className="ml-1 text-xs font-normal text-gray-400">({percentual(Math.abs(m.pct), Math.abs(m.pct) < 0.1 ? 1 : 0)})</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
