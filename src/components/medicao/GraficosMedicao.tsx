"use client";

// Graficos da Medicao (SVG puro, um eixo por grafico): barras do medido por mes (clicaveis), linhas do avanco acumulado financeiro x fisico e
// o consumo de cada linha por quantidade e por valor.

import { mesCurto, mesLongo, moeda, percentual } from "@/lib/custos/formato";

export const COR_VALOR = "teal"; // financeiro: valor
export const COR_QTD = "indigo"; // fisico: quantidade

export type PontoMes = { mes: string; valor: number; rotulo?: string };

export function BarrasPorMes({ pontos, selecionado, mesAtual, alertas, formato, titulo, onSelecionar }: { pontos: PontoMes[]; selecionado: string | null; mesAtual: string; alertas: string[]; formato: (v: number) => string; titulo: string; onSelecionar: (mes: string) => void }) {
  const n = Math.max(1, pontos.length);
  const largura = Math.max(560, n * 56);
  const alt = 220, topo = 26, base = 36;
  const passo = largura / n;
  const max = Math.max(1e-9, ...pontos.map((p) => p.valor));
  const barra = Math.min(34, passo * 0.62);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${largura} ${alt}`} style={{ minWidth: Math.min(largura, 560), width: "100%", height: "auto" }} role="img" aria-label={titulo}>
        {[0.5, 1].map((f) => <line key={f} x1={0} x2={largura} y1={alt - base - (alt - topo - base) * f} y2={alt - base - (alt - topo - base) * f} className="stroke-gray-100" strokeDasharray="3 4" />)}
        <line x1={0} x2={largura} y1={alt - base} y2={alt - base} className="stroke-gray-200" />
        {pontos.map((p, i) => {
          const cx = passo * i + passo / 2;
          const h = ((alt - topo - base) * p.valor) / max;
          const ativo = selecionado === p.mes;
          const alerta = alertas.includes(p.mes);
          return (
            <g key={p.mes} className="cursor-pointer" role="button" tabIndex={0} aria-label={`${mesLongo(p.mes)}: ${formato(p.valor)}`} onClick={() => onSelecionar(p.mes)} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelecionar(p.mes)}>
              <title>{`${mesLongo(p.mes)}: ${formato(p.valor)}${p.rotulo ? `\n${p.rotulo}` : ""}${alerta ? "\nMedição muito abaixo da média: pode não ter sido lançada no Senior" : ""}`}</title>
              <rect x={cx - passo / 2 + 2} y={topo - 12} width={passo - 4} height={alt - topo - base + 12 + 24} rx={8} className={ativo ? "fill-teal-500/10" : "fill-transparent hover:fill-gray-100/70"} />
              {p.valor > 0 && <rect x={cx - barra / 2} y={alt - base - h} width={barra} height={Math.max(1.5, h)} rx={3} className={alerta ? "fill-amber-500" : p.mes === mesAtual ? "fill-teal-400" : "fill-teal-600"} />}
              {p.valor > 0 && <text x={cx} y={alt - base - h - 5} textAnchor="middle" fontSize={10.5} className="fill-gray-700 font-medium">{formato(p.valor)}</text>}
              <text x={cx} y={alt - base + 15} textAnchor="middle" fontSize={11} className={ativo ? "fill-gray-900 font-semibold" : "fill-gray-500"}>{mesCurto(p.mes)}</text>
              {p.rotulo && <text x={cx} y={alt - base + 28} textAnchor="middle" fontSize={9} className="fill-gray-400">{p.rotulo}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Avanco acumulado em % do contrato: financeiro (valor medido / valor contratado) e fisico (quantidade medida ponderada pelo valor contratado). */
export function LinhasAvanco({ pontos }: { pontos: { mes: string; fin: number; fis: number }[] }) {
  const n = Math.max(2, pontos.length);
  const largura = 560, alt = 220, esq = 40, dir = 52, topo = 20, base = 34;
  const util = largura - esq - dir;
  const maximo = Math.max(1, ...pontos.map((p) => Math.max(p.fin, p.fis))) * 1.04;
  const x = (i: number) => esq + (util * i) / (n - 1);
  const y = (v: number) => alt - base - ((alt - topo - base) * v) / maximo;
  const caminho = (k: "fin" | "fis") => pontos.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join(" ");
  const ultimo = pontos[pontos.length - 1];
  const passoRot = Math.ceil(pontos.length / 8);
  return (
    <div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${largura} ${alt}`} style={{ minWidth: 420, width: "100%", height: "auto" }} role="img" aria-label="Avanço acumulado do contrato: financeiro (valor) e físico (quantidade)">
          {[0, 0.5, 1].filter((v) => v <= maximo).map((v) => (
            <g key={v}>
              <line x1={esq} x2={largura - dir} y1={y(v)} y2={y(v)} className={v === 1 ? "stroke-gray-400" : "stroke-gray-100"} strokeDasharray={v === 0 ? undefined : "4 4"} />
              <text x={esq - 6} y={y(v) + 3.5} textAnchor="end" fontSize={10} className="fill-gray-400">{Math.round(v * 100)}%</text>
            </g>
          ))}
          <text x={largura - dir + 4} y={y(1) + 3.5} fontSize={10} className="fill-gray-500">100%</text>
          {pontos.length > 1 && <path d={caminho("fis")} className="fill-none stroke-indigo-500" strokeWidth={2} strokeDasharray="6 3" />}
          {pontos.length > 1 && <path d={caminho("fin")} className="fill-none stroke-teal-600" strokeWidth={2.25} />}
          {pontos.map((p, i) => (
            <g key={p.mes}>
              <circle cx={x(i)} cy={y(p.fin)} r={i === pontos.length - 1 ? 3.8 : 2.2} className="fill-teal-600 stroke-white" strokeWidth={1.4}><title>{`${mesLongo(p.mes)}\nFinanceiro (valor): ${percentual(p.fin, 1)}\nFísico (quantidade): ${percentual(p.fis, 1)}`}</title></circle>
              <circle cx={x(i)} cy={y(p.fis)} r={i === pontos.length - 1 ? 3.8 : 2.2} className="fill-indigo-500 stroke-white" strokeWidth={1.4}><title>{`${mesLongo(p.mes)}\nFinanceiro (valor): ${percentual(p.fin, 1)}\nFísico (quantidade): ${percentual(p.fis, 1)}`}</title></circle>
              {(i % passoRot === 0 || i === pontos.length - 1) && <text x={x(i)} y={alt - base + 16} textAnchor="middle" fontSize={10.5} className="fill-gray-500">{mesCurto(p.mes)}</text>}
            </g>
          ))}
          {ultimo && <>
            <text x={x(pontos.length - 1) + 8} y={y(ultimo.fin) + (ultimo.fin >= ultimo.fis ? -4 : 12)} fontSize={11} className="fill-teal-700 font-semibold">{Math.round(ultimo.fin * 100)}%</text>
            <text x={x(pontos.length - 1) + 8} y={y(ultimo.fis) + (ultimo.fis > ultimo.fin ? -4 : 12)} fontSize={11} className="fill-indigo-600 font-semibold">{Math.round(ultimo.fis * 100)}%</text>
          </>}
        </svg>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 bg-teal-600" /> Financeiro: valor medido ÷ valor contratado</span>
        <span className="flex items-center gap-1.5"><span className="h-0.5 w-5 border-t-2 border-dashed border-indigo-500" /> Físico: quantidade medida (ponderada pelo valor)</span>
      </div>
    </div>
  );
}

