"use client";

// Lista COMPLETA do que variou de um mes para o outro, conta a conta: o que mais subiu, o que mais caiu, o que entrou de novo (nao tinha custo
// no mes anterior) e o que zerou. O mes e' o mesmo da ponte (clique numa barra de variacao ou escolha aqui). So' dado do Senior.

import { useMemo, useState } from "react";
import type { LinhaConta } from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { SeloReembolsavel } from "./ui";
import { Cartao } from "./ui";

type Filtro = "todas" | "subiu" | "caiu" | "nova" | "zerou";
type Status = Exclude<Filtro, "todas">;

export default function VariacaoPorConta({
  linhas,
  mesesAsc,
  iMes,
  mesesEscolha,
  onMes,
}: {
  linhas: LinhaConta[]; // series completas (alinhadas a mesesAsc)
  mesesAsc: string[];
  iMes: number; // indice do mes analisado em mesesAsc (precisa ser > 0)
  mesesEscolha: string[]; // meses que podem ser escolhidos (do periodo, exceto o primeiro)
  onMes: (mes: string) => void;
}) {
  const [filtro, setFiltro] = useState<Filtro>("todas");
  const [todas, setTodas] = useState(false);

  const itens = useMemo(() => {
    const out: { nome: string; reemb: boolean; ant: number; atual: number; delta: number; pct: number | null; status: Status }[] = [];
    for (const l of linhas) {
      const ant = l.serie[iMes - 1] ?? 0;
      const atual = l.serie[iMes] ?? 0;
      const delta = atual - ant;
      if (Math.abs(delta) < 0.005) continue;
      const status: Status = ant === 0 && atual > 0 ? "nova" : atual === 0 && ant > 0 ? "zerou" : delta > 0 ? "subiu" : "caiu";
      out.push({ nome: l.conta.contaFinanceira, reemb: l.conta.reembolsavel, ant, atual, delta, pct: ant ? delta / Math.abs(ant) : null, status });
    }
    return out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  }, [linhas, iMes]);

  const conta = (s: Status) => itens.filter((i) => i.status === s).length;
  const visiveis = itens.filter((i) => filtro === "todas" || i.status === filtro);
  const mostrados = todas ? visiveis : visiveis.slice(0, 15);
  const maxAbs = Math.max(1, ...itens.map((i) => Math.abs(i.delta)));
  const totalAlta = itens.filter((i) => i.delta > 0).reduce((s, i) => s + i.delta, 0);
  const totalQueda = itens.filter((i) => i.delta < 0).reduce((s, i) => s + i.delta, 0);
  const selo: Record<Status, { t: string; c: string }> = {
    nova: { t: "Entrou", c: "bg-violet-100 text-violet-800" },
    zerou: { t: "Zerou", c: "bg-slate-200 text-slate-700" },
    subiu: { t: "Subiu", c: "bg-red-100 text-red-700" },
    caiu: { t: "Caiu", c: "bg-emerald-100 text-emerald-800" },
  };
  const abas: [Filtro, string, number][] = [
    ["todas", "Todas", itens.length],
    ["subiu", "Subiram", conta("subiu")],
    ["caiu", "Caíram", conta("caiu")],
    ["nova", "Entraram", conta("nova")],
    ["zerou", "Zeraram", conta("zerou")],
  ];

  return (
    <Cartao
      titulo={`O que variou de ${mesCurto(mesesAsc[iMes - 1])} para ${mesCurto(mesesAsc[iMes])}`}
      subtitulo={`Todas as contas que mudaram de um mês para o outro, da maior variação para a menor · ${mesLongo(mesesAsc[iMes - 1])} contra ${mesLongo(mesesAsc[iMes])}`}
      acao={
        <label className="flex items-center gap-1.5 text-[13px] text-gray-600">
          Mês
          <select value={mesesAsc[iMes]} onChange={(e) => onMes(e.target.value)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-[13px] focus:border-brand focus:outline-none">
            {mesesEscolha.map((m) => (
              <option key={m} value={m}>
                {mesLongo(m).replace(" de ", " ")}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <div className="mb-3 grid grid-cols-2 gap-2 text-[13px] sm:grid-cols-4">
        <div className="rounded-xl bg-red-50 px-3 py-2">
          <p className="text-red-700">Subiu no total</p>
          <p className="text-lg font-semibold tabular-nums text-red-700">+{moedaCompacta(totalAlta)}</p>
        </div>
        <div className="rounded-xl bg-emerald-50 px-3 py-2">
          <p className="text-emerald-800">Caiu no total</p>
          <p className="text-lg font-semibold tabular-nums text-emerald-800">{moedaCompacta(totalQueda)}</p>
        </div>
        <div className="rounded-xl bg-violet-50 px-3 py-2">
          <p className="text-violet-800">Contas que entraram</p>
          <p className="text-lg font-semibold tabular-nums text-violet-800">{conta("nova")}</p>
        </div>
        <div className="rounded-xl bg-slate-100 px-3 py-2">
          <p className="text-slate-700">Contas que zeraram</p>
          <p className="text-lg font-semibold tabular-nums text-slate-700">{conta("zerou")}</p>
        </div>
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        {abas.map(([k, nome, n]) => (
          <button key={k} type="button" onClick={() => setFiltro(k)} className={`rounded-full border px-3 py-1 text-[13px] font-medium transition ${filtro === k ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
            {nome} <span className="opacity-70">{n}</span>
          </button>
        ))}
      </div>

      {mostrados.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500">Nenhuma conta nesta situação neste mês.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-[14px]">
            <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-2">Conta</th>
                <th className="px-3 py-2 text-center">Situação</th>
                <th className="px-3 py-2 text-right">{mesCurto(mesesAsc[iMes - 1])}</th>
                <th className="px-3 py-2 text-right">{mesCurto(mesesAsc[iMes])}</th>
                <th className="px-3 py-2 text-right">Variação</th>
                <th className="hidden px-3 py-2 md:table-cell">Tamanho da mudança</th>
              </tr>
            </thead>
            <tbody>
              {mostrados.map((i, k) => (
                <tr key={i.nome} className={k % 2 ? "bg-gray-50/60" : undefined}>
                  <td className="px-3 py-1.5 font-medium text-gray-800">
                    {i.nome} {i.reemb && <SeloReembolsavel curto />}
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${selo[i.status].c}`}>{selo[i.status].t}</span>
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-500">{i.ant ? moeda(i.ant) : "–"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums text-gray-800">{i.atual ? moeda(i.atual) : "–"}</td>
                  <td className={`px-3 py-1.5 text-right font-semibold tabular-nums ${i.delta > 0 ? "text-red-600" : "text-emerald-700"}`}>
                    {i.delta > 0 ? "+" : "−"}
                    {moeda(Math.abs(i.delta))}
                    <span className="ml-1 text-xs font-normal text-gray-400">{i.pct === null ? "" : `(${i.pct > 0 ? "+" : "−"}${percentual(Math.abs(i.pct), Math.abs(i.pct) < 0.1 ? 1 : 0)})`}</span>
                  </td>
                  <td className="hidden px-3 py-1.5 md:table-cell">
                    <div className="h-2 w-40 rounded-full bg-gray-100">
                      <div className="h-full rounded-full" style={{ width: `${Math.max(3, (Math.abs(i.delta) / maxAbs) * 100)}%`, background: i.delta > 0 ? "#e5675f" : "#0e9f94" }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {visiveis.length > 15 && (
        <button type="button" onClick={() => setTodas((t) => !t)} className="mt-2 text-[13px] font-medium text-brand hover:text-brand-dark">
          {todas ? "mostrar só as 15 maiores" : `mostrar as ${visiveis.length} contas`}
        </button>
      )}
    </Cartao>
  );
}
