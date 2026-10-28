"use client";

// A folha de um centro de custo num mes: quem compoe o total, pessoa a pessoa, com cada componente (folha e provisoes). Usada na gaveta da visao geral e no detalhe do centro.

import { useEffect, useMemo, useState } from "react";
import { mesLongo, moeda, moedaSemSimbolo } from "@/lib/custos/formato";
import { COMPONENTES, GRUPOS_COMPONENTE, totalComProLabore, somarComponentes, zerar, type ComponenteId, type Componentes } from "@/lib/custoPessoal/componentes";
import { nomeBonito, situacaoTexto, tomDaSituacao } from "@/lib/custoPessoal/formato";

export type PessoaDaFolha = {
  mes: string; matricula: string; nome: string; cargo: string | null; situacao: string | null; dataSituacao: string | null; admissao: string | null; origemCc: string | null; salarioBase: number;
  total: number; totalComProLabore: number;
} & Componentes;

const CURTO: Record<ComponenteId, string> = { liquido: "Líquido", rescisao: "Rescisão", inss: "INSS", fgts: "FGTS", irrf: "IRRF", provFerias: "Férias", provTerco: "1/3 de férias", prov13: "13º", provInss: "INSS s/ prov.", provFgts: "FGTS s/ prov.", proLabore: "Pró-labore" };

const SELO = { neutro: "bg-gray-100 text-gray-600", aviso: "bg-amber-100 text-amber-800", alerta: "bg-red-100 text-red-700" } as const;

// De onde veio o centro de custo do mes, quando nao e' o historico do Senior sem mais (origemCc = historico_hcm).
const ORIGEM_DO_CENTRO: Record<string, { rotulo: string; ajuda: string }> = {
  distribuido_nucleo: { rotulo: "distribuído", ajuda: "Até fevereiro todo o pessoal ADM ficava no centro único ADM; o custo foi distribuído para o núcleo em que a pessoa está desde março." },
  confirmado_joao: { rotulo: "centro confirmado", ajuda: "Centro de custo confirmado pelo João (o cadastro do Senior indica outro)." },
};

export function usePessoasDoCentro(ccu: string, mes: string | null) {
  const [dados, setDados] = useState<PessoaDaFolha[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    if (!mes) return;
    const controller = new AbortController();
    setDados(null);
    setErro(null);
    fetch(`/api/custo-pessoal/pessoas?ccu=${encodeURIComponent(ccu)}&mes=${encodeURIComponent(mes)}`, { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (!r.ok) return setErro(j.error || "Não foi possível carregar a folha.");
        setDados(j.pessoas as PessoaDaFolha[]);
      })
      .catch(() => !controller.signal.aborted && setErro("Não foi possível carregar a folha."));
    return () => controller.abort();
  }, [ccu, mes]);
  return { dados, erro };
}

