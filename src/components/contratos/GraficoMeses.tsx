"use client";

// Barras mes a mes (programado + previsto empilhados), clicaveis. SVG puro, sem biblioteca. Cada barra e' um botao: clicar escolhe o mes.

import { moedaCompacta, mesCurto, mesLongo, moeda } from "@/lib/custos/formato";

export type BarraMes = { mes: string; programado: number; previsto: number; total: number };

export default function GraficoMeses({ meses, selecionado, mesAtual, onSelecionar }: { meses: BarraMes[]; selecionado: string | null; mesAtual: string; onSelecionar: (mes: string) => void }) {
  const n = Math.max(1, meses.length);
  const largura = Math.max(960, n * 92);
  const alt = 250, topo = 26, base = 38, esq = 8, dir = 8;
  const util = largura - esq - dir;
  const maximo = Math.max(1, ...meses.map((m) => m.total));
  const passo = util / n;
  const larguraBarra = Math.min(46, passo * 0.6);
  const h = (v: number) => ((alt - topo - base) * v) / maximo;
  const linhas = [0, 0.5, 1];

  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${largura} ${alt}`} style={{ minWidth: Math.min(largura, 900), width: "100%", height: "auto" }} role="img" aria-label="Valor previsto por mês, separado em já programado e previsto. Clique numa barra para ver o mês.">
        {linhas.map((f) => {
          const y = alt - base - (alt - topo - base) * f;
          return (
            <g key={f}>
              <line x1={esq} x2={largura - dir} y1={y} y2={y} className="stroke-gray-200" strokeWidth={1} strokeDasharray={f === 0 ? undefined : "3 4"} />
            </g>
          );
        })}
        {meses.map((m, i) => {
          const cx = esq + passo * i + passo / 2;
          const x = cx - larguraBarra / 2;
          const hProg = h(m.programado), hPrev = h(m.previsto);
          const ativo = selecionado === m.mes;
          const yTopo = alt - base - hProg - hPrev;
          return (
            <g key={m.mes} className="cursor-pointer" role="button" tabIndex={0} aria-label={`${mesLongo(m.mes)}: ${moeda(m.total)}`} onClick={() => onSelecionar(m.mes)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelecionar(m.mes)}>
              <title>{`${mesLongo(m.mes)}\nJá programado: ${moeda(m.programado)}\nPrevisto: ${moeda(m.previsto)}\nTotal: ${moeda(m.total)}`}</title>
              <rect x={cx - passo / 2 + 2} y={topo - 14} width={passo - 4} height={alt - topo - base + 14 + 22} rx={8} className={ativo ? "fill-teal-500/10" : "fill-transparent hover:fill-gray-100/70"} />
              {hProg > 0 && <rect x={x} y={alt - base - hProg} width={larguraBarra} height={hProg} rx={3} className="fill-teal-600" />}
              {hPrev > 0 && <rect x={x} y={yTopo} width={larguraBarra} height={hPrev} rx={3} className="fill-violet-400" />}
              {m.total > 0 && <text x={cx} y={yTopo - 5} textAnchor="middle" fontSize={11} className="fill-gray-700 font-medium">{moedaCompacta(m.total).replace("R$ ", "")}</text>}
              <text x={cx} y={alt - base + 16} textAnchor="middle" fontSize={11} className={ativo ? "fill-gray-900 font-semibold" : "fill-gray-500"}>{mesCurto(m.mes)}</text>
              {m.mes === mesAtual && <text x={cx} y={alt - base + 29} textAnchor="middle" fontSize={9} className="fill-teal-700">mês atual</text>}
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-600" /> Já programado (títulos e OCs com data)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-400" /> Previsto (previsões do Senior)</span>
        <span>Clique numa barra para ver o mês.</span>
      </div>
    </div>
  );
}
