"use client";

// Financeiro > Previsao: tudo que o Senior tem PREVISTO (titulos em aberto), separado por centro de custo.
// Somente leitura. Clicar num centro de custo abre o detalhe (categorias, mes a mes e titulos). O realizado fica em "Custo por Centro de Custo".

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import PrevisaoContrato from "@/components/contratos/PrevisaoContrato";
import { moeda, moedaCompacta } from "@/lib/custos/formato";

type Linha = { codccu: string; nome: string; total: number; quantidade: number; vencidos: number; porCategoria: Record<string, number> };
type Resp = { hoje: string; categorias: { chave: string; rotulo: string }[]; linhas: Linha[]; semVencimento: number };

const SEM_CC = "_sem_cc";
const COR: Record<string, string> = { RECORRENTE: "bg-violet-500", VEICULO: "bg-sky-500", TI: "bg-teal-500", AQUISICAO: "bg-amber-500", DEMAIS: "bg-gray-400" };
const celula = (v: number | undefined) => (v && v > 0.004 ? moedaCompacta(v).replace("R$ ", "") : "–");

export default function PrevisaoPage() {
  const [dados, setDados] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [aberto, setAberto] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/previsao", { cache: "no-store" }).then(async (r) => {
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return setErro(j.error || "Não foi possível carregar a previsão.");
      setDados(j);
      // quem enxerga um unico centro de custo ja abre direto nele
      if (j.linhas.length === 1) setAberto(j.linhas[0].codccu);
    });
  }, []);

  const filtradas = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return q ? dados.linhas.filter((l) => l.codccu.toLowerCase().includes(q) || l.nome.toLowerCase().includes(q)) : dados.linhas;
  }, [dados, busca]);

  const totais = useMemo(() => {
    const t: Record<string, number> = {};
    let geral = 0, vencidos = 0;
    for (const l of dados?.linhas ?? []) {
      geral += l.total; vencidos += l.vencidos;
      for (const [k, v] of Object.entries(l.porCategoria)) t[k] = (t[k] ?? 0) + v;
    }
    return { porCategoria: t, geral, vencidos };
  }, [dados]);

  if (erro) return <div className="mx-auto max-w-3xl p-6"><div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div></div>;
  if (!dados) return <div className="mx-auto max-w-[1500px] p-6 text-sm text-gray-500">Lendo a previsão do Senior…</div>;

  const selecionada = dados.linhas.find((l) => l.codccu === aberto) ?? null;

  return (
    <div className="mx-auto max-w-[1500px] space-y-5 p-6">
      <header>
        <h1 className="text-2xl font-semibold text-gray-900">Previsão por centro de custo</h1>
        <p className="mt-1 max-w-3xl text-[14px] text-gray-500">Tudo o que o Senior tem previsto (títulos em aberto): despesas recorrentes, parcelas de veículos, parcelas de computadores e TI e aquisições, separado por centro de custo. É só leitura e não é custo realizado: o que já foi pago está em Custo por Centro de Custo.</p>
      </header>

      {dados.linhas.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-9 text-center text-sm text-gray-600">Nenhum título em aberto nos centros de custo que você acompanha.</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
              <p className="text-[13.5px] font-semibold text-gray-900">Total previsto</p>
              <p className="mt-2 text-xl font-semibold tabular-nums text-gray-900">{moedaCompacta(totais.geral)}</p>
              <p className="text-xs text-gray-500">{totais.vencidos > 0 ? `${moedaCompacta(totais.vencidos)} já vencido` : "nada vencido"}</p>
            </div>
            {dados.categorias.map((c) => (
              <div key={c.chave} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
                <div className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${COR[c.chave]}`} /><p className="text-[13.5px] font-semibold text-gray-900">{c.rotulo}</p></div>
                <p className="mt-2 text-xl font-semibold tabular-nums text-gray-900">{moedaCompacta(totais.porCategoria[c.chave] ?? 0)}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
            <header className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div><h2 className="text-base font-semibold text-gray-900">Por centro de custo</h2><p className="mt-0.5 text-[13px] text-gray-500">Valor em aberto por categoria, em reais (mil = milhares). Clique num centro de custo para ver o detalhe.</p></div>
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar centro de custo ou número" className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
            </header>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[900px] text-[13px] tabular-nums">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr>
                    <th className="px-3 py-2 text-left">CCU</th>
                    <th className="px-3 py-2 text-left">Centro de custo</th>
                    {dados.categorias.map((c) => <th key={c.chave} className="px-3 py-2 text-right"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${COR[c.chave]}`} />{c.rotulo.replace("Parcelas de ", "").replace("Despesas ", "").replace("Demais títulos em aberto", "Demais")}</th>)}
                    <th className="px-3 py-2 text-right">Vencido</th>
                    <th className="px-3 py-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {filtradas.map((l) => (
                    <tr key={l.codccu} onClick={() => setAberto(aberto === l.codccu ? null : l.codccu)} className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${aberto === l.codccu ? "bg-brand/5" : ""} ${l.codccu === SEM_CC ? "text-amber-900" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-2 text-left text-gray-500">{l.codccu === SEM_CC ? "—" : l.codccu}</td>
                      <td className="px-3 py-2 text-left font-medium text-gray-800">{l.nome}</td>
                      {dados.categorias.map((c) => <td key={c.chave} className={`whitespace-nowrap px-3 py-2 text-right ${l.porCategoria[c.chave] > 0.004 ? "text-gray-800" : "text-gray-300"}`}>{celula(l.porCategoria[c.chave])}</td>)}
                      <td className={`whitespace-nowrap px-3 py-2 text-right ${l.vencidos > 0.004 ? "text-red-700" : "text-gray-300"}`}>{celula(l.vencidos)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-900">{celula(l.total)}</td>
                    </tr>
                  ))}
                  {filtradas.length === 0 && <tr><td colSpan={dados.categorias.length + 4} className="px-3 py-6 text-center text-gray-400">Nenhum centro de custo encontrado.</td></tr>}
                </tbody>
              </table>
            </div>
            {dados.semVencimento > 0 && <p className="mt-2 text-xs text-gray-500">{dados.semVencimento} título(s) em aberto sem data de vencimento válida no Senior não entram nesta tabela.</p>}
          </section>

          {selecionada && (
            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-gray-900">{selecionada.codccu === SEM_CC ? selecionada.nome : `${selecionada.nome} · CCU ${selecionada.codccu}`}</h2>
                {selecionada.codccu !== SEM_CC && <Link href={`/contratos/${encodeURIComponent(selecionada.codccu)}`} className="text-[13px] font-medium text-brand hover:text-brand-dark">Abrir o contrato →</Link>}
              </div>
              <PrevisaoContrato codccu={selecionada.codccu} />
            </section>
          )}
          <p className="text-xs text-gray-400">{moeda(totais.geral)} em aberto no total listado. O centro de custo é o do próprio título no Senior ou, quando o título não traz, o da ordem de compra vinculada.</p>
        </>
      )}
    </div>
  );
}
