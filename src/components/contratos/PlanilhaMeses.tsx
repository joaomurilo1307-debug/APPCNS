"use client";

// "Planilha" mes a mes da Previsao: linhas (linha de custo, centro de custo, categoria ou fornecedor) x meses. Cada linha abre nos fornecedores
// que a compoem (e mostra o que e' previsao fixa ou variavel); clicar numa celula abre os lancamentos daquela linha naquele mes.
// Soma-se ao grafico e a tabela mes a mes; nao substitui nenhum deles. Pode ser baixada em CSV (abre no Excel).

import { useMemo, useState } from "react";
import { mesCurto, mesLongo, moeda, moedaCompacta } from "@/lib/custos/formato";

export type LinhaPlan = {
  chave: string; rotulo: string; total: number; programado: number; previsto: number; qtd: number; antes: number; depois: number; semData: number;
  porMes: Record<string, number>; tipoValor?: "FIXO" | "VARIAVEL" | null; filhos?: LinhaPlan[];
};
export type DadosPlanilha = { dim: string; filhoDim: string; meses: string[]; linhas: LinhaPlan[]; totais: LinhaPlan; truncadas: number };
export type CelulaSel = { grupo: string; filho: string | null; mes: string } | null;

const DIMS: { chave: string; rotulo: string }[] = [
  { chave: "conta", rotulo: "Linha de custo" },
  { chave: "ccu", rotulo: "Centro de custo" },
  { chave: "categoria", rotulo: "Categoria" },
  { chave: "fornecedor", rotulo: "Fornecedor / previsão" },
];
const ROTULO_FILHO: Record<string, string> = { conta: "linha de custo", fornecedor: "fornecedor ou previsão" };

const valor = (v: number | undefined) => (v && Math.abs(v) > 0.004 ? moedaCompacta(v).replace("R$ ", "") : "");
const csvNumero = (v: number) => String(Math.round(v * 100) / 100).replace(".", ",");
const csvTexto = (s: string) => `"${s.replace(/"/g, '""')}"`;

function Natureza({ l }: { l: LinhaPlan }) {
  if (l.previsto > 0.004 && l.programado <= 0.004) return <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-800">previsto</span>;
  if (l.programado > 0.004 && l.previsto <= 0.004) return <span className="rounded-full bg-teal-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-teal-800">programado</span>;
  if (l.programado > 0.004 && l.previsto > 0.004) return <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-600">misto</span>;
  return null;
}