export default function FolhaDoCentro({ ccu, mes }: { ccu: string; mes: string }) {
  const { dados, erro } = usePessoasDoCentro(ccu, mes);
  const total = useMemo(() => (dados ?? []).reduce<Componentes>((s, p) => somarComponentes(s, p), zerar()), [dados]);
  const temProLabore = (dados ?? []).some((p) => p.proLabore > 0);
  const colunas = COMPONENTES.filter((c) => c.id !== "proLabore" || temProLabore);
  const nFolha = colunas.filter((c) => c.grupo === "folha").length;
  const nProv = colunas.filter((c) => c.grupo === "provisoes").length;

  if (erro) return <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  if (!dados) return <div className="h-40 animate-pulse rounded-xl bg-gray-100" aria-busy />;
  if (dados.length === 0) return <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">Nenhuma pessoa com folha em {mesLongo(mes)} neste centro de custo.</p>;

  const celula = (v: number, id: ComponenteId) => (
    <td key={id} className={`whitespace-nowrap px-2.5 py-2 text-right tabular-nums ${v ? "text-gray-800" : "text-gray-300"}`}>{v ? moedaSemSimbolo(v) : "–"}</td>
  );
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-100">
      <table className="w-full min-w-[980px] text-[13px]">
        <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
          <tr>
            <th rowSpan={2} className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left align-bottom">Pessoa</th>
            {nFolha > 0 && <th colSpan={nFolha} className="border-b border-gray-200 px-2 py-1 text-center" style={{ color: GRUPOS_COMPONENTE[0].cor }}>Folha</th>}
            {nProv > 0 && <th colSpan={nProv} className="border-b border-l border-gray-200 px-2 py-1 text-center" style={{ color: GRUPOS_COMPONENTE[1].cor }}>Provisões do mês</th>}
            {temProLabore && <th rowSpan={2} className="border-l border-gray-200 px-2.5 py-2 text-right align-bottom" style={{ color: GRUPOS_COMPONENTE[2].cor }}>Pró-labore</th>}
            <th rowSpan={2} className="border-l border-gray-200 px-3 py-2 text-right align-bottom">Total</th>
          </tr>
          <tr>
            {colunas.filter((c) => c.grupo !== "prolabore").map((c) => (
              <th key={c.id} title={c.ajuda} className={`px-2.5 py-1.5 text-right font-medium normal-case tracking-normal ${c.id === "provFerias" ? "border-l border-gray-200" : ""}`}>{CURTO[c.id]}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {dados.map((p) => {
            const sit = situacaoTexto(p.situacao, p.dataSituacao);
            return (
              <tr key={p.matricula} className="border-t border-gray-100 hover:bg-gray-50/60">
                <td className="sticky left-0 z-10 bg-white px-3 py-2">
                  <p className="font-medium text-gray-900">{nomeBonito(p.nome)}</p>
                  <p className="text-[12px] text-gray-500">
                    {[nomeBonito(p.cargo), `mat. ${p.matricula}`].filter(Boolean).join(" · ")}
                    {sit && <span className={`ml-2 rounded-full px-2 py-0.5 text-[11px] font-medium ${SELO[tomDaSituacao(p.situacao)]}`}>{sit}</span>}
                    {p.origemCc && ORIGEM_DO_CENTRO[p.origemCc] && <span title={ORIGEM_DO_CENTRO[p.origemCc].ajuda} className="ml-2 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-medium text-teal-800">{ORIGEM_DO_CENTRO[p.origemCc].rotulo}</span>}
                  </p>
                </td>
                {colunas.map((c) => (c.grupo === "prolabore" ? null : <td key={c.id} className={`whitespace-nowrap px-2.5 py-2 text-right tabular-nums ${p[c.id] ? "text-gray-800" : "text-gray-300"} ${c.id === "provFerias" ? "border-l border-gray-100" : ""}`}>{p[c.id] ? moedaSemSimbolo(p[c.id]) : "–"}</td>))}
                {temProLabore && <td className={`whitespace-nowrap border-l border-gray-100 px-2.5 py-2 text-right tabular-nums ${p.proLabore ? "text-gray-800" : "text-gray-300"}`}>{p.proLabore ? moedaSemSimbolo(p.proLabore) : "–"}</td>}
                <td className="whitespace-nowrap border-l border-gray-100 px-3 py-2 text-right font-semibold tabular-nums text-gray-900" title={moeda(p.totalComProLabore)}>{moedaSemSimbolo(p.totalComProLabore)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
            <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">{dados.length} {dados.length === 1 ? "pessoa" : "pessoas"}</td>
            {colunas.map((c) => (c.grupo === "prolabore" ? null : celula(total[c.id], c.id)))}
            {temProLabore && <td className="whitespace-nowrap border-l border-gray-200 px-2.5 py-2 text-right tabular-nums">{moedaSemSimbolo(total.proLabore)}</td>}
            <td className="whitespace-nowrap border-l border-gray-200 px-3 py-2 text-right tabular-nums" title={moeda(totalComProLabore(total))}>{moedaSemSimbolo(totalComProLabore(total))}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
