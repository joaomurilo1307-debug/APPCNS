"use client";

// Receita e Medicao: os contratos que tem linhas contratadas no Senior, com quanto ja foi medido, quanto falta (saldo) e os ultimos meses.
// Clicar num contrato abre a medicao linha a linha. Tudo vem do Senior (somente leitura).

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { mesCurto, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";

type Contrato = {
  numCtr: string; numOfi: string; codccu: string | null; ccuNome: string | null; maisDeUmCcu: boolean;
  valorContratado: number; valorMedido: number; saldo: number; pct: number;
  ultimoMes: { mes: string; valor: number } | null; serie: { mes: string; valor: number }[];
};
type Resposta = {
  hoje: string; mesAtual: string; contratos: Contrato[]; totais: { contratado: number; medido: number };
  atualizacao: { emCurso: { etapa: string | null; progresso: number } | null; ultimaOk: string | null; erro: string | null };
};

const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");

function Barrinhas({ serie }: { serie: { mes: string; valor: number }[] }) {
  const max = Math.max(1, ...serie.map((s) => s.valor));
  return (
    <svg viewBox="0 0 96 28" className="h-7 w-24" role="img" aria-label="Medição dos últimos 12 meses">
      {serie.map((s, i) => {
        const h = s.valor > 0 ? Math.max(2, (s.valor / max) * 26) : 0;
        return <rect key={s.mes} x={i * 8 + 1} y={27 - h} width={6} height={h} rx={1.5} className={i === serie.length - 1 ? "fill-teal-400" : "fill-teal-600"}><title>{`${mesCurto(s.mes)}: ${moeda(s.valor)}`}</title></rect>;
      })}
      <line x1={0} x2={96} y1={27.5} y2={27.5} className="stroke-gray-200" />
    </svg>
  );
}

export default function MedicaoLista() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"saldo" | "pct" | "nome" | "ultimo">("saldo");
  const [soComSaldo, setSoComSaldo] = useState(true);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/medicao", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Não foi possível carregar a medição."); return; }
    setDados(j); setErro(null);
    return j as Resposta;
  }, []);

  useEffect(() => { void carregar(); }, [carregar]);
  // enquanto a leitura do Senior roda, acompanha ate terminar
  useEffect(() => {
    if (!dados?.atualizacao.emCurso && !atualizando) return;
    const t = setInterval(async () => { const j = await carregar(); if (j && !j.atualizacao.emCurso) setAtualizando(false); }, 5000);
    return () => clearInterval(t);
  }, [dados?.atualizacao.emCurso, atualizando, carregar]);

  async function atualizar() {
    setAtualizando(true);
    await fetch("/api/medicao/atualizar", { method: "POST" });
    void carregar();
  }

  const lista = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    let l = dados.contratos.filter((c) => (!q || `${c.numOfi} ${c.ccuNome ?? ""} ${c.codccu ?? ""}`.toLowerCase().includes(q)) && (!soComSaldo || c.saldo > 0.5));
    const by: Record<string, (a: Contrato, b: Contrato) => number> = {
      saldo: (a, b) => b.saldo - a.saldo, pct: (a, b) => b.pct - a.pct,
      nome: (a, b) => (a.ccuNome ?? a.numOfi).localeCompare(b.ccuNome ?? b.numOfi, "pt-BR"), ultimo: (a, b) => (b.ultimoMes?.mes ?? "").localeCompare(a.ultimoMes?.mes ?? ""),
    };
    return [...l].sort(by[ordem]);
  }, [dados, busca, ordem, soComSaldo]);

  if (erro && !dados) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  if (!dados) return <div className="py-10 text-center text-sm text-gray-500">Lendo a medição dos contratos…</div>;

  const em = dados.atualizacao.emCurso;
  const saldoTotal = dados.totais.contratado - dados.totais.medido;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-600 shadow-soft">
        <span>
          {em ? <>Lendo o Senior: <b>{em.etapa}</b> ({em.progresso}%)</> : <>Dados do Senior de <b>{hora(dados.atualizacao.ultimaOk)}</b>. A medição de cada contrato vem dos pedidos de venda; o saldo, do contrato.</>}
          {dados.atualizacao.erro && !em && <span className="ml-2 text-red-700">A última atualização falhou: {dados.atualizacao.erro}</span>}
        </span>
        <button type="button" onClick={atualizar} disabled={!!em || atualizando} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{em || atualizando ? "Atualizando…" : "Atualizar do Senior"}</button>
      </div>

      {dados.contratos.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-10 text-center text-sm text-gray-600">{em ? "A primeira leitura da medição está em andamento. Esta tela se atualiza sozinha." : "Nenhum contrato com medição nos centros de custo que você acompanha ainda."}</div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { t: "Contratos com medição", v: String(dados.contratos.length), s: "com linhas contratadas no Senior" },
              { t: "Contratado", v: moedaCompacta(dados.totais.contratado), s: "soma das linhas dos contratos" },
              { t: "Medido acumulado", v: moedaCompacta(dados.totais.medido), s: dados.totais.contratado > 0 ? `${percentual(dados.totais.medido / dados.totais.contratado)} do contratado` : "" },
              { t: "Saldo a medir", v: moedaCompacta(saldoTotal), s: "contratado menos medido" },
            ].map((k) => (
              <div key={k.t} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
                <p className="text-[13px] font-medium text-gray-500">{k.t}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{k.v}</p>
                <p className="text-xs text-gray-400">{k.s}</p>
              </div>
            ))}
          </div>

          <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
            <header className="mb-3 flex flex-wrap items-center gap-2">
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contrato, centro de custo ou número" className="min-w-[260px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Ordenar">
                <option value="saldo">Maior saldo primeiro</option>
                <option value="pct">Mais medido primeiro</option>
                <option value="ultimo">Medição mais recente</option>
                <option value="nome">Nome</option>
              </select>
              <label className="flex items-center gap-2 text-[13px] text-gray-600"><input type="checkbox" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} /> Só com saldo</label>
            </header>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[980px] text-[13.5px] tabular-nums">
                <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                  <tr><th className="px-3 py-2 text-left">Contrato</th><th className="px-3 py-2 text-right">Contratado</th><th className="px-3 py-2 text-right">Medido</th><th className="px-3 py-2 text-right">Saldo</th><th className="w-44 px-3 py-2 text-left">Consumido</th><th className="px-3 py-2 text-left">Último mês medido</th><th className="px-3 py-2 text-left">12 meses</th></tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.numCtr} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-left">
                        <Link href={`/medicao/${c.numCtr}`} className="font-medium text-gray-900 hover:text-brand">{c.ccuNome ?? c.numOfi}</Link>
                        <div className="text-xs text-gray-400">{c.codccu ? `CCU ${c.codccu} · ` : "Sem centro de custo identificado · "}Senior: {c.numOfi}{c.maisDeUmCcu ? " · itens em mais de um CC" : ""}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-700">{moedaCompacta(c.valorContratado)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-700">{moedaCompacta(c.valorMedido)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-900">{moedaCompacta(c.saldo)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2"><div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-2 ${c.pct >= 0.95 ? "bg-amber-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, c.pct * 100)}%` }} /></div><span className="w-10 text-right text-xs text-gray-500">{percentual(c.pct)}</span></div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-left text-gray-600">{c.ultimoMes ? <>{mesCurto(c.ultimoMes.mes)} · {moedaCompacta(c.ultimoMes.valor)}</> : <span className="text-gray-300">sem medição</span>}</td>
                      <td className="px-3 py-2.5"><Barrinhas serie={c.serie} /></td>
                    </tr>
                  ))}
                  {lista.length === 0 && <tr><td colSpan={7} className="px-3 py-8 text-center text-gray-400">Nenhum contrato com esses filtros.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
