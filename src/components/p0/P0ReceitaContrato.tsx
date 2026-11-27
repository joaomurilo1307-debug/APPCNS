"use client";

// Aba P0 > Receita: o previsto de faturamento do contrato, item a item (cada linha da planilha de medicoes), mes a mes, comparado com o
// realizado da aba Receita e Medicao (NF + ND + medido ainda sem nota). O realizado aqui e' so' o TOTAL do mes: a medicao do Senior e' organizada
// por pedido/boletim, nao pelas mesmas atividades da planilha, entao nao da' pra casar item a item com seguranca -- pra ver a medicao linha a
// linha de verdade, o link abaixo leva pra la. Clicar numa celula do previsto abre as linhas do P0 por tras daquele valor (mesmo mecanismo do P0
// de custos).

import { useMemo, useState } from "react";
import { serieDaConta, soma } from "@/lib/custos/agregacao";
import { mesCurto, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { mesesEntre, type P0Custos } from "@/lib/p0/montar";
import { Cartao, Kpi } from "@/components/custos/ui";
import { Sparkline, estiloCelulaCalor } from "@/components/custos/graficos";
import GraficoPrevistoRealizado, { LegendaPrevistoRealizado } from "./GraficoPrevistoRealizado";
import PeriodoP0 from "./PeriodoP0";
import DetalheP0, { type AlvoP0 } from "./DetalheP0";
import { useP0Custos } from "./useP0Custos";
import { useRealizadoReceitaDoContrato } from "./useRealizadoReceitaDoContrato";

export default function P0ReceitaContrato({ codccu }: { codccu: string }) {
  const estado = useP0Custos(codccu, "receita");
  if (estado.estado === "carregando") return <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" aria-busy />;
  if (estado.estado === "erro") return <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{estado.mensagem}</div>;
  if (estado.estado === "sem") {
    return (
      <Cartao titulo="P0 de receita" subtitulo="O que o contrato prevê faturar, item a item, mês a mês, pela planilha de medições">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-9 text-center">
          <p className="text-base font-medium text-gray-700">Este contrato não tem receita no P0.</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-500">Quando o P0 do contrato tiver a previsão de faturamento cadastrada, ela aparece aqui, item a item, mês a mês. Nada é estimado nem preenchido automaticamente.</p>
        </div>
      </Cartao>
    );
  }
  return <VisaoReceita codccu={codccu} p0={estado.p0} />;
}

function VisaoReceita({ codccu, p0 }: { codccu: string; p0: P0Custos }) {
  const mesesP = useMemo(() => mesesEntre(p0.mesIni, p0.mesFim), [p0.mesIni, p0.mesFim]);
  const [deEsc, setDeEsc] = useState<string | null>(null);
  const [ateEsc, setAteEsc] = useState<string | null>(null);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const mesCorrente = mesesP.includes(mesAtual) ? mesAtual : "";

  const de = deEsc && mesesP.includes(deEsc) ? deEsc : mesesP[0];
  const ateBruto = ateEsc && mesesP.includes(ateEsc) ? ateEsc : mesesP[mesesP.length - 1];
  const ate = ateBruto < de ? de : ateBruto;
  const mesesJ = useMemo(() => mesesP.slice(mesesP.indexOf(de), mesesP.indexOf(ate) + 1), [mesesP, de, ate]);

  const realizado = useRealizadoReceitaDoContrato(codccu, de, ate);
  const limiteRealizado = realizado.mesAtual || mesAtual;

  const linhas = useMemo(
    () =>
      p0.contas
        .map((conta) => {
          const serie = serieDaConta(conta, mesesJ);
          return { conta, serie, total: soma(serie) };
        })
        .filter((l) => l.serie.some((v) => v !== 0))
        .sort((a, b) => b.total - a.total),
    [p0.contas, mesesJ]
  );
  const previstoJ = useMemo(() => mesesJ.map((_, i) => soma(linhas.map((l) => l.serie[i]))), [mesesJ, linhas]);
  const realizadoJ = useMemo(() => mesesJ.map((m) => (m <= limiteRealizado ? realizado.porMes.get(m) ?? 0 : null)), [mesesJ, realizado, limiteRealizado]);
  const totalJ = soma(previstoJ);
  const totalRealizadoJ = soma(realizadoJ.filter((v): v is number => v !== null));
  const maxCelula = Math.max(1, ...linhas.flatMap((l) => l.serie.map((v) => Math.abs(v))));
  const maior = linhas[0] ?? null;

  const [alvo, setAlvo] = useState<AlvoP0 | null>(null);

  return (
    <div className="space-y-5">
      <Cartao titulo="P0 de receita" subtitulo={`Faturamento previsto no P0 · ${mesCurto(p0.mesIni)} a ${mesCurto(p0.mesFim)} · ${mesesP.length} meses`}>
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
          Aqui aparece o <b className="font-semibold">previsto</b>, item a item, direto da planilha de medições da área, comparado com o{" "}
          <b className="font-semibold">realizado</b> (NF + ND + medido ainda sem nota) do Senior, mês a mês. O realizado do Senior é organizado por
          pedido, não pelas mesmas atividades da planilha — por isso a comparação linha a linha fica só do lado do previsto; para ver a medição
          realizada linha a linha, use o link abaixo.
        </p>
        {p0.origem && <p className="mt-3 text-[12px] leading-snug text-gray-400">Fonte: {p0.origem}</p>}
        {realizado.numCtr && (
          <a href={`/medicao/${encodeURIComponent(realizado.numCtr)}`} className="mt-3 inline-block text-[13px] font-medium text-brand hover:text-brand-dark">
            Ver a medição realizada linha a linha ↗
          </a>
        )}
        {realizado.erro && <p className="mt-3 text-[12.5px] text-amber-700">Realizado: {realizado.erro}</p>}
        {!realizado.carregando && !realizado.numCtr && !realizado.erro && (
          <p className="mt-3 text-[12.5px] text-gray-400">Ainda não há contrato de medição do Senior vinculado a este centro de custo — o realizado não aparece até esse vínculo existir.</p>
        )}
      </Cartao>

      <PeriodoP0 meses={mesesP} de={de} ate={ate} mesCorrente={mesCorrente} onMudar={(d, a) => { setDeEsc(d); setAteEsc(a); }} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi rotulo={mesesJ.length === mesesP.length ? "Previsto de receita no P0" : "Previsto de receita no período"} valor={moedaCompacta(totalJ)} detalhe={`${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"} · ${mesesJ.length} ${mesesJ.length === 1 ? "mês" : "meses"}`} destaque lateral={<Sparkline valores={previstoJ} largura={132} altura={30} />} />
        <Kpi rotulo="Realizado no período" valor={realizado.carregando ? "…" : moedaCompacta(totalRealizadoJ)} detalhe="NF + ND + medido sem nota, do Senior" />
        <Kpi rotulo="Maior linha prevista" valor={<span className="block truncate text-lg">{maior ? maior.conta.contaFinanceira : "—"}</span>} detalhe={maior && totalJ ? `${moedaCompacta(maior.total)} · ${percentual(maior.total / totalJ, 0)} do previsto` : undefined} />
      </div>

      <Cartao titulo="Previsto × realizado, mês a mês" subtitulo="O que o P0 previa faturar e o que o Senior já reconheceu de receita em cada mês">
        <div className="mb-3">
          <LegendaPrevistoRealizado modo="mensal" temRealizado={!realizado.carregando} />
        </div>
        <GraficoPrevistoRealizado meses={mesesJ} previsto={previstoJ} realizado={realizadoJ} mesCorrente={mesCorrente} modo="mensal" />
      </Cartao>

      <Cartao titulo="Receita prevista × mês, item a item" subtitulo="Clique numa célula para ver as linhas do P0 por trás do valor">
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[640px] text-[13px] tabular-nums">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-right">Total</th>
                {mesesJ.map((m) => (
                  <th key={m} className="whitespace-nowrap px-2 py-2 text-right">{mesCurto(m)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={`${l.conta.codigo ?? "x"}|${l.conta.contaFinanceira}`} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5 font-medium text-gray-800">{l.conta.contaFinanceira}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-900" title={moeda(l.total)}>{moedaCompacta(l.total)}</td>
                  {l.serie.map((v, i) => (
                    <td key={mesesJ[i]} className="px-1 py-1" title={`${l.conta.contaFinanceira} · ${mesCurto(mesesJ[i])}: ${moeda(v)} previsto`}>
                      {v ? (
                        <button
                          type="button"
                          onClick={() => setAlvo({ codccu, conta: l.conta.contaFinanceira, mes: mesesJ[i], valor: v, reembolsavel: false, rotulo: "Receita", tipo: "receita" })}
                          className="block w-full rounded-md px-1.5 py-1 text-right text-[12.5px] hover:ring-1 hover:ring-brand/40"
                          style={estiloCelulaCalor(v, maxCelula)}
                        >
                          {moedaCompacta(v).replace("R$ ", "")}
                        </button>
                      ) : (
                        <span className="block px-1.5 py-1 text-right text-gray-300">–</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 bg-gray-50/70 font-semibold text-gray-900">
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Total previsto</td>
                <td className="px-3 py-2 text-right" title={moeda(totalJ)}>{moedaCompacta(totalJ)}</td>
                {previstoJ.map((v, i) => (
                  <td key={mesesJ[i]} className="px-2 py-2 text-right text-[12.5px]" title={moeda(v)}>{moedaCompacta(v).replace("R$ ", "")}</td>
                ))}
              </tr>
              <tr className="border-t border-gray-100 text-gray-500">
                <td className="sticky left-0 z-10 bg-white px-3 py-2">Realizado (Senior)</td>
                <td className="px-3 py-2 text-right" title={moeda(totalRealizadoJ)}>{realizado.carregando ? "…" : moedaCompacta(totalRealizadoJ)}</td>
                {realizadoJ.map((v, i) => (
                  <td key={mesesJ[i]} className="px-2 py-2 text-right text-[12.5px]" title={v === null ? "sem dado" : moeda(v)}>{v === null ? <span className="text-gray-300">–</span> : moedaCompacta(v).replace("R$ ", "")}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Cartao>

      <DetalheP0 alvo={alvo} onFechar={() => setAlvo(null)} />
    </div>
  );
}
