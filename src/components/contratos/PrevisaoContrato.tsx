"use client";

// Aba Previsao do contrato: tudo que o Senior ja tem PREVISTO (titulos em aberto) para este centro de custo, separado por categoria.
// Somente leitura. Nao e' realizado: o que ja foi pago fica na aba Custos.

import { useEffect, useState } from "react";
import { moeda, moedaCompacta, mesCurto } from "@/lib/custos/formato";

type Titulo = { numTit: string; tipo: string; fornecedorNome: string | null; descricao: string | null; numOcp: string | null; numNfc: string | null; vencimento: string; valorAberto: number };
type Grupo = { chave: string; rotulo: string; descricao: string; total: number; quantidade: number; vencidos: number; depois: number; porMes: Record<string, number>; titulos: Titulo[]; titulosOcultos: number };
type Resposta = { codccu: string; hoje: string; meses: string[]; grupos: Grupo[]; total: number; quantidade: number; semVencimento: number };

// na matriz os valores vao sem "R$" (a legenda diz que e em reais) para caber os 12 meses sem rolagem
const celula = (v: number) => (v > 0.004 ? moedaCompacta(v).replace("R$ ", "") : "–");
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const COR: Record<string, string> = { RECORRENTE: "bg-violet-500", VEICULO: "bg-sky-500", TI: "bg-teal-500", AQUISICAO: "bg-amber-500", DEMAIS: "bg-gray-400" };

