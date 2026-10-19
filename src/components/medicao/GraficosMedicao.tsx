"use client";

// Graficos da Medicao (SVG puro, um eixo por grafico): barras do medido por mes (clicaveis) e linha do medido acumulado contra o contratado.

import { mesCurto, mesLongo, moeda, moedaCompacta } from "@/lib/custos/formato";

export type PontoMes = { mes: string; valor: number; rotulo?: string };

export function BarrasPorMes({ pontos, selecionado, mesAtual, alertas, formato, titulo, onSelecionar }: { pontos: PontoMes[]; selecionado: string | null; mesAtual: string; alertas: string[]; formato: (v: number) => string; titulo: string; onSelecionar: (mes: string) => void }) {
  const n = Math.max(1, pontos.length);
  const largura = Math.max(560, n * 56);
  const alt = 210, topo = 24, base = 32;
  const passo = largura / n;
  const max = Math.max(1e-9, ...pontos.map((p) => p.valor));
  const barra = Math.min(34, passo * 0.62);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${largura} ${alt}`} style={{ minWidth: Math.min(largura, 560), width: "100%", height: "auto" }} role="img" aria-label={titulo}>
        <line x1={0} x2={largura} y1={alt - base} y2={alt - base} className="stroke-gray-200" />
        {pontos.map((p, i) => {
          const cx = passo * i + passo / 2;
          const h = ((alt - topo - base) * p.valor) / max;
          const ativo = selecionado === p.mes;
          const alerta = alertas.includes(p.mes);
          return (
            <g key={p.mes} className="cursor-pointer" role="button" tabIndex={0} aria-label={`${mesLongo(p.mes)}: ${formato(p.valor)}`} onClick={() => onSelecionar(p.mes)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelecionar(p.mes)}>
              <title>{`${mesLongo(p.mes)}: ${formato(p.valor)}${p.rotulo ? `\n${p.rotulo}` : ""}${alerta ? "\nMedição muito abaixo da média: pode não ter sido lançada no Senior" : ""}`}</title>
              <rect x={cx - passo / 2 + 2} y={topo - 10} width={passo - 4} height={alt - topo - base + 10 + 22} rx={8} className={ativo ? "fill-teal-500/10" : "fill-transparent hover:fill-gray-100/70"} />
              {p.valor > 0 && <rect x={cx - barra / 2} y={alt - base - h} width={barra} height={Math.max(1.5, h)} rx={3} className={alerta ? "fill-amber-500" : p.mes === mesAtual ? "fill-teal-400" : "fill-teal-600"} />}
              {p.valor > 0 && <text x={cx} y={alt - base - h - 5} textAnchor="middle" fontSize={10.5} className="fill-gray-700 font-medium">{formato(p.valor)}</text>}
              <text x={cx} y={alt - base + 15} textAnchor="middle" fontSize={11} className={ativo ? "fill-gray-900 font-semibold" : "fill-gray-500"}>{mesCurto(p.mes)}</text>
              {p.rotulo && <text x={cx} y={alt - base + 27} textAnchor="middle" fontSize={9} className="fill-gray-400">{p.rotulo}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export function LinhaAcumulado({ pontos, teto, tituloTeto }: { pontos: { mes: string; acumulado: number }[]; teto: number; tituloTeto: string }) {
  const n = Math.max(2, pontos.length);
  const largura = 560, alt = 210, esq = 26, dir = 62, topo = 26, base = 32;
  const util = largura - esq - dir;
  const maximo = Math.max(teto, ...pontos.map((p) => p.acumulado), 1);
  const x = (i: number) => esq + (util * i) / (n - 1);
  const y = (v: number) => alt - base - ((alt - topo - base) * v) / maximo;
  const caminho = pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.acumulado).toFixed(1)}`).join(" ");
  const area = pontos.length ? `${caminho} L${x(pontos.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z` : "";
  const ultimo = pontos[pontos.length - 1];
  const passoRot = Math.ceil(pontos.length / 8);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${largura} ${alt}`} style={{ minWidth: 420, width: "100%", height: "auto" }} role="img" aria-label="Medido acumulado em relação ao valor contratado">
        <line x1={esq} x2={largura - dir} y1={y(0)} y2={y(0)} className="stroke-gray-200" />
        <line x1={esq} x2={largura - dir} y1={y(teto)} y2={y(teto)} className="stroke-gray-400" strokeDasharray="5 4" />
        <text x={largura - dir + 4} y={y(teto) + 4} fontSize={10} className="fill-gray-500">{tituloTeto}</text>
        <text x={largura - dir + 4} y={y(teto) + 16} fontSize={10} className="fill-gray-400">{moedaCompacta(teto).replace("R$ ", "")}</text>
        {pontos.length > 1 && <path d={area} className="fill-teal-500/15" />}
        {pontos.length > 1 && <path d={caminho} className="fill-none stroke-teal-600" strokeWidth={2} />}
        {pontos.map((p, i) => (
          <g key={p.mes}>
            <circle cx={x(i)} cy={y(p.acumulado)} r={i === pontos.length - 1 ? 4 : 2.5} className="fill-teal-600 stroke-white" strokeWidth={1.5}><title>{`${mesLongo(p.mes)}: ${moeda(p.acumulado)} acumulado`}</title></circle>
            {(i % passoRot === 0 || i === pontos.length - 1) && <text x={x(i)} y={alt - base + 15} textAnchor="middle" fontSize={10.5} className="fill-gray-500">{mesCurto(p.mes)}</text>}
          </g>
        ))}
        {ultimo && <text x={Math.min(x(pontos.length - 1), largura - dir - 4)} y={y(ultimo.acumulado) - 9} textAnchor="end" fontSize={11} className="fill-gray-800 font-semibold">{moedaCompacta(ultimo.acumulado).replace("R$ ", "")}</text>}
      </svg>
    </div>
  );
}

export function RankingConsumo({ itens, onSelecionar, selecionado }: { itens: { chave: number; rotulo: string; pct: number; detalhe: string }[]; onSelecionar: (c: number) => void; selecionado: number | null }) {
  return (
    <ul className="space-y-1.5">
      {itens.map((i) => (
        <li key={i.chave}>
          <button type="button" onClick={() => onSelecionar(i.chave)} className={`flex w-full items-center gap-2 rounded-md px-1.5 py-0.5 text-left hover:bg-gray-50 ${selecionado === i.chave ? "bg-teal-50" : ""}`} title={i.detalhe}>
            <span className="w-44 shrink-0 truncate text-[12.5px] text-gray-700">{i.rotulo}</span>
            <span className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><span className={`block h-2 ${i.pct >= 0.95 ? "bg-amber-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, i.pct * 100)}%` }} /></span>
            <span className="w-10 text-right text-[12px] tabular-nums text-gray-500">{Math.round(i.pct * 100)}%</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
