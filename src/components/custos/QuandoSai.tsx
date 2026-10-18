"use client";

// "Quando o dinheiro sai": valor pago em cada dia do mes (1 a 31) no periodo, pela data de pagamento real do Senior. Mostra em que dias o
// caixa pesa mais. So' lancamentos que tem data de pagamento (todos os da regra v2 depois da primeira atualizacao).

import { useEffect, useMemo, useState } from "react";
import type { BaseMes, Filtros } from "@/lib/custos/agregacao";
import { moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { eReembolsavel, grupoDaConta } from "@/lib/custos/planoContas";
import { useLargura } from "./graficos";
import { Cartao } from "./ui";

type L = { contaCodigo: number | null; contaFinanceira: string; fornecedor: string | null; valorRateado: number; dataPagamento: string | null; formaBaixa: string | null };

export default function QuandoSai({ codccu, filtros, base, busca }: { codccu: string; filtros: Filtros; base: BaseMes; busca: string }) {
  const [dados, setDados] = useState<L[] | "carregando" | "erro">("carregando");
  const [foco, setFoco] = useState<number | null>(null);
  const [ref, largura] = useLargura<HTMLDivElement>();

  useEffect(() => {
    let cancelado = false;
    setDados("carregando");
    const qs = new URLSearchParams({ codccu, de: filtros.de, ate: filtros.ate, base });
    fetch(`/api/custos-conta/lancamentos?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelado && setDados(d.linhas as L[]))
      .catch(() => !cancelado && setDados("erro"));
    return () => {
      cancelado = true;
    };
  }, [codccu, filtros.de, filtros.ate, base]);

  const termo = busca.trim().toLowerCase();
  const { dias, semData, total, adiant } = useMemo(() => {
    const dias = Array.from({ length: 31 }, () => ({ valor: 0, qtd: 0 }));
    let semData = 0;
    let total = 0;
    let adiant = 0;
    if (dados === "carregando" || dados === "erro") return { dias, semData, total, adiant };
    for (const l of dados) {
      const reemb = l.contaCodigo !== null && eReembolsavel(l.contaCodigo);
      if (filtros.tipo === "reembolsavel" && !reemb) continue;
      if (filtros.tipo === "proprio" && reemb) continue;
      if (filtros.grupo !== "todos" && grupoDaConta(l.contaCodigo ?? 0).codigo !== filtros.grupo) continue;
      if (termo && !(l.fornecedor ?? "").toLowerCase().includes(termo) && !l.contaFinanceira.toLowerCase().includes(termo)) continue;
      total += l.valorRateado;
      if (l.formaBaixa === "adiantamento") adiant += l.valorRateado;
      const d = l.dataPagamento ? Number(l.dataPagamento.slice(8, 10)) : 0;
      if (d >= 1 && d <= 31) {
        dias[d - 1].valor += l.valorRateado;
        dias[d - 1].qtd += 1;
      } else semData += l.valorRateado;
    }
    return { dias, semData, total, adiant };
  }, [dados, filtros.tipo, filtros.grupo, termo]);

  const max = Math.max(1, ...dias.map((d) => d.valor));
  const m = { t: 22, r: 8, b: 26, l: 8 };
  const altura = 230;
  const areaW = Math.max(10, largura - m.l - m.r);
  const areaH = altura - m.t - m.b;
  const banda = areaW / 31;
  const topo = [...dias.map((d, i) => ({ i, v: d.valor }))].sort((a, b) => b.v - a.v).slice(0, 3).filter((x) => x.v > 0);
  // janela de 7 dias seguidos que concentra mais valor
  let melhor = { ini: 1, v: 0 };
  for (let i = 0; i + 6 < 31; i++) {
    const v = dias.slice(i, i + 7).reduce((s, d) => s + d.valor, 0);
    if (v > melhor.v) melhor = { ini: i + 1, v };
  }
  const comData = total - semData;

  return (
    <Cartao titulo="Quando o dinheiro sai" subtitulo="Valor pago em cada dia do mês, somando todos os meses do período — pela data real de pagamento no Senior.">
      {dados === "carregando" && <div className="h-48 animate-pulse rounded-xl bg-gray-100" aria-busy />}
      {dados === "erro" && <p className="py-6 text-center text-sm text-red-600">Não foi possível carregar os pagamentos.</p>}
      {dados !== "carregando" && dados !== "erro" && comData <= 0 && <p className="py-6 text-center text-sm text-gray-500">Sem pagamentos com data neste período e filtro. Se acabou de atualizar, a data aparece após a próxima leitura do Senior.</p>}
      {comData > 0 && (
        <>
          <p className="mb-2 text-[14px] text-gray-700">
            Os 7 dias seguidos que mais concentram pagamento são <b>dia {melhor.ini} a {melhor.ini + 6}</b>: <b>{moedaCompacta(melhor.v)}</b> ({percentual(comData ? melhor.v / comData : 0)} do valor pago).
            {adiant > 0 && <> Pagos por adiantamento: <b>{moedaCompacta(adiant)}</b>.</>}
          </p>
          <div ref={ref} className="relative w-full select-none" style={{ height: altura }}>
            <svg width={largura} height={altura} role="img" aria-label="Valor pago por dia do mês" className="absolute left-0 top-0 block">
              {dias.map((d, i) => {
                const h = (d.valor / max) * areaH;
                const x = m.l + banda * i;
                const destaque = topo.some((t) => t.i === i);
                return (
                  <g key={i} onMouseEnter={() => setFoco(i)} onMouseLeave={() => setFoco(null)}>
                    <title>{`Dia ${i + 1}: ${moeda(d.valor)} em ${d.qtd} lançamento(s)`}</title>
                    <rect x={x} y={m.t - 6} width={banda} height={areaH + 6} fill={foco === i ? "rgba(14,159,148,0.08)" : "transparent"} />
                    {d.valor > 0 && <rect x={x + banda * 0.14} y={m.t + areaH - h} width={Math.max(2, banda * 0.72)} height={Math.max(1.5, h)} rx={3} fill={destaque || foco === i ? "#0e9f94" : "#7fd0c8"} />}
                    {(destaque || foco === i) && d.valor > 0 && (
                      <text x={x + banda / 2} y={m.t + areaH - h - 5} textAnchor="middle" fontSize={11.5} fontWeight={700} fill="#111827">
                        {moedaCompacta(d.valor)}
                      </text>
                    )}
                    {(i + 1) % 2 === 1 || banda > 30 ? (
                      <text x={x + banda / 2} y={altura - 8} textAnchor="middle" fontSize={11.5} fill="#6b7280" fontWeight={foco === i ? 700 : 400}>
                        {i + 1}
                      </text>
                    ) : null}
                  </g>
                );
              })}
              <line x1={m.l} x2={largura - m.r} y1={m.t + areaH} y2={m.t + areaH} stroke="#e5e7eb" />
            </svg>
          </div>
          {semData > 0 && <p className="mt-1 text-xs text-gray-400">{moedaCompacta(semData)} de lançamentos antigos ainda sem data de pagamento (entram após a próxima atualização).</p>}
        </>
      )}
    </Cartao>
  );
}