export type ConsumoLinha = { seq: number; rotulo: string; unidade: string | null; pctQtd: number; pctValor: number; divergenciaPp: number | null; detalhe: string };

/** Para cada linha: o quanto da quantidade e o quanto do valor ja foi consumido, lado a lado. A diferenca grande entre os dois e' sinalizada. */
export function ConsumoPorLinha({ itens, selecionada, onSelecionar }: { itens: ConsumoLinha[]; selecionada: number | null; onSelecionar: (seq: number) => void }) {
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-indigo-500" /> Quantidade consumida</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-teal-600" /> Valor consumido</span>
        <span className="flex items-center gap-1.5"><span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800">difere</span> quantidade e valor se afastam 10 pontos ou mais</span>
      </div>
      <ul className="divide-y divide-gray-100">
        {itens.map((i) => (
          <li key={i.seq}>
            <button type="button" onClick={() => onSelecionar(i.seq)} title={i.detalhe} className={`grid w-full grid-cols-[minmax(150px,1.1fr)_2fr_auto] items-center gap-3 px-2 py-1.5 text-left hover:bg-gray-50 ${selecionada === i.seq ? "bg-teal-50" : ""}`}>
              <span className="truncate text-[12.5px] text-gray-800">{i.rotulo}<span className="ml-1.5 text-[11px] text-gray-400">{i.unidade ?? ""}</span></span>
              <span className="space-y-1">
                {([["qtd", i.pctQtd, "bg-indigo-500"], ["valor", i.pctValor, "bg-teal-600"]] as const).map(([k, v, cor]) => (
                  <span key={k} className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><span className={`block h-1.5 ${cor}`} style={{ width: `${Math.min(100, v * 100)}%` }} /></span>
                    <span className="w-9 text-right text-[11px] tabular-nums text-gray-500">{Math.round(v * 100)}%</span>
                  </span>
                ))}
              </span>
              <span className="w-12 text-right">{i.divergenciaPp !== null && Math.abs(i.divergenciaPp) >= 10 ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800" title={`Quantidade ${percentual(i.pctQtd, 0)} · valor ${percentual(i.pctValor, 0)}`}>difere</span> : null}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function Gauge({ titulo, subtitulo, valor, cor, destaque }: { titulo: string; subtitulo: string; valor: number; cor: "teal" | "indigo"; destaque: string }) {
  const barra = cor === "teal" ? "bg-teal-600" : "bg-indigo-500";
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <p className="text-[13px] font-medium text-gray-500">{titulo}</p>
      <p className="mt-1 text-4xl font-semibold tabular-nums tracking-tight text-gray-900">{percentual(valor, 1)}</p>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-gray-100"><div className={`h-2.5 ${barra}`} style={{ width: `${Math.min(100, valor * 100)}%` }} /></div>
      <p className="mt-2 text-[13px] font-medium text-gray-700">{destaque}</p>
      <p className="text-xs text-gray-400">{subtitulo}</p>
    </div>
  );
}

export const moedaTitulo = moeda;