export default function PrevisaoContrato({ codccu }: { codccu: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    setDados(null); setErro(null);
    fetch(`/api/contratos/${encodeURIComponent(codccu)}/previsao`)
      .then(async (r) => { const j = await r.json(); if (!r.ok) throw new Error(j.error || "Não foi possível carregar a previsão."); return j as Resposta; })
      .then((j) => { if (vivo) setDados(j); })
      .catch((e) => { if (vivo) setErro(e.message); });
    return () => { vivo = false; };
  }, [codccu]);

  if (erro) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  if (!dados) return <div className="rounded-xl border border-gray-100 bg-white px-5 py-10 text-center text-sm text-gray-500">Lendo a previsão do Senior…</div>;

  const comDados = dados.grupos.filter((g) => g.quantidade > 0);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13.5px] text-sky-900">
        Previsão = títulos <strong>em aberto</strong> do Senior neste centro de custo (CCU {codccu}), por data de vencimento. Não é custo realizado: o que já foi pago está na aba Custos. Nada aqui é digitado: tudo vem do Senior.
      </div>

      {dados.quantidade === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-9 text-center">
          <p className="text-base font-medium text-gray-700">Nenhum título em aberto para este centro de custo.</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-500">{dados.semVencimento > 0 ? `${dados.semVencimento} título(s) em aberto estão sem data de vencimento válida no Senior e por isso não entram na previsão.` : "Quando o Senior tiver previsões ou títulos a vencer neste CCU, eles aparecem aqui, separados por categoria."}</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {dados.grupos.map((g) => (
              <button key={g.chave} type="button" onClick={() => g.quantidade > 0 && setAberto(aberto === g.chave ? null : g.chave)} disabled={g.quantidade === 0}
                className={`rounded-2xl border bg-white p-4 text-left shadow-soft transition ${aberto === g.chave ? "border-brand" : "border-gray-100"} ${g.quantidade > 0 ? "hover:border-brand/40" : "opacity-60"}`}>
                <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${COR[g.chave]}`} /><h3 className="text-[13.5px] font-semibold text-gray-900">{g.rotulo}</h3></div>
                <p className="mt-2 text-xl font-semibold tabular-nums text-gray-900">{moedaCompacta(g.total)}</p>
                <p className="text-xs text-gray-500">{g.quantidade} título{g.quantidade === 1 ? "" : "s"}{g.vencidos > 0 ? ` · ${moedaCompacta(g.vencidos)} vencido` : ""}</p>
              </button>
            ))}
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
            <header className="mb-3"><h2 className="text-base font-semibold text-gray-900">Previsão mês a mês</h2><p className="mt-0.5 text-[13px] text-gray-500">Valor em aberto por mês de vencimento, em reais (mil = milhares). “Vencido” é o que já passou da data e continua em aberto.</p></header>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[1000px] text-[13px] tabular-nums">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">Categoria</th>
                    <th className="px-3 py-2 text-right">Vencido</th>
                    {dados.meses.map((m) => <th key={m} className="px-3 py-2 text-right">{mesCurto(m)}</th>)}
                    <th className="px-3 py-2 text-right">Depois</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {comDados.map((g) => (
                    <tr key={g.chave} className="border-t border-gray-100">
                      <td className="whitespace-nowrap px-3 py-2 text-left font-medium text-gray-800"><span className={`mr-2 inline-block h-2 w-2 rounded-full ${COR[g.chave]}`} />{g.rotulo}</td>
                      <td className={`whitespace-nowrap px-3 py-2 text-right ${g.vencidos > 0 ? "text-red-700" : "text-gray-300"}`}>{celula(g.vencidos)}</td>
                      {dados.meses.map((m) => <td key={m} className={`whitespace-nowrap px-3 py-2 text-right ${g.porMes[m] > 0 ? "text-gray-800" : "text-gray-300"}`}>{celula(g.porMes[m])}</td>)}
                      <td className={`whitespace-nowrap px-3 py-2 text-right ${g.depois > 0 ? "text-gray-800" : "text-gray-300"}`}>{celula(g.depois)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-900">{celula(g.total)}</td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-gray-200 bg-gray-50/70 font-semibold">
                    <td className="px-3 py-2 text-left text-gray-900">Total previsto</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-red-700">{celula(comDados.reduce((s, g) => s + g.vencidos, 0))}</td>
                    {dados.meses.map((m) => <td key={m} className="whitespace-nowrap px-3 py-2 text-right text-gray-900">{celula(comDados.reduce((s, g) => s + g.porMes[m], 0))}</td>)}
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900">{celula(comDados.reduce((s, g) => s + g.depois, 0))}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right text-gray-900">{celula(dados.total)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {dados.semVencimento > 0 && <p className="mt-2 text-xs text-gray-500">{dados.semVencimento} título(s) em aberto sem data de vencimento válida no Senior não entram nesta tabela.</p>}
          </section>

          {comDados.map((g) => (
            <section key={g.chave} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
              <button type="button" onClick={() => setAberto(aberto === g.chave ? null : g.chave)} className="flex w-full items-start justify-between gap-4 text-left">
                <div><h2 className="flex items-center gap-2 text-base font-semibold text-gray-900"><span className={`h-2.5 w-2.5 rounded-full ${COR[g.chave]}`} />{g.rotulo}<span className="text-[13px] font-normal text-gray-500">· {g.quantidade} título{g.quantidade === 1 ? "" : "s"} · {moeda(g.total)}</span></h2><p className="mt-0.5 text-[13px] text-gray-500">{g.descricao}</p></div>
                <span className="shrink-0 text-[13px] font-medium text-brand">{aberto === g.chave ? "recolher" : "ver títulos"}</span>
              </button>
              {aberto === g.chave && (
                <div className="mt-3 overflow-x-auto rounded-xl border border-gray-100">
                  <table className="w-full min-w-[760px] text-[13px]">
                    <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2">Fornecedor</th><th className="px-3 py-2">Título</th><th className="px-3 py-2">Descrição no Senior</th><th className="px-3 py-2 text-right">Valor em aberto</th></tr></thead>
                    <tbody>
                      {g.titulos.map((t, i) => (
                        <tr key={`${t.numTit}-${i}`} className="border-t border-gray-100 align-top">
                          <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${t.vencimento < dados.hoje ? "text-red-700" : "text-gray-800"}`}>{dataBr(t.vencimento)}{t.vencimento < dados.hoje && <span className="ml-1 text-[11px]">vencido</span>}</td>
                          <td className="px-3 py-2 text-gray-800">{t.fornecedorNome ?? "—"}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-gray-600">{t.numTit}{t.numOcp ? <span className="ml-1 text-xs text-gray-400">OC {t.numOcp}</span> : null}</td>
                          <td className="max-w-[320px] px-3 py-2 text-gray-500">{t.descricao ?? ""}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-gray-900">{moeda(t.valorAberto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {g.titulosOcultos > 0 && <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">Mostrando os {g.titulos.length} de vencimento mais próximo; mais {g.titulosOcultos} títulos entram nos totais acima.</p>}
                </div>
              )}
            </section>
          ))}

          <p className="text-xs text-gray-400">As categorias de veículos e computadores/TI são reconhecidas por palavras do nome do fornecedor ou da descrição lançada no Senior; o que não for reconhecido fica em “Demais títulos em aberto”, sem forçar classificação.</p>
        </>
      )}
    </div>
  );
}
