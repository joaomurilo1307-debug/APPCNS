"use client";

// Medicao de um contrato: cada linha com o contratado, o medido mes a mes, o medido acumulado e o saldo, em VALOR e em QUANTIDADE. A planilha por
// linha e' o centro da tela; clicar num valor abre os pedidos (e o boletim) daquela linha naquele mes. As colunas de P0 ficam reservadas: quando o P0
// do contrato for cadastrado, o previsto e o desvio entram aqui, ao lado do medido. Tudo do Senior, somente leitura.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SeletorPeriodo, { type Atalho } from "@/components/contratos/SeletorPeriodo";
import { BarrasPorMes, LinhaAcumulado, RankingConsumo } from "./GraficosMedicao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";

type Cel = { qtd: number; valor: number };
type Linha = {
  seqCvs: number; descricao: string; unidade: string | null; qtdContratada: number; precoUnit: number; valorContratado: number; qtdFaturada: number; valorFaturado: number;
  saldoQtd: number; saldoValor: number; pctValor: number; antes: Cel; depois: Cel; porMes: Record<string, Cel>; medidoQtd: number; medidoValor: number;
};
type MesTotal = { mes: string; qtd: number; valor: number; acumuladoValor: number; acumuladoPct: number; variacaoPct: number | null; boletins: string[] };
type ItemDrill = { seqCvs: number; numPed: string; seqIsp: number; dataEmissao: string; competencia: string; origem: string; boletim: string | null; pedCli: string | null; situacao: string | null; qtd: number; valor: number; codccu: string | null; linha: string };
type Resposta = {
  contrato: { numCtr: string; numOfi: string; codccu: string | null; ccuNome: string | null; inicio: string | null; valorContratado: number; valorMedido: number };
  mesAtual: string; periodo: { de: string; ate: string }; primeiroMes: string | null; ultimoMes: string | null;
  meses: string[]; linhas: Linha[];
  totais: { contratado: number; medido: number; saldo: number; pct: number; antes: number; depois: number; porMes: MesTotal[] };
  alertas: { mes: string; valor: number; mediaAnterior: number }[];
  drill: { itens: ItemDrill[]; total: Cel; qtdItens: number; pagina: number; paginas: number } | null;
  semCompetenciaConfiavel: number;
  outrosCentros: { codccu: string; nome: string; itens: number; valor: number }[];
  atualizadoEm: string | null;
};

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const qtdFmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const qtdCompacta = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : qtdFmt(v));
const horaBr = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const menos = (mes: string, n: number) => { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 - n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const csvNum = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");
const csvTxt = (s: string) => `"${s.replace(/"/g, '""')}"`;

export default function MedicaoDetalhe({ numCtr }: { numCtr: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const [modo, setModo] = useState<"valor" | "qtd">("valor");
  const [busca, setBusca] = useState("");
  const [soComMedicao, setSoComMedicao] = useState(false);
  const [soComSaldo, setSoComSaldo] = useState(false);
  const [sel, setSel] = useState<{ seq: number | null; mes: string | null } | null>(null);
  const [pagina, setPagina] = useState(1);
  const [linhaGrafico, setLinhaGrafico] = useState<number | null>(null);
  const ultima = useRef("");
  const detalheRef = useRef<HTMLElement | null>(null);

  const consulta = useCallback(() => {
    const p = new URLSearchParams();
    if (periodo) { p.set("de", periodo.de); p.set("ate", periodo.ate); }
    if (sel) { if (sel.seq !== null) p.set("linha", String(sel.seq)); if (sel.mes) p.set("mes", sel.mes); }
    if (pagina > 1) p.set("pagina", String(pagina));
    return p.toString();
  }, [periodo, sel, pagina]);

  useEffect(() => {
    const qs = consulta();
    ultima.current = qs;
    fetch(`/api/medicao/${encodeURIComponent(numCtr)}${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (ultima.current !== qs) return; if (!r.ok) throw new Error(j.error || "Não foi possível carregar a medição."); setDados(j); setErro(null); if (!periodo) setPeriodo(j.periodo); })
      .catch((e) => { if (ultima.current === qs) setErro(e.message); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta, numCtr]);

  useEffect(() => { if (sel && dados?.drill) detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [sel?.seq, sel?.mes, dados?.drill?.qtdItens]);

  const linhasVisiveis = useMemo(() => {
    if (!dados) return [];
    const q = busca.trim().toLowerCase();
    return dados.linhas.filter((l) => (!q || l.descricao.toLowerCase().includes(q) || String(l.seqCvs) === q)
      && (!soComMedicao || Object.values(l.porMes).some((c) => c.valor > 0 || c.qtd > 0))
      && (!soComSaldo || l.saldoValor > 0.5));
  }, [dados, busca, soComMedicao, soComSaldo]);

  if (erro && !dados) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro} <Link href="/medicao" className="ml-2 font-medium underline">Voltar</Link></div>;
  if (!dados) return <div className="py-10 text-center text-sm text-gray-500">Lendo a medição do contrato…</div>;

  const d = dados;
  const per = periodo ?? d.periodo;
  const unidadeUnica = new Set(d.linhas.map((l) => l.unidade ?? "")).size === 1;
  const ultimoFechado = [...d.totais.porMes].reverse().find((m) => m.mes < d.mesAtual && m.valor > 0) ?? null;
  const soma = d.totais.porMes.reduce((s, m) => s + m.valor, 0);
  const maxValor = Math.max(1e-9, ...d.linhas.flatMap((l) => d.meses.map((m) => l.porMes[m]?.valor ?? 0)));
  const maxDaLinha = (l: Linha) => Math.max(1e-9, ...d.meses.map((m) => l.porMes[m]?.qtd ?? 0));
  const seqGrafico = linhaGrafico ?? d.linhas.find((l) => d.meses.some((m) => (l.porMes[m]?.qtd ?? 0) > 0))?.seqCvs ?? d.linhas[0]?.seqCvs ?? null;
  const linhaDoGrafico = d.linhas.find((l) => l.seqCvs === seqGrafico) ?? null;
  const atalhos: Atalho[] = [
    { rotulo: "Últimos 12 meses", de: menos(d.mesAtual, 11), ate: d.mesAtual },
    { rotulo: `Ano ${d.mesAtual.slice(0, 4)}`, de: `${d.mesAtual.slice(0, 4)}-01`, ate: d.mesAtual },
    ...(d.primeiroMes ? [{ rotulo: "Tudo desde o início", de: d.primeiroMes, ate: d.mesAtual }] : []),
  ];
  const selecionarCelula = (seq: number | null, mes: string | null) => { setSel({ seq, mes }); setPagina(1); };

  function baixarCsv() {
    const un = modo === "valor";
    const cab = ["Linha", "Unidade", un ? "Contratado (R$)" : "Contratado (qtd)", "Antes do período", ...d.meses.map((m) => mesLongo(m)), un ? "Medido acumulado (R$)" : "Medido acumulado (qtd)", un ? "Saldo (R$)" : "Saldo (qtd)", "% consumido"];
    const linhas = d.linhas.map((l) => [csvTxt(l.descricao), csvTxt(l.unidade ?? ""), csvNum(un ? l.valorContratado : l.qtdContratada), csvNum(un ? l.antes.valor : l.antes.qtd), ...d.meses.map((m) => csvNum((un ? l.porMes[m]?.valor : l.porMes[m]?.qtd) ?? 0)), csvNum(un ? l.valorFaturado : l.qtdFaturada), csvNum(un ? l.saldoValor : l.saldoQtd), csvNum(l.pctValor * 100)].join(";"));
    const blob = new Blob(["﻿" + [cab.map(csvTxt).join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `medicao-${d.contrato.codccu ?? d.contrato.numCtr}-${modo === "valor" ? "valor" : "quantidade"}-${per.de}-a-${per.ate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const celulaDaLinha = (l: Linha, m: string) => {
    const c = l.porMes[m];
    const v = c ? (modo === "valor" ? c.valor : c.qtd) : 0;
    if (!(v > 0.0004)) return <td key={m} className="p-0 text-right"><span className="block px-2 py-1.5 text-gray-200">·</span></td>;
    const a = Math.min(0.5, 0.07 + (v / (modo === "valor" ? maxValor : maxDaLinha(l))) * 0.43);
    const ativa = sel?.seq === l.seqCvs && sel?.mes === m;
    return (
      <td key={m} className="p-0 text-right">
        <button type="button" onClick={() => selecionarCelula(l.seqCvs, m)} title={`${l.descricao} · ${mesLongo(m)}: ${moeda(c.valor)} · ${qtdFmt(c.qtd)} ${l.unidade ?? ""}. Clique para ver os pedidos.`}
          className={`block w-full whitespace-nowrap px-2 py-1.5 text-right text-gray-900 hover:outline hover:outline-1 hover:outline-teal-600 ${ativa ? "outline outline-2 outline-teal-700" : ""}`} style={{ backgroundColor: `rgba(13,148,136,${a})` }}>
          {modo === "valor" ? moedaCompacta(v).replace("R$ ", "") : qtdCompacta(v)}
        </button>
      </td>
    );
  };

  return (
    <div className="space-y-5">
      <header>
        <Link href="/medicao" className="text-[13px] font-medium text-brand hover:text-brand-dark">← Receita e Medição</Link>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">{d.contrato.ccuNome ?? d.contrato.numOfi}</h1>
        <p className="text-[13.5px] text-gray-500">{d.contrato.codccu ? `CCU ${d.contrato.codccu} · ` : "Sem centro de custo identificado · "}Contrato no Senior: {d.contrato.numOfi} (nº {d.contrato.numCtr}){d.contrato.inicio ? ` · início ${dataBr(d.contrato.inicio)}` : ""}</p>
      </header>
      {/* ---------------- avisos */}
      {d.alertas.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <b>Medição possivelmente não lançada no Senior:</b> {d.alertas.map((a) => `${mesLongo(a.mes)} (${moeda(a.valor)}, a média dos 3 meses anteriores é ${moedaCompacta(a.mediaAnterior)})`).join("; ")}. Vale conferir com o time de medição.
        </div>
      )}
      {d.outrosCentros.length > 0 && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-[13px] text-sky-900">
          Alguns itens deste contrato estão rateados, no pedido, para outro centro de custo: {d.outrosCentros.map((o) => `${o.nome} (${o.itens} item(ns), ${moeda(o.valor)})`).join("; ")}. Eles contam na medição do contrato; o centro de custo vem do rateio do pedido no Senior.
        </div>
      )}
      {d.semCompetenciaConfiavel > 0 && (
        <p className="text-xs text-gray-500">{d.semCompetenciaConfiavel} item(ns) não trazem o mês do boletim no pedido; para eles o mês é o da emissão menos 1 (regra do Rito), marcado como “emissão” no detalhe.</p>
      )}

      {/* ---------------- controles */}
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SeletorPeriodo de={per.de} ate={per.ate} mesAtual={d.mesAtual} modo="passado" atalhos={atalhos} onMudar={(de, ate) => { setPeriodo({ de, ate }); setSel(null); setPagina(1); }} />
          <div className="inline-flex rounded-lg border border-gray-200 p-0.5" role="group" aria-label="Ver em valor ou em quantidade">
            {([["valor", "Valor (R$)"], ["qtd", "Quantidade"]] as const).map(([k, r]) => (
              <button key={k} type="button" onClick={() => setModo(k)} aria-pressed={modo === k} className={`rounded-md px-4 py-1.5 text-[13px] font-medium transition ${modo === k ? "bg-teal-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}>{r}</button>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- resumo */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {(modo === "valor" ? [
          { t: "Contratado", v: moeda(d.totais.contratado), s: `${d.linhas.length} linhas no Senior` },
          { t: "Medido acumulado", v: moeda(d.totais.medido), s: `${percentual(d.totais.pct, 1)} do contratado` },
          { t: "Saldo a medir", v: moeda(d.totais.saldo), s: "contratado menos medido" },
          { t: ultimoFechado ? `Última medição (${mesCurto(ultimoFechado.mes)})` : "Última medição", v: ultimoFechado ? moeda(ultimoFechado.valor) : "—", s: ultimoFechado?.variacaoPct != null ? `${ultimoFechado.variacaoPct >= 0 ? "▲" : "▼"} ${percentual(Math.abs(ultimoFechado.variacaoPct), 1)} vs mês anterior` : ultimoFechado?.boletins.join(", ") || "" },
          { t: "Média por mês", v: moeda(d.meses.length ? soma / d.meses.length : 0), s: `no período (${d.meses.length} meses)` },
        ] : [
          { t: "Linhas do contrato", v: String(d.linhas.length), s: "com quantidade contratada" },
          { t: "Linhas esgotadas", v: String(d.linhas.filter((l) => l.saldoQtd <= 0.0005).length), s: "sem saldo de quantidade" },
          { t: "Linhas acima de 80%", v: String(d.linhas.filter((l) => l.qtdContratada > 0 && l.qtdFaturada / l.qtdContratada >= 0.8 && l.saldoQtd > 0.0005).length), s: "perto de esgotar a quantidade" },
          { t: "Linhas medidas no período", v: String(d.linhas.filter((l) => Object.values(l.porMes).some((c) => c.qtd > 0)).length), s: `de ${d.linhas.length}` },
          { t: "Linhas sem medição nenhuma", v: String(d.linhas.filter((l) => l.qtdFaturada <= 0).length), s: "ainda sem quantidade medida" },
        ]).map((k) => (
          <div key={k.t} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
            <p className="text-[13px] font-medium text-gray-500">{k.t}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{k.v}</p>
            <p className="text-xs text-gray-400">{k.s}</p>
          </div>
        ))}
      </div>

      {/* ---------------- graficos */}
      <section className="grid gap-5 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
          <h2 className="text-base font-semibold text-gray-900">{modo === "valor" ? "Medido por mês" : `Quantidade medida por mês${linhaDoGrafico ? "" : ""}`}</h2>
          {modo === "qtd" && (
            <label className="mt-1 flex items-center gap-2 text-[13px] text-gray-500">Linha
              <select value={seqGrafico ?? ""} onChange={(e) => setLinhaGrafico(Number(e.target.value))} className="max-w-[360px] rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13px] text-gray-800">
                {d.linhas.map((l) => <option key={l.seqCvs} value={l.seqCvs}>{l.descricao}{l.unidade ? ` (${l.unidade})` : ""}</option>)}
              </select>
            </label>
          )}
          <p className="mb-2 mt-0.5 text-[13px] text-gray-500">{modo === "valor" ? "Valor do contrato medido em cada mês (mês do boletim). Clique num mês para ver os pedidos." : `Quantidade medida em cada mês${linhaDoGrafico?.unidade ? ` (${linhaDoGrafico.unidade})` : ""}. Clique num mês para ver os pedidos desta linha.`}</p>
          <BarrasPorMes
            pontos={d.meses.map((m) => { const t = d.totais.porMes.find((x) => x.mes === m)!; return { mes: m, valor: modo === "valor" ? t.valor : linhaDoGrafico?.porMes[m]?.qtd ?? 0, rotulo: modo === "valor" ? t.boletins.join(", ") : undefined }; })}
            selecionado={sel?.mes ?? null} mesAtual={d.mesAtual} alertas={modo === "valor" ? d.alertas.map((a) => a.mes) : []}
            formato={(v) => (modo === "valor" ? moedaCompacta(v).replace("R$ ", "") : qtdCompacta(v))} titulo="Medição por mês"
            onSelecionar={(m) => selecionarCelula(modo === "qtd" ? seqGrafico : null, sel?.mes === m && (modo === "valor" || sel?.seq === seqGrafico) ? null : m)}
          />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
          {modo === "valor" ? (
            <>
              <h2 className="text-base font-semibold text-gray-900">Medido acumulado × contratado</h2>
              <p className="mb-2 mt-0.5 text-[13px] text-gray-500">Quanto do contrato já foi medido ao fim de cada mês; a linha tracejada é o valor contratado. O previsto (P0) entra aqui quando for cadastrado.</p>
              <LinhaAcumulado pontos={d.totais.porMes.map((m) => ({ mes: m.mes, acumulado: m.acumuladoValor }))} teto={d.totais.contratado} tituloTeto="Contratado" />
            </>
          ) : (
            <>
              <h2 className="text-base font-semibold text-gray-900">Quanto de cada linha já foi consumido</h2>
              <p className="mb-2 mt-0.5 text-[13px] text-gray-500">Quantidade medida em relação à contratada (as linhas mais consumidas primeiro). Clique numa linha para ver o gráfico dela.</p>
              <RankingConsumo selecionado={seqGrafico} onSelecionar={setLinhaGrafico}
                itens={[...d.linhas].filter((l) => l.qtdContratada > 0).sort((a, b) => b.qtdFaturada / b.qtdContratada - a.qtdFaturada / a.qtdContratada).slice(0, 12).map((l) => ({ chave: l.seqCvs, rotulo: l.descricao, pct: l.qtdFaturada / l.qtdContratada, detalhe: `${qtdFmt(l.qtdFaturada)} de ${qtdFmt(l.qtdContratada)} ${l.unidade ?? ""} · saldo ${qtdFmt(l.saldoQtd)}` }))} />
            </>
          )}
        </div>
      </section>

      {/* ---------------- planilha por linha */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Medição por linha do contrato · {modo === "valor" ? "em valor" : "em quantidade"}</h2>
            <p className="mt-0.5 max-w-3xl text-[13px] text-gray-500">Cada linha contratada no Senior: o que foi contratado, o que foi medido em cada mês, o medido acumulado e o saldo. Clique num valor para ver os pedidos daquele mês e no nome da linha para ver todos os dela.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar linha" className="w-48 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] outline-none focus:border-brand" />
            <label className="flex items-center gap-1.5 text-[13px] text-gray-600"><input type="checkbox" checked={soComMedicao} onChange={(e) => setSoComMedicao(e.target.checked)} /> Só com medição no período</label>
            <label className="flex items-center gap-1.5 text-[13px] text-gray-600"><input type="checkbox" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} /> Só com saldo</label>
            <button type="button" onClick={baixarCsv} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">Baixar (CSV)</button>
          </div>
        </header>
        <div className="max-h-[75vh] overflow-auto rounded-xl border border-gray-100">
          <table className="w-full border-separate border-spacing-0 text-[12.5px] tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 min-w-[250px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Linha</th>
                <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Contratado</th>
                <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500" title="Medido antes do período escolhido">Antes</th>
                {d.meses.map((m) => <th key={m} className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">{mesCurto(m)}</th>)}
                <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-900">Medido acum.</th>
                <th className="sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-900">Saldo</th>
                <th className="sticky top-0 z-20 min-w-[92px] border-b border-gray-200 bg-gray-50 px-2 py-2 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Consumido</th>
                <th className="sticky top-0 z-20 border-b border-dashed border-gray-300 bg-gray-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-gray-300" title="Quando o P0 do contrato for cadastrado, o previsto e o desvio aparecem aqui">P0 · desvio</th>
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((l) => {
                const contratado = modo === "valor" ? l.valorContratado : l.qtdContratada;
                const antes = modo === "valor" ? l.antes.valor : l.antes.qtd;
                const acum = modo === "valor" ? l.valorFaturado : l.qtdFaturada;
                const saldo = modo === "valor" ? l.saldoValor : l.saldoQtd;
                const pct = modo === "valor" ? l.pctValor : l.qtdContratada > 0 ? l.qtdFaturada / l.qtdContratada : 0;
                const f = (v: number) => (modo === "valor" ? moedaCompacta(v).replace("R$ ", "") : qtdCompacta(v));
                return (
                  <tr key={l.seqCvs} className="group">
                    <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-1.5 text-left group-hover:bg-gray-50">
                      <button type="button" onClick={() => selecionarCelula(l.seqCvs, null)} className="block w-full text-left" title="Ver todos os pedidos desta linha">
                        <span className="line-clamp-1 font-medium text-gray-800">{l.descricao}</span>
                        <span className="text-[11px] text-gray-400">linha {l.seqCvs}{l.unidade ? ` · ${l.unidade}` : ""}{modo === "valor" ? ` · ${moeda(l.precoUnit)}/un.` : ` · ${moeda(l.precoUnit)} por ${l.unidade ?? "un."}`}</span>
                      </button>
                    </td>
                    <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-right text-gray-700">{f(contratado)}</td>
                    <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-right text-gray-500">{antes > 0.0004 ? f(antes) : <span className="text-gray-200">·</span>}</td>
                    {d.meses.map((m) => celulaDaLinha(l, m))}
                    <td className="whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-right font-semibold text-gray-900" title={`Segundo os pedidos: ${moeda(l.medidoValor)} · ${qtdFmt(l.medidoQtd)}`}>{f(acum)}</td>
                    <td className={`whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-right font-semibold ${saldo <= 0.0005 ? "text-amber-700" : "text-gray-900"}`}>{f(saldo)}</td>
                    <td className="border-b border-gray-100 px-2 py-1.5"><div className="flex items-center gap-1.5"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-1.5 ${pct >= 0.95 ? "bg-amber-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, pct * 100)}%` }} /></div><span className="w-8 text-right text-[11px] text-gray-500">{Math.round(pct * 100)}%</span></div></td>
                    <td className="border-b border-dashed border-gray-200 px-2 py-1.5 text-right text-gray-200">—</td>
                  </tr>
                );
              })}
              {modo === "valor" && (
                <tr className="font-semibold">
                  <td className="sticky bottom-0 left-0 z-20 border-t-2 border-gray-200 bg-gray-50 px-3 py-2 text-left text-gray-900">Total do contrato</td>
                  <td className="sticky bottom-0 z-10 border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{moedaCompacta(d.totais.contratado).replace("R$ ", "")}</td>
                  <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right text-gray-500">{d.totais.antes > 0 ? moedaCompacta(d.totais.antes).replace("R$ ", "") : "·"}</td>
                  {d.meses.map((m) => { const t = d.totais.porMes.find((x) => x.mes === m)!; return <td key={m} className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{t.valor > 0 ? moedaCompacta(t.valor).replace("R$ ", "") : <span className="font-normal text-gray-300">·</span>}</td>; })}
                  <td className="sticky bottom-0 z-10 border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{moedaCompacta(d.totais.medido).replace("R$ ", "")}</td>
                  <td className="sticky bottom-0 z-10 border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{moedaCompacta(d.totais.saldo).replace("R$ ", "")}</td>
                  <td className="sticky bottom-0 z-10 border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-left text-[11px] text-gray-500">{Math.round(d.totais.pct * 100)}%</td>
                  <td className="sticky bottom-0 z-10 border-t-2 border-dashed border-gray-200 bg-gray-50 px-2 py-2 text-right text-gray-200">—</td>
                </tr>
              )}
              {linhasVisiveis.length === 0 && <tr><td colSpan={d.meses.length + 7} className="px-3 py-8 text-center text-gray-400">Nenhuma linha com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        {modo === "qtd" && !unidadeUnica && <p className="mt-2 text-xs text-gray-500">As linhas têm unidades diferentes (HH, un., mês…), por isso não há total de quantidade do contrato.</p>}
        <p className="mt-2 text-xs text-gray-500">Contratado e saldo vêm do contrato no Senior; o medido de cada mês vem dos pedidos de venda e fecha com o medido acumulado do Senior em cada linha. Dados do Senior de {horaBr(d.atualizadoEm)}.</p>
      </section>

      {/* ---------------- detalhe dos pedidos */}
      {sel && d.drill && (
        <section ref={detalheRef} className="scroll-mt-4 rounded-2xl border border-teal-200 bg-white p-5 shadow-soft">
          <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Pedidos{sel.seq !== null ? ` · ${d.linhas.find((l) => l.seqCvs === sel.seq)?.descricao ?? `linha ${sel.seq}`}` : ""}{sel.mes ? ` · ${sel.mes === "antes" ? "antes do período" : sel.mes === "depois" ? "depois do período" : mesLongo(sel.mes)}` : ""}</h2>
              <p className="mt-0.5 text-[13.5px] text-gray-600"><b className="tabular-nums text-gray-900">{moeda(d.drill.total.valor)}</b> · quantidade <b className="tabular-nums text-gray-900">{qtdFmt(d.drill.total.qtd)}</b> em {d.drill.qtdItens} item(ns) de pedido</p>
            </div>
            <button type="button" onClick={() => { setSel(null); setPagina(1); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">Fechar</button>
          </header>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[900px] text-[13px]">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2">Mês</th><th className="px-3 py-2">Boletim</th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Emissão</th>{sel.seq === null && <th className="px-3 py-2">Linha</th>}<th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">CC</th></tr></thead>
              <tbody>
                {d.drill.itens.map((i) => (
                  <tr key={`${i.numPed}-${i.seqIsp}-${i.seqCvs}`} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-800">{mesCurto(i.competencia)} {i.origem === "BOLETIM" ? <span className="ml-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-teal-800">boletim</span> : <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-600" title="O pedido não traz o mês do boletim: mês da emissão menos 1">emissão</span>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{i.boletim ?? "—"}{i.pedCli && i.boletim && <div className="text-[11px] text-gray-400">{i.pedCli}</div>}{i.pedCli && !i.boletim && <div className="text-[11px] text-gray-400">{i.pedCli}</div>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{i.numPed} <span className="text-xs text-gray-400">item {i.seqIsp}</span></td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{dataBr(i.dataEmissao)}</td>
                    {sel.seq === null && <td className="px-3 py-2 text-gray-700">{i.linha}</td>}
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{qtdFmt(i.qtd)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-gray-900">{moeda(i.valor)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-500">{i.codccu ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-500">
            <span>{d.drill.qtdItens} item(ns)</span>
            <span className="flex items-center gap-3">
              <button type="button" disabled={d.drill.pagina <= 1} onClick={() => setPagina(d.drill!.pagina - 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
              <span>Página {d.drill.pagina} de {d.drill.paginas}</span>
              <button type="button" disabled={d.drill.pagina >= d.drill.paginas} onClick={() => setPagina(d.drill!.pagina + 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
            </span>
          </footer>
        </section>
      )}
    </div>
  );
}
