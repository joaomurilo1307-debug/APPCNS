"use client";

// Graficos do Resultado Operacional -- SVG/HTML proprios (sem biblioteca), no mesmo estilo da tela de custos. Cores com papel fixo: teal = receita/resultado positivo,
// laranja = custos, azul = pessoal, ambar = retencoes, vermelho = prejuizo. Numeros sempre acessiveis na dica, no rotulo ou na tabela.

import { useId, useState } from "react";
import { escalaBonita } from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { useLargura } from "@/components/custos/graficos";

export const COR = { receita: "#0e9f94", custo: "#eb6834", pessoal: "#2a78d6", retencao: "#eda100", negativo: "#d92d20", tinta: "#1f2937", suave: "#9aa5b1" } as const;

const abreviado = (v: number) => {
  const a = Math.abs(v), s = v < 0 ? "-" : "";
  if (a >= 1_000_000) return `${s}${(a / 1_000_000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${s}${(a / 1_000).toLocaleString("pt-BR", { maximumFractionDigits: 0 })} mil`;
  return `${s}${a.toLocaleString("pt-BR", { maximumFractionDigits: 0 })}`;
};

/** Escala com negativos: devolve o dominio [min, max] e as marcas (sempre com o zero), com o mesmo passo para cima e para baixo. */
function escalaComNegativos(min: number, max: number, ticks = 4) {
  const base = escalaBonita(Math.max(max, -min, 0.0001), ticks);
  const passo = base.marcas.length > 1 ? base.marcas[1] - base.marcas[0] : 1;
  const nPos = max > 0 ? Math.ceil(max / passo - 1e-9) : 0;
  const nNeg = min < 0 ? Math.ceil(-min / passo - 1e-9) : 0;
  const marcas: number[] = [];
  for (let i = -nNeg; i <= Math.max(nPos, 1); i++) marcas.push(Math.round(i * passo * 1e6) / 1e6);
  return { min: -nNeg * passo, max: Math.max(nPos, 1) * passo, marcas };
}

// ------------------------------------------------------------------------------------------------ ponte (cascata) do resultado

/** Rotulo em ate 2 linhas (quebra no espaco mais proximo do meio) para nao cortar nem sobrepor os vizinhos. */
function quebrar(rotulo: string): string[] {
  const palavras = rotulo.split(" ");
  if (rotulo.length <= 11 || palavras.length < 2) return [rotulo];
  let melhor = 1, dif = Infinity;
  for (let i = 1; i < palavras.length; i++) {
    const d = Math.abs(palavras.slice(0, i).join(" ").length - palavras.slice(i).join(" ").length);
    if (d < dif) { dif = d; melhor = i; }
  }
  return [palavras.slice(0, melhor).join(" "), palavras.slice(melhor).join(" ")];
}

export type PassoPonte = { rotulo: string; valor: number; tipo: "total" | "menos" | "subtotal"; cor?: string; dica?: string };

