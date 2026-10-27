"use client";

// Aba P0 > Custos pessoais: o previsto de salario CLT, encargos, ferias, 13o e provisoes do P0 do contrato, mes a mes. Mostra so' o PREVISTO: o realizado de
// pessoal entra aqui quando a aba "Custo de pessoal" estiver validada ao centavo contra o Senior. Nunca se mistura com o custo de contrato.

import { useMemo, useState } from "react";
import { serieDaConta, soma } from "@/lib/custos/agregacao";
import { mesCurto, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { mesesEntre, type P0Custos } from "@/lib/p0/montar";
import { Cartao, Kpi } from "@/components/custos/ui";
import { Sparkline, estiloCelulaCalor } from "@/components/custos/graficos";
import GraficoPrevistoRealizado, { LegendaPrevistoRealizado } from "./GraficoPrevistoRealizado";
import PeriodoP0 from "./PeriodoP0";
import { useP0Custos } from "./useP0Custos";

export default function P0PessoaisContrato({ codccu }: { codccu: string }) {
  const estado = useP0Custos(codccu, "pessoal");
  if (estado.estado === "carregando") return <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" aria-busy />;
  if (estado.estado === "erro") return <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{estado.mensagem}</div>;
  if (estado.estado === "sem") {
    return (
      <Cartao titulo="P0 de custos pessoais" subtitulo="Salários CLT, encargos, férias, 13º e provisões previstos, mês a mês">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-9 text-center">
          <p className="text-base font-medium text-gray-700">Este contrato não tem custos pessoais no P0.</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-500">Quando o P0 do contrato tiver salários, encargos, férias, 13º ou provisões, eles aparecem aqui, separados do custo de contrato. Nada é estimado nem preenchido automaticamente.</p>
        </div>
      </Cartao>
    );
  }
  return <VisaoPessoal p0={estado.p0} />;
}

function VisaoPessoal({ p0 }: { p0: P0Custos }) {
  const mesesP = useMemo(() => mesesEntre(p0.mesIni, p0.mesFim), [p0.mesIni, p0.mesFim]);
  const [deEsc, setDeEsc] = useState<string | null>(null);
  const [ateEsc, setAteEsc] = useState<string | null>(null);
  const mesAtual = new Date().toISOString().slice(0, 7);
  const mesCorrente = mesesP.includes(mesAtual) ? mesAtual : "";

  const de = deEsc && mesesP.includes(deEsc) ? deEsc : mesesP[0];
  const ateBruto = ateEsc && mesesP.includes(ateEsc) ? ateEsc : mesesP[mesesP.length - 1];
  const ate = ateBruto < de ? de : ateBruto;
  const mesesJ = useMemo(() => mesesP.slice(mesesP.indexOf(de), mesesP.indexOf(ate) + 1), [mesesP, de, ate]);

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
  const totalJ = soma(previstoJ);
  const maxCelula = Math.max(1, ...linhas.flatMap((l) => l.serie.map((v) => Math.abs(v))));
  const maior = linhas[0] ?? null;

  return (
    <div className="space-y-5">
      <Cartao titulo="P0 de custos pessoais" subtitulo={`Salários CLT, encargos, férias, 13º e provisões previstos no P0 · ${mesCurto(p0.mesIni)} a ${mesCurto(p0.mesFim)} · ${mesesP.length} meses`}>
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
          Aqui aparece só o <b className="font-semibold">previsto</b>. O realizado de pessoal entra quando a aba Custo de pessoal estiver validada ao centavo contra o Senior, e será comparado com este P0, sempre separado do custo de contrato.
        </p>
        {p0.origem && <p className="mt-3 text-[12px] leading-snug text-gray-400">Fonte: {p0.origem}</p>}
      </Cartao>

      <PeriodoP0 meses={mesesP} de={de} ate={ate} mesCorrente={mesCorrente} onMudar={(d, a) => { setDeEsc(d); setAteEsc(a); }} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi rotulo={mesesJ.length === mesesP.length ? "Previsto de pessoal no P0" : "Previsto de pessoal no período"} valor={moedaCompacta(totalJ)} detalhe={`${linhas.length} ${linhas.length === 1 ? "conta" : "contas"} · ${mesesJ.length} ${mesesJ.length === 1 ? "mês" : "meses"}`} destaque lateral={<Sparkline valores={previstoJ} largura={132} altura={30} />} />
        <Kpi rotulo="Média por mês" valor={moedaCompacta(mesesJ.length ? totalJ / mesesJ.length : 0)} detalhe="previsto de pessoal no período" />
        <Kpi rotulo="Maior conta" valor={<span className="block truncate text-lg">{maior ? maior.conta.contaFinanceira : "—"}</span>} detalhe={maior && totalJ ? `${moedaCompacta(maior.total)} · ${percentual(maior.total / totalJ, 0)} do previsto` : undefined} />
      </div>

      <Cartao titulo="Previsto de pessoal, mês a mês" subtitulo="O que o P0 prevê de custos pessoais em cada mês do período">
        <div className="mb-3">
          <LegendaPrevistoRealizado modo="mensal" temRealizado={false} />
        </div>
        <GraficoPrevistoRealizado meses={mesesJ} previsto={previstoJ} realizado={mesesJ.map(() => null)} mesCorrente={mesCorrente} modo="mensal" />
      </Cartao>

      <Cartao titulo="Contas × mês (P0 de pessoal)" subtitulo="O previsto de cada conta em cada mês do período">
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[640px] text-[13px] tabular-nums">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Conta</th>
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
                      {v ? <span className="block rounded-md px-1.5 py-1 text-right text-[12.5px]" style={estiloCelulaCalor(v, maxCelula)}>{moedaCompacta(v).replace("R$ ", "")}</span> : <span className="block px-1.5 py-1 text-right text-gray-300">–</span>}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 bg-gray-50/70 font-semibold text-gray-900">
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Total</td>
                <td className="px-3 py-2 text-right" title={moeda(totalJ)}>{moedaCompacta(totalJ)}</td>
                {previstoJ.map((v, i) => (
                  <td key={mesesJ[i]} className="px-2 py-2 text-right text-[12.5px]" title={moeda(v)}>{moedaCompacta(v).replace("R$ ", "")}</td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </Cartao>
    </div>
  );
}
