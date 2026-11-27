"use client";

// Aba P0 > Receita: o previsto de faturamento do contrato, mes a mes, vindo da planilha de medicoes da area. Mostra so' o PREVISTO: o
// realizado de faturamento entra aqui quando a medicao/NF do periodo estiver disponivel pra comparacao. Nunca se mistura com o custo.

import { useMemo, useState } from "react";
import { serieDaConta, soma } from "@/lib/custos/agregacao";
import { mesCurto, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { mesesEntre, type P0Custos } from "@/lib/p0/montar";
import { Cartao, Kpi } from "@/components/custos/ui";
import { Sparkline, estiloCelulaCalor } from "@/components/custos/graficos";
import GraficoPrevistoRealizado, { LegendaPrevistoRealizado } from "./GraficoPrevistoRealizado";
import PeriodoP0 from "./PeriodoP0";
import { useP0Custos } from "./useP0Custos";

export default function P0ReceitaContrato({ codccu }: { codccu: string }) {
  const estado = useP0Custos(codccu, "receita");
  if (estado.estado === "carregando") return <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" aria-busy />;
  if (estado.estado === "erro") return <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{estado.mensagem}</div>;
  if (estado.estado === "sem") {
    return (
      <Cartao titulo="P0 de receita" subtitulo="O que o contrato prevÃª faturar, mÃªs a mÃªs, pela planilha de mediÃ§Ãµes">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-9 text-center">
          <p className="text-base font-medium text-gray-700">Este contrato nÃ£o tem receita no P0.</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-500">Quando o P0 do contrato tiver a previsÃ£o de faturamento cadastrada, ela aparece aqui, mÃªs a mÃªs. Nada Ã© estimado nem preenchido automaticamente.</p>
        </div>
      </Cartao>
    );
  }
  return <VisaoReceita p0={estado.p0} />;
}

function VisaoReceita({ p0 }: { p0: P0Custos }) {
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
      <Cartao titulo="P0 de receita" subtitulo={`Faturamento previsto no P0 Â· ${mesCurto(p0.mesIni)} a ${mesCurto(p0.mesFim)} Â· ${mesesP.length} meses`}>
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-[13.5px] text-amber-900">
          Aqui aparece sÃ³ o <b className="font-semibold">previsto</b>, direto da planilha de mediÃ§Ãµes da Ã¡rea. O realizado de faturamento entra quando a mediÃ§Ã£o/NF do perÃ­odo estiver disponÃ­vel para comparaÃ§Ã£o, sempre no mesmo perÃ­odo do P0.
        </p>
        {p0.origem && <p className="mt-3 text-[12px] leading-snug text-gray-400">Fonte: {p0.origem}</p>}
      </Cartao>

      <PeriodoP0 meses={mesesP} de={de} ate={ate} mesCorrente={mesCorrente} onMudar={(d, a) => { setDeEsc(d); setAteEsc(a); }} />

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi rotulo={mesesJ.length === mesesP.length ? "Previsto de receita no P0" : "Previsto de receita no perÃ­odo"} valor={moedaCompacta(totalJ)} detalhe={`${linhas.length} ${linhas.length === 1 ? "linha" : "linhas"} Â· ${mesesJ.length} ${mesesJ.length === 1 ? "mÃªs" : "meses"}`} destaque lateral={<Sparkline valores={previstoJ} largura={132} altura={30} />} />
        <Kpi rotulo="MÃ©dia por mÃªs" valor={moedaCompacta(mesesJ.length ? totalJ / mesesJ.length : 0)} detalhe="previsto de receita no perÃ­odo" />
        <Kpi rotulo="Maior linha" valor={<span className="block truncate text-lg">{maior ? maior.conta.contaFinanceira : "â€”"}</span>} detalhe={maior && totalJ ? `${moedaCompacta(maior.total)} Â· ${percentual(maior.total / totalJ, 0)} do previsto` : undefined} />
      </div>

      <Cartao titulo="Previsto de receita, mÃªs a mÃªs" subtitulo="O que o P0 prevÃª faturar em cada mÃªs do perÃ­odo">
        <div className="mb-3">
          <LegendaPrevistoRealizado modo="mensal" temRealizado={false} />
        </div>
        <GraficoPrevistoRealizado meses={mesesJ} previsto={previstoJ} realizado={mesesJ.map(() => null)} mesCorrente={mesCorrente} modo="mensal" />
      </Cartao>

      <Cartao titulo="Receita Ã— mÃªs (P0 de receita)" subtitulo="O previsto de faturamento em cada mÃªs do perÃ­odo">
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[640px] text-[13px] tabular-nums">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Linha</th>
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
                    <td key={mesesJ[i]} className="px-1 py-1" title={`${l.conta.contaFinanceira} Â· ${mesCurto(mesesJ[i])}: ${moeda(v)} previsto`}>
                      {v ? <span className="block rounded-md px-1.5 py-1 text-right text-[12.5px]" style={estiloCelulaCalor(v, maxCelula)}>{moedaCompacta(v).replace("R$ ", "")}</span> : <span className="block px-1.5 py-1 text-right text-gray-300">â€“</span>}
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
