"use client";

// Receita e Medicao: os contratos que tem linhas contratadas no Senior e ja tem medicao, com o consumo por VALOR e por QUANTIDADE lado a lado, o saldo e
// os ultimos meses. Clicar num contrato abre a medicao linha a linha. Tudo vem do Senior (somente leitura).

import Link from "next/link";
import FiltroContratos from "@/components/FiltroContratos";
import { useCallback, useEffect, useMemo, useState } from "react";
import { mesCurto, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import BotaoExcel from "@/components/BotaoExcel";
import type { AbaExcel } from "@/lib/exportarExcel";

type Contrato = {
  numCtr: string; numOfi: string; codccu: string | null; ccuNome: string | null; maisDeUmCcu: boolean;
  valorContratado: number; valorMedido: number; saldo: number; pct: number; pctFisico: number; nLinhas: number; linhasEsgotadas: number; linhasAcima80: number; temMedicao: boolean;
  ultimoMes: { mes: string; valor: number } | null; serie: { mes: string; valor: number }[];
};
type Resposta = {
  hoje: string; mesAtual: string; contratos: Contrato[]; semMedicao: number; incluiuSemMedicao: boolean; totais: { contratado: number; medido: number };
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

function Consumo({ valor, fisico }: { valor: number; fisico: number }) {
  return (
    <div className="w-44 space-y-1">
      {([["Valor", valor, "bg-teal-600"], ["Qtd.", fisico, "bg-indigo-500"]] as const).map(([r, v, cor]) => (
        <div key={r} className="flex items-center gap-2" title={r === "Valor" ? `Consumo por valor: ${percentual(v, 1)} do contratado` : `Consumo por quantidade: ${percentual(v, 1)} (ponderado pelo valor das linhas)`}>
          <span className="w-9 text-[11px] text-gray-400">{r}</span>
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-1.5 ${v >= 0.95 ? "bg-amber-500" : cor}`} style={{ width: `${Math.min(100, v * 100)}%` }} /></div>
          <span className="w-9 text-right text-[11px] tabular-nums text-gray-600">{Math.round(v * 100)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function MedicaoLista() {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"saldo" | "valor" | "fisico" | "gap" | "ultimo" | "nome">("saldo");
  const [soComSaldo, setSoComSaldo] = useState(true);
  const [incluirSem, setIncluirSem] = useState(false);
  const [atualizando, setAtualizando] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/medicao${incluirSem ? "?todos=1" : ""}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErro(j.error || "Não foi possível carregar a medição."); return; }
    setDados(j); setErro(null);
    return j as Resposta;
  }, [incluirSem]);

  useEffect(() => { void carregar(); }, [carregar]);
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
    const l = dados.contratos.filter((c) => (!q || `${c.numOfi} ${c.ccuNome ?? ""} ${c.codccu ?? ""}`.toLowerCase().includes(q)) && (!soComSaldo || c.saldo > 0.5));
    const by: Record<string, (a: Contrato, b: Contrato) => number> = {
      saldo: (a, b) => b.saldo - a.saldo, valor: (a, b) => b.pct - a.pct, fisico: (a, b) => b.pctFisico - a.pctFisico,
      gap: (a, b) => Math.abs(b.pctFisico - b.pct) - Math.abs(a.pctFisico - a.pct),
      nome: (a, b) => (a.ccuNome ?? a.numOfi).localeCompare(b.ccuNome ?? b.numOfi, "pt-BR"), ultimo: (a, b) => (b.ultimoMes?.mes ?? "").localeCompare(a.ultimoMes?.mes ?? ""),
    };
    return [...l].sort(by[ordem]);
  }, [dados, busca, ordem, soComSaldo]);

  if (erro && !dados) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  if (!dados) return (
    <div className="space-y-4" aria-busy>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200/70" />)}</div>
      <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" />
    </div>
  );

  const em = dados.atualizacao.emCurso;
  const saldoTotal = dados.totais.contratado - dados.totais.medido;
  const pctTotal = dados.totais.contratado > 0 ? dados.totais.medido / dados.totais.contratado : 0;

  // planilha da lista que esta na tela (busca, "so com saldo" e ordem): consumo por valor e por quantidade, saldo e os ultimos 12 meses
  function abasExcel(): AbaExcel[] {
    const meses = (lista[0] ?? dados!.contratos[0])?.serie.map((s) => s.mes) ?? [];
    return [{
      nome: "Medição por contrato",
      observacao: `Receita e Medição · dados do Senior de ${hora(dados!.atualizacao.ultimaOk)}${soComSaldo ? " · só contratos com saldo a medir" : ""}${busca.trim() ? ` · busca: ${busca.trim()}` : ""}`,
      colunas: [
        { titulo: "Contrato", largura: 22 }, { titulo: "Centro de custo", largura: 36 }, { titulo: "CCU", largura: 8 }, { titulo: "Contratado", tipo: "moeda" }, { titulo: "Medido acumulado", tipo: "moeda" }, { titulo: "Saldo a medir", tipo: "moeda" },
        { titulo: "Consumo por valor", tipo: "percentual" }, { titulo: "Consumo por quantidade", tipo: "percentual" }, { titulo: "Linhas", tipo: "inteiro" }, { titulo: "Linhas esgotadas", tipo: "inteiro" }, { titulo: "Linhas acima de 80%", tipo: "inteiro" },
        { titulo: "Último mês medido", largura: 16 }, { titulo: "Valor do último mês", tipo: "moeda" },
        ...meses.map((m) => ({ titulo: `Medido ${mesCurto(m)}`, tipo: "moeda" as const })),
      ],
      linhas: lista.map((c) => [
        c.numOfi, c.ccuNome ?? "", c.codccu ?? "", c.valorContratado, c.valorMedido, c.saldo, c.pct, c.pctFisico, c.nLinhas, c.linhasEsgotadas, c.linhasAcima80,
        c.ultimoMes ? mesCurto(c.ultimoMes.mes) : "", c.ultimoMes?.valor ?? null, ...meses.map((_, i) => c.serie[i]?.valor ?? 0),
      ]),
      rodape: ["TOTAL", "", "", lista.reduce((s, c) => s + c.valorContratado, 0), lista.reduce((s, c) => s + c.valorMedido, 0), lista.reduce((s, c) => s + c.saldo, 0)],
    }];
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-[13px] text-gray-600 shadow-soft">
        <span>
          {em ? <>Lendo o Senior: <b>{em.etapa}</b> ({em.progresso}%)</> : <>Dados do Senior de <b>{hora(dados.atualizacao.ultimaOk)}</b>. O contratado e o saldo vêm do contrato; o medido de cada mês, dos pedidos de venda.</>}
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
              { t: "Contratos com medição", v: String(dados.contratos.length), s: dados.semMedicao > 0 ? `mais ${dados.semMedicao} com linhas, ainda sem medição` : "com linhas contratadas no Senior" },
              { t: "Contratado", v: moedaCompacta(dados.totais.contratado), s: "soma das linhas dos contratos" },
              { t: "Medido acumulado", v: moedaCompacta(dados.totais.medido), s: `${percentual(pctTotal, 1)} do contratado` },
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
              <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contrato, centro de custo ou número" className="min-w-[260px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" aria-label="Buscar contrato" />
              <FiltroContratos />
              <BotaoExcel arquivo="receita-e-medicao" gerar={abasExcel} desabilitado={lista.length === 0} />
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Ordenar">
                <option value="saldo">Maior saldo primeiro</option>
                <option value="valor">Mais consumido (valor)</option>
                <option value="fisico">Mais consumido (quantidade)</option>
                <option value="gap">Maior diferença valor × quantidade</option>
                <option value="ultimo">Medição mais recente</option>
                <option value="nome">Nome</option>
              </select>
              <label className="flex items-center gap-2 text-[13px] text-gray-600"><input type="checkbox" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} /> Só com saldo</label>
              {dados.semMedicao > 0 && <label className="flex items-center gap-2 text-[13px] text-gray-600"><input type="checkbox" checked={incluirSem} onChange={(e) => setIncluirSem(e.target.checked)} /> Incluir os {dados.semMedicao} sem medição</label>}
            </header>
            <div className="overflow-x-auto rounded-xl border border-gray-100">
              <table className="w-full min-w-[1080px] text-[13.5px] tabular-nums">
                <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                  <tr><th className="px-3 py-2 text-left">Contrato</th><th className="px-3 py-2 text-right">Contratado</th><th className="px-3 py-2 text-right">Medido</th><th className="px-3 py-2 text-right">Saldo</th><th className="px-3 py-2 text-left">Consumo</th><th className="px-3 py-2 text-left">Linhas</th><th className="px-3 py-2 text-left">Última medição</th><th className="px-3 py-2 text-left">12 meses</th></tr>
                </thead>
                <tbody>
                  {lista.map((c) => (
                    <tr key={c.numCtr} className="border-t border-gray-100 hover:bg-gray-50/70">
                      <td className="px-3 py-2.5 text-left">
                        <Link href={`/medicao/${c.numCtr}`} className="font-medium text-gray-900 hover:text-brand">{c.ccuNome ?? c.numOfi}</Link>
                        <div className="text-xs text-gray-400">{c.codccu ? `CCU ${c.codccu}` : "Sem centro de custo identificado"} · Senior: {c.numOfi}{c.maisDeUmCcu ? " · itens em mais de um CC" : ""}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-700">{moedaCompacta(c.valorContratado)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right text-gray-700">{moedaCompacta(c.valorMedido)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right font-semibold text-gray-900">{moedaCompacta(c.saldo)}</td>
                      <td className="px-3 py-2.5"><Consumo valor={c.pct} fisico={c.pctFisico} /></td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-left text-xs text-gray-500">{c.nLinhas} linhas{c.linhasEsgotadas > 0 && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 font-semibold text-amber-800">{c.linhasEsgotadas} esgotadas</span>}{c.linhasAcima80 > 0 && <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 font-semibold text-gray-600">{c.linhasAcima80} &gt; 80%</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-left text-gray-600">{c.ultimoMes ? <>{mesCurto(c.ultimoMes.mes)} · {moedaCompacta(c.ultimoMes.valor)}</> : <span className="text-gray-300">sem medição</span>}</td>
                      <td className="px-3 py-2.5"><Barrinhas serie={c.serie} /></td>
                    </tr>
                  ))}
                  {lista.length === 0 && <tr><td colSpan={8} className="px-3 py-10 text-center text-gray-400">Nenhum contrato com esses filtros.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="mt-2 flex flex-wrap gap-4 text-xs text-gray-400"><span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-teal-600" /> Valor: medido ÷ contratado</span><span className="flex items-center gap-1.5"><span className="h-2 w-4 rounded-sm bg-indigo-500" /> Quantidade: média das linhas, ponderada pelo valor contratado</span></p>
          </section>
        </>
      )}
    </div>
  );
}
