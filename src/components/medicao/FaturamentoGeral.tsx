"use client";

import { useEffect, useState } from "react";
import { LegendaLinha, LinhaAcompanhamento } from "@/components/custos/acompanhamento";
import { mediaDoPeriodo, mediaMovel } from "@/lib/custos/agregacao";
import { mesLongo, moeda, moedaCompacta } from "@/lib/custos/formato";

type Resumo = {
  de: string; ate: string; mesAtual: string;
  meses: { mes: string; faturado: number; nf: number; nd: number }[];
  totais: { faturado: number; nf: number; nd: number };
  atualizadoEm: string | null; faturamentoErro: string | null; semFaturamento: boolean; quantidadeCentros: number;
};

export default function FaturamentoGeral({ de, ate, mesAtual, atualizadoEm }: { de: string; ate: string; mesAtual: string; atualizadoEm: string | null }) {
  const [dados, setDados] = useState<Resumo | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    const abortar = new AbortController();
    setCarregando(true); setErro(null);
    fetch(`/api/medicao/faturamento?${new URLSearchParams({ de, ate })}`, { cache: "no-store", signal: abortar.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || "Não foi possível carregar o faturamento.");
        if (!abortar.signal.aborted) setDados(j);
      })
      .catch((e) => { if (!abortar.signal.aborted) setErro(e.message || "Não foi possível carregar o faturamento."); })
      .finally(() => { if (!abortar.signal.aborted) setCarregando(false); });
    return () => abortar.abort();
  }, [de, ate, atualizadoEm]);

  const atual = dados?.de === de && dados?.ate === ate ? dados : null;
  const valores = atual?.meses.map((m) => m.faturado) ?? [];
  const parcial = ate === mesAtual;
  const fechados = valores.length - (parcial ? 1 : 0);
  const media = mediaDoPeriodo(valores, parcial);
  const mm3 = mediaMovel(valores, 3, parcial).filter((v): v is number => v !== null);

  return (
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Faturamento mensal consolidado" aria-busy={carregando}>
      <header className="space-y-1">
        <h2 className="text-[15px] font-semibold text-gray-900">Faturamento mensal consolidado</h2>
        <p className="text-[13px] leading-relaxed text-gray-500">Notas fiscais e notas de débito, por competência, dos contratos selecionados no filtro de contratos. Cada centro de custo entra uma única vez.</p>
        <p className="text-xs text-gray-400">A busca e “Só com saldo”, na aba Por contrato, filtram apenas a tabela e sua exportação. O faturamento inclui também os contratos sem saldo a medir.</p>
      </header>

      {erro && <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{erro}</p>}
      {!atual && carregando && <div className="h-80 animate-pulse rounded-xl bg-gray-100" aria-label="Carregando faturamento mensal" />}
      {atual && <>
        {atual.faturamentoErro && <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">A última leitura das notas não foi concluída. O gráfico mostra os dados da leitura anterior.</p>}
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            { titulo: "Faturado no período", valor: moedaCompacta(atual.totais.faturado), detalhe: "notas fiscais + notas de débito" },
            { titulo: "Média do período", valor: fechados > 0 ? moedaCompacta(media) : "—", detalhe: `${Math.max(0, fechados)} meses fechados, incluindo meses sem faturamento` },
            { titulo: "Média móvel de 3 meses", valor: mm3.length ? moedaCompacta(mm3[mm3.length - 1]) : "—", detalhe: mm3.length ? "último ponto com 3 meses fechados" : "disponível a partir de 3 meses fechados" },
          ].map((k) => <div key={k.titulo} className="rounded-xl bg-gray-50 px-4 py-3">
            <p className="text-xs font-medium text-gray-500">{k.titulo}</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-gray-900">{k.valor}</p>
            <p className="text-xs text-gray-400">{k.detalhe}</p>
          </div>)}
        </div>
        {atual.semFaturamento ? <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">Ainda não há notas sincronizadas para os contratos selecionados.</p> : <>
          <LinhaAcompanhamento meses={atual.meses.map((m) => m.mes)} valores={valores} mesParcial={parcial ? mesAtual : undefined} modo="mensal" mostrarMedia mostrarMediaMovel rotuloAcessivel="Linha de acompanhamento do faturamento mensal" rotuloMensal="Faturamento no mês" />
          <LegendaLinha modo="mensal" mostrarMedia mostrarMediaMovel temMeta={false} rotuloMensal="Faturamento do mês" />
          <p className="text-xs text-gray-500">{parcial ? "O mês atual está em andamento e fica fora das médias. " : ""}A média móvel considera cada mês e os 2 anteriores dentro do período selecionado. Medido sem nota e recebimentos não são somados ao faturamento.</p>
          <details className="rounded-xl border border-gray-100">
            <summary className="cursor-pointer px-4 py-2 text-[13px] font-medium text-gray-600">Ver valores mês a mês</summary>
            <div className="overflow-x-auto px-4 pb-3">
              <table className="w-full text-[13px] tabular-nums">
                <caption className="sr-only">Faturamento consolidado por mês no período selecionado</caption>
                <thead><tr className="border-b border-gray-200 text-gray-500"><th className="py-2 text-left">Mês</th><th className="py-2 text-right">Notas fiscais</th><th className="py-2 text-right">Notas de débito</th><th className="py-2 text-right">Faturado</th></tr></thead>
                <tbody>{atual.meses.map((m) => <tr key={m.mes} className="border-b border-gray-100"><th className="py-2 text-left font-normal">{mesLongo(m.mes)}{m.mes === mesAtual ? " · em andamento" : ""}</th><td className="py-2 text-right">{moeda(m.nf)}</td><td className="py-2 text-right">{moeda(m.nd)}</td><td className="py-2 text-right font-medium">{moeda(m.faturado)}</td></tr>)}</tbody>
              </table>
            </div>
          </details>
        </>}
      </>}
    </section>
  );
}