export function PonteDoResultado({ passos, altura = 300 }: { passos: PassoPonte[]; altura?: number }) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 30, r: 12, b: 56, l: 52 };
  const h = altura;
  const areaW = w - m.l - m.r, areaH = h - m.t - m.b;
  // acumulado: cada passo "menos" desce do nivel anterior; total/subtotal apoiam no zero
  let nivel = 0;
  const barras = passos.map((p) => {
    if (p.tipo === "menos") {
      const de = nivel, ate = nivel - Math.abs(p.valor);
      nivel = ate;
      return { ...p, topo: de, base: ate, fim: ate };
    }
    nivel = p.valor;
    return { ...p, topo: Math.max(p.valor, 0), base: Math.min(p.valor, 0), fim: p.valor };
  });
  const max = Math.max(...barras.map((b) => b.topo), 0.0001), min = Math.min(...barras.map((b) => b.base), 0);
  const esc = escalaComNegativos(min, max);
  const y = (v: number) => m.t + areaH - ((v - esc.min) / (esc.max - esc.min || 1)) * areaH;
  const passoX = areaW / Math.max(1, barras.length);
  const larg = Math.min(64, passoX * 0.6);
  const corDe = (b: (typeof barras)[number]) => b.cor ?? (b.tipo === "menos" ? COR.custo : b.valor < 0 ? COR.negativo : COR.receita);
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={h} role="img" aria-label={`Ponte do resultado: ${passos.map((p) => `${p.rotulo} ${moeda(p.valor)}`).join("; ")}`}>
        {esc.marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#6b7280" : "#e5e7eb"} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{abreviado(v)}</text>
          </g>
        ))}
        {barras.map((b, i) => {
          const cx = m.l + passoX * i + passoX / 2;
          const yt = y(b.topo), yb = y(b.base);
          const prox = barras[i + 1];
          return (
            <g key={b.rotulo} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} opacity={hover === null || hover === i ? 1 : 0.55}>
              <rect x={cx - larg / 2} y={yt} width={larg} height={Math.max(2, yb - yt)} rx={4} fill={corDe(b)} />
              {prox && <line x1={cx + larg / 2} x2={cx + passoX - larg / 2} y1={y(b.fim)} y2={y(b.fim)} stroke="#9ca3af" strokeDasharray="3 3" />}
              <text x={cx} y={(b.tipo === "menos" ? yt : b.valor >= 0 ? yt : yb) + (b.tipo === "menos" || b.valor >= 0 ? -8 : 15)} textAnchor="middle" fontSize={12} fontWeight={600} fill={COR.tinta}>
                {b.tipo === "menos" ? "−" : ""}{abreviado(Math.abs(b.valor))}
              </text>
              {quebrar(b.rotulo).map((linha, k) => <text key={k} x={cx} y={h - m.b + 16 + k * 14} textAnchor="middle" fontSize={11.5} fill="#4b5563">{linha}</text>)}
              <rect x={cx - passoX / 2} y={m.t} width={passoX} height={areaH} fill="transparent" />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute left-1/2 top-1 -translate-x-1/2 rounded-lg bg-gray-900/95 px-3 py-1.5 text-xs text-white shadow-lg">
          <b>{passos[hover].rotulo}</b>: {moeda(passos[hover].valor)}{passos[hover].dica ? ` · ${passos[hover].dica}` : ""}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ barras mensais + linha do resultado

export type PontoMensal = { mes: string; receita: number; custo: number; pessoal: number; resultado: number; margem: number | null };

export function BarrasMensais({ pontos, mesParcial, altura = 320, onMes, mesDestaque }: { pontos: PontoMensal[]; mesParcial?: string; altura?: number; onMes?: (mes: string) => void; mesDestaque?: string }) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const idH = useId().replace(/:/g, "");
  const m = { t: 26, r: 14, b: 32, l: 56 };
  const h = altura, areaW = w - m.l - m.r, areaH = h - m.t - m.b;
  const max = Math.max(0.0001, ...pontos.flatMap((p) => [p.receita, p.custo + p.pessoal, p.resultado]));
  const min = Math.min(0, ...pontos.map((p) => p.resultado));
  const esc = escalaComNegativos(min, max);
  const y = (v: number) => m.t + areaH - ((v - esc.min) / (esc.max - esc.min || 1)) * areaH;
  const passo = areaW / Math.max(1, pontos.length);
  const larg = Math.max(6, Math.min(26, passo * 0.34));
  const linha = pontos.map((p, i) => `${i ? "L" : "M"}${m.l + passo * i + passo / 2},${y(p.resultado)}`).join(" ");
  const cada = pontos.length > 14 ? Math.ceil(pontos.length / 12) : 1;
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={h} role="img" aria-label="Receita, custos e resultado mês a mês">
        <defs>
          <pattern id={idH} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="3" height="6" fill="rgba(255,255,255,.55)" /></pattern>
        </defs>
        {esc.marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#6b7280" : "#eceff3"} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={m.l - 8} y={y(v) + 4} textAnchor="end" fontSize={11} fill="#6b7280">{abreviado(v)}</text>
          </g>
        ))}
        {pontos.map((p, i) => {
          const cx = m.l + passo * i + passo / 2;
          const parcial = p.mes === mesParcial;
          const ativo = hover === i || mesDestaque === p.mes;
          const yPessoalTopo = y(p.custo + p.pessoal), yCustoTopo = y(p.custo), y0 = y(0);
          return (
            <g key={p.mes} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => onMes?.(p.mes)} style={{ cursor: onMes ? "pointer" : "default" }} opacity={hover === null || ativo ? 1 : 0.6}>
              {ativo && <rect x={cx - passo / 2} y={m.t} width={passo} height={areaH} fill="#f3f4f6" />}
              <rect x={cx - larg - 1} y={y(p.receita)} width={larg} height={Math.max(0, y0 - y(p.receita))} rx={3} fill={COR.receita} />
              {parcial && <rect x={cx - larg - 1} y={y(p.receita)} width={larg} height={Math.max(0, y0 - y(p.receita))} rx={3} fill={`url(#${idH})`} />}
              <rect x={cx + 1} y={yCustoTopo} width={larg} height={Math.max(0, y0 - yCustoTopo)} rx={p.pessoal > 0 ? 0 : 3} fill={COR.custo} />
              {p.pessoal > 0 && <rect x={cx + 1} y={yPessoalTopo} width={larg} height={Math.max(0, yCustoTopo - yPessoalTopo)} rx={3} fill={COR.pessoal} />}
              {parcial && <rect x={cx + 1} y={yPessoalTopo} width={larg} height={Math.max(0, y0 - yPessoalTopo)} rx={3} fill={`url(#${idH})`} />}
              {i % cada === 0 && <text x={cx} y={h - 10} textAnchor="middle" fontSize={11} fill={ativo ? COR.tinta : "#6b7280"} fontWeight={ativo ? 600 : 400}>{mesCurto(p.mes)}{parcial ? "*" : ""}</text>}
              <rect x={cx - passo / 2} y={m.t} width={passo} height={areaH} fill="transparent" />
            </g>
          );
        })}
        <path d={linha} fill="none" stroke={COR.tinta} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />
        {pontos.map((p, i) => <circle key={p.mes} cx={m.l + passo * i + passo / 2} cy={y(p.resultado)} r={hover === i ? 5 : 3.4} fill={p.resultado < 0 ? COR.negativo : "#fff"} stroke={p.resultado < 0 ? COR.negativo : COR.tinta} strokeWidth={2} />)}
      </svg>
      {hover !== null && (
        <div className="pointer-events-none absolute top-1 z-10 w-56 rounded-xl bg-gray-900/95 p-3 text-xs text-white shadow-xl" style={{ left: Math.min(Math.max(m.l + passo * hover - 70, 4), Math.max(4, w - 232)) }}>
          <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-300">{mesLongo(pontos[hover].mes)}{pontos[hover].mes === mesParcial ? " (em andamento)" : ""}</p>
          <Linha cor={COR.receita} rotulo="Receita" valor={moeda(pontos[hover].receita)} />
          <Linha cor={COR.custo} rotulo="Custos" valor={moeda(pontos[hover].custo)} />
          {pontos[hover].pessoal > 0 && <Linha cor={COR.pessoal} rotulo="Pessoal" valor={moeda(pontos[hover].pessoal)} />}
          <div className="mt-1 border-t border-white/20 pt-1"><Linha cor="#fff" rotulo="Resultado" valor={moeda(pontos[hover].resultado)} forte /><p className="mt-0.5 text-right text-gray-300">margem {pontos[hover].margem === null ? "–" : percentual(pontos[hover].margem!, 1)}</p></div>
        </div>
      )}
    </div>
  );
}