export default function PlanilhaMeses({ dados, dim, onDim, onCelula, selecionada, esconderCcu }: { dados: DadosPlanilha; dim: string; onDim: (d: string) => void; onCelula: (grupo: string, filho: string | null, mes: string) => void; selecionada: CelulaSel; esconderCcu?: boolean }) {
  const [abertas, setAbertas] = useState<Set<string>>(new Set());
  const dims = DIMS.filter((d) => !(esconderCcu && d.chave === "ccu"));
  const temAntes = dados.totais.antes > 0.004, temDepois = dados.totais.depois > 0.004, temSemData = dados.totais.semData > 0.004;
  const maxCel = useMemo(() => Math.max(1, ...dados.linhas.flatMap((l) => dados.meses.map((m) => l.porMes[m] ?? 0))), [dados]);
  const alternar = (k: string) => setAbertas((a) => { const n = new Set(a); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  const todasAbertas = dados.linhas.every((l) => !l.filhos?.length || abertas.has(l.chave));

  const colunasFaixa: { id: "antes" | "depois" | "sem_data"; titulo: string; pega: (l: LinhaPlan) => number }[] = [
    ...(temAntes ? [{ id: "antes" as const, titulo: "Antes", pega: (l: LinhaPlan) => l.antes }] : []),
    ...(temDepois ? [{ id: "depois" as const, titulo: "Depois", pega: (l: LinhaPlan) => l.depois }] : []),
    ...(temSemData ? [{ id: "sem_data" as const, titulo: "Sem data", pega: (l: LinhaPlan) => l.semData }] : []),
  ];

  function baixarCsv() {
    const cab = [DIMS.find((d) => d.chave === dim)?.rotulo ?? "Linha", "Item", "Total no período", ...(temAntes ? ["Antes do período"] : []), ...dados.meses.map((m) => mesLongo(m)), ...(temDepois ? ["Depois do período"] : []), ...(temSemData ? ["Sem data"] : [])];
    const linha = (rot: string, item: string, l: LinhaPlan) => [csvTexto(rot), csvTexto(item), csvNumero(l.total), ...(temAntes ? [csvNumero(l.antes)] : []), ...dados.meses.map((m) => csvNumero(l.porMes[m] ?? 0)), ...(temDepois ? [csvNumero(l.depois)] : []), ...(temSemData ? [csvNumero(l.semData)] : [])].join(";");
    const out: string[] = [cab.map(csvTexto).join(";")];
    for (const l of dados.linhas) {
      out.push(linha(l.rotulo, "(total da linha)", l));
      for (const c of l.filhos ?? []) out.push(linha(l.rotulo, c.rotulo + (c.tipoValor ? ` [${c.tipoValor === "FIXO" ? "valor fixo" : "valor variável"}]` : ""), c));
    }
    out.push(linha("TOTAL", "", dados.totais));
    const blob = new Blob(["﻿" + out.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `previsao-mes-a-mes-${dados.meses[0]}-a-${dados.meses[dados.meses.length - 1]}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const celula = (l: LinhaPlan, m: string, filho: string | null, grupo: string, nivel2: boolean) => {
    const v = l.porMes[m] ?? 0;
    const ativa = selecionada && selecionada.grupo === grupo && (selecionada.filho ?? null) === filho && selecionada.mes === m;
    const a = v > 0.004 ? Math.min(0.5, 0.06 + (v / maxCel) * 0.44) : 0;
    return (
      <td key={m} className="p-0 text-right">
        {v > 0.004 ? (
          <button type="button" onClick={() => onCelula(grupo, filho, m)} title={`${l.rotulo} · ${mesLongo(m)}: ${moeda(v)}. Clique para ver os lançamentos.`}
            className={`block w-full whitespace-nowrap px-2.5 py-1.5 text-right hover:outline hover:outline-1 hover:outline-teal-600 ${ativa ? "outline outline-2 outline-teal-700" : ""} ${nivel2 ? "text-gray-600" : "text-gray-900"}`}
            style={{ backgroundColor: nivel2 ? `rgba(13,148,136,${a * 0.6})` : `rgba(13,148,136,${a})` }}>{valor(v)}</button>
        ) : <span className="block px-2.5 py-1.5 text-gray-200">·</span>}
      </td>
    );
  };

  const faixa = (l: LinhaPlan, f: (typeof colunasFaixa)[number], filho: string | null, grupo: string) => {
    const v = f.pega(l);
    return <td key={f.id} className="p-0 text-right">{v > 0.004 ? <button type="button" onClick={() => onCelula(grupo, filho, f.id)} className="block w-full whitespace-nowrap px-2.5 py-1.5 text-right text-gray-600 hover:bg-gray-100" title={`Clique para ver os lançamentos (${f.titulo.toLowerCase()})`}>{valor(v)}</button> : <span className="block px-2.5 py-1.5 text-gray-200">·</span>}</td>;
  };

  return (
    <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
      <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-gray-900">Planilha mês a mês</h2>
          <p className="mt-0.5 max-w-3xl text-[13px] text-gray-500">Cada linha em cada mês, em reais (mil = milhares). Clique na seta para abrir a linha e ver {ROTULO_FILHO[dados.filhoDim] ?? "o que a compõe"}, e clique num valor para ver os lançamentos daquele mês. Vale o período e os filtros escolhidos acima.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1.5 text-[13px] text-gray-500">Agrupar por
            <select value={dim} onChange={(e) => onDim(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] text-gray-800">
              {dims.map((d) => <option key={d.chave} value={d.chave}>{d.rotulo}</option>)}
            </select>
          </label>
          <button type="button" onClick={() => setAbertas(todasAbertas ? new Set() : new Set(dados.linhas.filter((l) => l.filhos?.length).map((l) => l.chave)))} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">{todasAbertas ? "Recolher tudo" : "Abrir tudo"}</button>
          <button type="button" onClick={baixarCsv} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">Baixar planilha (CSV)</button>
        </div>
      </header>

      <div className="max-h-[75vh] overflow-auto rounded-xl border border-gray-100">
        <table className="w-full border-separate border-spacing-0 text-[12.5px] tabular-nums">
          <thead>
            <tr>
              <th className="sticky left-0 top-0 z-30 min-w-[260px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">{DIMS.find((d) => d.chave === dim)?.rotulo}</th>
              <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Total</th>
              {temAntes && <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-red-600" title="Antes do período escolhido (em atraso, se o período começa no mês atual)">Antes</th>}
              {dados.meses.map((m) => <th key={m} className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{mesCurto(m)}</th>)}
              {temDepois && <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Depois</th>}
              {temSemData && <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Sem data</th>}
            </tr>
          </thead>
          <tbody>
            {dados.linhas.map((l) => {
              const aberta = abertas.has(l.chave);
              const temFilhos = !!l.filhos?.length && l.chave !== "_demais";
              return (
                <FragmentoLinha key={l.chave}>
                  <tr className="group">
                    <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-1.5 text-left group-hover:bg-gray-50">
                      <button type="button" onClick={() => temFilhos && alternar(l.chave)} disabled={!temFilhos} aria-expanded={aberta} className="flex w-full items-center gap-2 text-left disabled:cursor-default">
                        <span className={`inline-block w-3 text-gray-400 ${temFilhos ? "" : "opacity-0"}`}>{aberta ? "▾" : "▸"}</span>
                        <span className="font-medium text-gray-800">{l.rotulo}</span>
                        <Natureza l={l} />
                        <span className="ml-auto text-[11px] font-normal text-gray-400">{l.qtd}</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1.5 text-right font-semibold text-gray-900">{valor(l.total)}</td>
                    {temAntes && faixa(l, colunasFaixa.find((c) => c.id === "antes")!, null, l.chave)}
                    {dados.meses.map((m) => celula(l, m, null, l.chave, false))}
                    {temDepois && faixa(l, colunasFaixa.find((c) => c.id === "depois")!, null, l.chave)}
                    {temSemData && faixa(l, colunasFaixa.find((c) => c.id === "sem_data")!, null, l.chave)}
                  </tr>
                  {aberta && temFilhos && l.filhos!.map((c) => (
                    <tr key={`${l.chave}>${c.chave}`} className="bg-gray-50/60">
                      <td className="sticky left-0 z-10 border-b border-gray-100 bg-gray-50 px-3 py-1 pl-9 text-left text-gray-600">
                        <span className="flex items-center gap-2"><span className="line-clamp-1" title={c.rotulo}>{c.rotulo}</span><Natureza l={c} />{c.tipoValor && <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${c.tipoValor === "FIXO" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"}`}>{c.tipoValor === "FIXO" ? "valor fixo" : "valor variável"}</span>}<span className="ml-auto text-[11px] text-gray-400">{c.qtd}</span></span>
                      </td>
                      <td className="whitespace-nowrap border-b border-gray-100 px-2.5 py-1 text-right text-gray-700">{valor(c.total)}</td>
                      {temAntes && faixa(c, colunasFaixa.find((x) => x.id === "antes")!, c.chave, l.chave)}
                      {dados.meses.map((m) => celula(c, m, c.chave, l.chave, true))}
                      {temDepois && faixa(c, colunasFaixa.find((x) => x.id === "depois")!, c.chave, l.chave)}
                      {temSemData && faixa(c, colunasFaixa.find((x) => x.id === "sem_data")!, c.chave, l.chave)}
                    </tr>
                  ))}
                </FragmentoLinha>
              );
            })}
            <tr className="font-semibold">
              <td className="sticky bottom-0 left-0 z-20 border-t-2 border-gray-200 bg-gray-50 px-3 py-2 text-left text-gray-900">Total</td>
              <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-gray-900">{valor(dados.totais.total)}</td>
              {temAntes && <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-red-700">{valor(dados.totais.antes)}</td>}
              {dados.meses.map((m) => <td key={m} className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-gray-900">{valor(dados.totais.porMes[m])}</td>)}
              {temDepois && <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-gray-900">{valor(dados.totais.depois)}</td>}
              {temSemData && <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2.5 py-2 text-right text-gray-900">{valor(dados.totais.semData)}</td>}
            </tr>
          </tbody>
        </table>
      </div>
      {dados.truncadas > 0 && <p className="mt-2 text-xs text-gray-500">Mostrando as {dados.linhas.length - 1} maiores linhas; as outras {dados.truncadas} estão somadas em “Demais”. Use os filtros para vê-las.</p>}
    </section>
  );
}

// <tr> irmaos sem elemento extra no meio da tabela
function FragmentoLinha({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