function Linha({ cor, rotulo, valor, forte }: { cor: string; rotulo: string; valor: string; forte?: boolean }) {
  return <p className={`flex items-center justify-between gap-2 ${forte ? "font-semibold" : ""}`}><span className="flex items-center gap-1.5"><i className="inline-block h-2 w-2 rounded-sm" style={{ background: cor }} />{rotulo}</span><span className="tabular-nums">{valor}</span></p>;
}

export function LegendaMensal({ comPessoal }: { comPessoal: boolean }) {
  const item = (cor: string, t: string, linha = false) => <span key={t} className="flex items-center gap-1.5 text-xs text-gray-600">{linha ? <i className="inline-block h-0.5 w-4 rounded" style={{ background: cor }} /> : <i className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cor }} />}{t}</span>;
  return <div className="flex flex-wrap gap-x-4 gap-y-1">{item(COR.receita, "Receita")}{item(COR.custo, "Custos")}{comPessoal && item(COR.pessoal, "Pessoal")}{item(COR.tinta, "Resultado", true)}</div>;
}

// ------------------------------------------------------------------------------------------------ linha simples (margem, acumulado)

export function LinhaSimples({ meses, valores, formato, eixo, altura = 200, cor = COR.receita, mesParcial, referencia, rotulo }: { meses: string[]; valores: (number | null)[]; formato: (v: number) => string; eixo: "pct" | "moeda"; altura?: number; cor?: string; mesParcial?: string; referencia?: number | null; rotulo: string }) {
  const [ref, w] = useLargura<HTMLDivElement>(320);
  const [hover, setHover] = useState<number | null>(null);
  const m = { t: 16, r: 12, b: 26, l: 50 };
  const h = altura, areaW = w - m.l - m.r, areaH = h - m.t - m.b;
  const num = valores.filter((v): v is number => v !== null);
  const max = Math.max(0.0001, ...num, referencia ?? 0), min = Math.min(0, ...num, referencia ?? 0);
  const esc = escalaComNegativos(min, max, 3);
  const y = (v: number) => m.t + areaH - ((v - esc.min) / (esc.max - esc.min || 1)) * areaH;
  const passo = areaW / Math.max(1, meses.length);
  const x = (i: number) => m.l + passo * i + passo / 2;
  let d = "", aberto = false;
  valores.forEach((v, i) => { if (v === null) { aberto = false; return; } d += `${aberto ? "L" : "M"}${x(i)},${y(v)} `; aberto = true; });
  const fmtEixo = (v: number) => (eixo === "pct" ? `${Math.round(v * 100)}%` : abreviado(v));
  const cada = meses.length > 8 ? Math.ceil(meses.length / 7) : 1;
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={h} role="img" aria-label={rotulo}>
        {esc.marcas.map((v) => (
          <g key={v}>
            <line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#6b7280" : "#eceff3"} strokeWidth={v === 0 ? 1.2 : 1} />
            <text x={m.l - 7} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="#6b7280">{fmtEixo(v)}</text>
          </g>
        ))}
        {referencia !== null && referencia !== undefined && <g><line x1={m.l} x2={w - m.r} y1={y(referencia)} y2={y(referencia)} stroke={COR.suave} strokeDasharray="4 4" /><text x={w - m.r} y={y(referencia) - 4} textAnchor="end" fontSize={10.5} fill="#6b7280">média {fmtEixo(referencia)}</text></g>}
        <path d={d} fill="none" stroke={cor} strokeWidth={2.4} strokeLinejoin="round" strokeLinecap="round" />
        {valores.map((v, i) => v === null ? null : <circle key={meses[i]} cx={x(i)} cy={y(v)} r={hover === i ? 5 : 3.2} fill={meses[i] === mesParcial ? "#fff" : cor} stroke={cor} strokeWidth={2} />)}
        {meses.map((mes, i) => (i % cada === 0 ? <text key={mes} x={x(i)} y={h - 8} textAnchor="middle" fontSize={10.5} fill="#6b7280">{mesCurto(mes)}{mes === mesParcial ? "*" : ""}</text> : null))}
        {meses.map((mes, i) => <rect key={mes} x={x(i) - passo / 2} y={m.t} width={passo} height={areaH} fill="transparent" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} />)}
      </svg>
      {hover !== null && valores[hover] !== null && (
        <div className="pointer-events-none absolute top-0 rounded-md bg-gray-900/95 px-2 py-1 text-xs text-white shadow" style={{ left: Math.min(Math.max(x(hover) - 40, 2), Math.max(2, w - 110)) }}>{mesCurto(meses[hover])}: <b>{formato(valores[hover]!)}</b></div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ ranking de resultado por contrato

export type ItemRankingResultado = { chave: string; rotulo: string; subrotulo?: string; resultado: number; margem: number | null; receita: number; selo?: React.ReactNode; serie?: number[] };

export function RankingResultado({ itens, onAbrir, max = 14 }: { itens: ItemRankingResultado[]; onAbrir?: (chave: string) => void; max?: number }) {
  const lista = itens.slice(0, max);
  const teto = Math.max(1, ...lista.map((i) => Math.abs(i.resultado)));
  const temNegativo = lista.some((i) => i.resultado < 0);
  const pctZero = temNegativo ? 28 : 0;
  return (
    <ul className="space-y-1.5" aria-label="Resultado por contrato">
      {lista.map((i) => {
        const neg = i.resultado < 0;
        const largura = (Math.abs(i.resultado) / teto) * (100 - pctZero);
        return (
          <li key={i.chave}>
            <button type="button" onClick={() => onAbrir?.(i.chave)} className="group grid w-full grid-cols-[minmax(0,13rem)_1fr_auto] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-50">
              <span className="min-w-0"><span className="block truncate text-[13px] font-medium text-gray-900 group-hover:text-brand">{i.rotulo}</span>{i.subrotulo && <span className="block truncate text-[11px] text-gray-400">{i.subrotulo}</span>}</span>
              <span className="relative h-5 rounded bg-gray-50">
                <span className="absolute inset-y-0 rounded" style={{ left: neg ? `${pctZero - largura}%` : `${pctZero}%`, width: `${Math.max(largura, 0.6)}%`, background: neg ? COR.negativo : COR.receita }} />
                {temNegativo && <span className="absolute inset-y-0 w-px bg-gray-400" style={{ left: `${pctZero}%` }} />}
              </span>
              <span className="flex items-center justify-end gap-2 text-right tabular-nums"><b className={`text-[13px] ${neg ? "text-red-600" : "text-gray-900"}`}>{moedaCompacta(i.resultado)}</b><span className="w-12 text-xs text-gray-500">{i.margem === null ? "–" : percentual(i.margem, 0)}</span></span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------------------------------------ dispersao: receita x margem (tamanho = custo)

export type PontoDispersao = { chave: string; rotulo: string; receita: number; margem: number; custo: number; resultado: number };

export function Dispersao({ pontos, margemMedia, onAbrir, altura = 340 }: { pontos: PontoDispersao[]; margemMedia: number | null; onAbrir?: (chave: string) => void; altura?: number }) {
  const [ref, w] = useLargura<HTMLDivElement>();
  const [hover, setHover] = useState<string | null>(null);
  const m = { t: 18, r: 18, b: 38, l: 52 };
  const h = altura, areaW = w - m.l - m.r, areaH = h - m.t - m.b;
  const xMax = escalaBonita(Math.max(1, ...pontos.map((p) => p.receita)), 4);
  const ys = pontos.map((p) => Math.max(-1, Math.min(1, p.margem)));
  const yMinBruto = Math.min(0, ...ys), yMaxBruto = Math.max(0.1, ...ys);
  const yMin = Math.floor(yMinBruto * 10) / 10, yMax = Math.ceil(yMaxBruto * 10) / 10;
  const x = (v: number) => m.l + (v / xMax.topo) * areaW;
  const y = (v: number) => m.t + areaH - ((Math.max(-1, Math.min(1, v)) - yMin) / (yMax - yMin || 1)) * areaH;
  const custoMax = Math.max(1, ...pontos.map((p) => p.custo));
  const raio = (c: number) => 5 + Math.sqrt(c / custoMax) * 15;
  const marcasY: number[] = [];
  for (let v = Math.ceil(yMin * 10) / 10; v <= yMax + 1e-9; v = Math.round((v + 0.2) * 10) / 10) marcasY.push(Math.round(v * 10) / 10);
  const ativo = pontos.find((p) => p.chave === hover);
  return (
    <div ref={ref} className="relative w-full">
      <svg width={w} height={h} role="img" aria-label="Receita líquida por margem de cada contrato">
        {marcasY.map((v) => (<g key={v}><line x1={m.l} x2={w - m.r} y1={y(v)} y2={y(v)} stroke={v === 0 ? "#6b7280" : "#eceff3"} strokeWidth={v === 0 ? 1.2 : 1} /><text x={m.l - 7} y={y(v) + 4} textAnchor="end" fontSize={10.5} fill="#6b7280">{Math.round(v * 100)}%</text></g>))}
        {xMax.marcas.map((v) => <text key={v} x={x(v)} y={h - 18} textAnchor="middle" fontSize={10.5} fill="#6b7280">{abreviado(v)}</text>)}
        <text x={m.l + areaW / 2} y={h - 3} textAnchor="middle" fontSize={11} fill="#4b5563">Receita líquida no período</text>
        {margemMedia !== null && <g><line x1={m.l} x2={w - m.r} y1={y(margemMedia)} y2={y(margemMedia)} stroke={COR.suave} strokeDasharray="5 4" /><text x={w - m.r} y={y(margemMedia) - 5} textAnchor="end" fontSize={10.5} fill="#6b7280">margem da carteira {percentual(margemMedia, 0)}</text></g>}
        {[...pontos].sort((a, b) => b.custo - a.custo).map((p) => (
          <circle key={p.chave} cx={x(p.receita)} cy={y(p.margem)} r={raio(p.custo)} fill={p.resultado < 0 ? COR.negativo : COR.receita} fillOpacity={hover && hover !== p.chave ? 0.18 : 0.55} stroke={p.resultado < 0 ? COR.negativo : COR.receita} strokeWidth={hover === p.chave ? 2.5 : 1.2}
            style={{ cursor: "pointer" }} onMouseEnter={() => setHover(p.chave)} onMouseLeave={() => setHover(null)} onClick={() => onAbrir?.(p.chave)} />
        ))}
      </svg>
      {ativo && (
        <div className="pointer-events-none absolute z-10 w-60 rounded-xl bg-gray-900/95 p-3 text-xs text-white shadow-xl" style={{ left: Math.min(Math.max(x(ativo.receita) - 120, 4), Math.max(4, w - 244)), top: 4 }}>
          <p className="mb-1 truncate font-semibold">{ativo.rotulo}</p>
          <Linha cor={COR.receita} rotulo="Receita líquida" valor={moeda(ativo.receita)} />
          <Linha cor={COR.custo} rotulo="Custos (+ pessoal)" valor={moeda(ativo.custo)} />
          <div className="mt-1 border-t border-white/20 pt-1"><Linha cor="#fff" rotulo="Resultado" valor={moeda(ativo.resultado)} forte /><p className="mt-0.5 text-right text-gray-300">margem {percentual(ativo.margem, 1)}</p></div>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ mapa de calor contrato x mes

/** Cor divergente: teal para resultado positivo, vermelho para negativo; a intensidade segue o valor (escala unica para comparar os contratos). */
export function corDoResultado(v: number, max: number): { background?: string; color?: string } {
  if (!v || !max) return {};
  const t = Math.min(1, Math.abs(v) / max);
  const alfa = 0.1 + t * 0.78;
  return v > 0 ? { background: `rgba(14,159,148,${alfa})`, color: t > 0.55 ? "#fff" : "#0f3f3b" } : { background: `rgba(217,45,32,${alfa})`, color: t > 0.5 ? "#fff" : "#7a1a12" };
}
