"use client";

// Medicao de um contrato. Mostra, para cada linha contratada no Senior, o contratado, o medido mes a mes, o medido acumulado e o saldo, em VALOR e em
// QUANTIDADE (ou os dois juntos), e compara o consumo FISICO (quantidade) com o FINANCEIRO (valor). Cada linha traz a conferencia com o Senior. Clicar num
// valor abre os pedidos e o boletim. As colunas de P0 ficam reservadas: quando o P0 for cadastrado, o previsto e o desvio entram ao lado do medido.
// Tudo vem do Senior, somente leitura.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import SeletorPeriodo, { type Atalho } from "@/components/contratos/SeletorPeriodo";
import { BarrasPorMes, ConsumoPorLinha, Gauge, LinhasAvanco } from "./GraficosMedicao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";

type Cel = { qtd: number; valor: number };
type Linha = {
  seqCvs: number; descricao: string; unidade: string | null; qtdContratada: number; precoUnit: number; valorContratado: number; qtdFaturada: number; valorFaturado: number;
  saldoQtd: number; saldoValor: number; pctValor: number; pctQtd: number; divergenciaPp: number | null; antes: Cel; depois: Cel; porMes: Record<string, Cel>;
  medidoQtd: number; medidoValor: number; difQtd: number; difValor: number; confere: boolean;
};
type MesTotal = { mes: string; qtd: number; valor: number; acumuladoValor: number; acumuladoPct: number; acumuladoFisicoPct: number; variacaoPct: number | null; boletins: string[] };
type ItemDrill = { seqCvs: number; numPed: string; seqIsp: number; dataEmissao: string; competencia: string; origem: string; boletim: string | null; pedCli: string | null; situacao: string | null; qtd: number; valor: number; codccu: string | null; linha: string };
type Resposta = {
  contrato: { numCtr: string; numOfi: string; codccu: string | null; ccuNome: string | null; inicio: string | null; valorContratado: number; valorMedido: number };
  mesAtual: string; periodo: { de: string; ate: string }; primeiroMes: string | null; ultimoMes: string | null;
  meses: string[]; linhas: Linha[];
  totais: { contratado: number; medido: number; saldo: number; pct: number; antes: number; depois: number; porMes: MesTotal[] };
  consumo: { financeiroPct: number; fisicoPct: number; linhasEsgotadas: number; linhasAcima80: number; linhasSemMedicao: number; linhasAcima100: number; linhasComDivergencia: number };
  conferencia: { linhas: number; conferem: number; naoConferem: number; difValorAbsoluta: number };
  alertas: { mes: string; valor: number; mediaAnterior: number }[];
  drill: { itens: ItemDrill[]; total: Cel; qtdItens: number; pagina: number; paginas: number } | null;
  semCompetenciaConfiavel: number;
  outrosCentros: { codccu: string; nome: string; itens: number; valor: number }[];
  atualizadoEm: string | null;
};
type Modo = "ambos" | "valor" | "qtd";

const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const qtdFmt = (v: number) => v.toLocaleString("pt-BR", { maximumFractionDigits: 3 });
const qtdCompacta = (v: number) => (Math.abs(v) >= 10000 ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : qtdFmt(v));
const horaBr = (iso: string | null) => (iso ? new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const menos = (mes: string, n: number) => { const [a, m] = mes.split("-").map(Number); const d = new Date(Date.UTC(a, m - 1 - n, 1)); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`; };
const csvNum = (v: number) => String(Math.round(v * 1000) / 1000).replace(".", ",");
const csvTxt = (s: string) => `"${s.replace(/"/g, '""')}"`;
const vc = (v: number) => moedaCompacta(v).replace("R$ ", "");

/** Duas linhas numa celula: o valor em cima e a quantidade embaixo (modo "valor e quantidade"). */
function Dupla({ valor, qtd, unidade, cinza }: { valor: string; qtd: string; unidade?: string | null; cinza?: boolean }) {
  return (
    <span className="block leading-tight">
      <span className={cinza ? "text-gray-500" : "text-gray-900"}>{valor}</span>
      <span className="block text-[10.5px] font-normal text-gray-400">{qtd}{unidade ? ` ${unidade}` : ""}</span>
    </span>
  );
}

const Titulo = ({ children, sub }: { children: React.ReactNode; sub?: string }) => (
  <header className="mb-3">
    <h2 className="text-[15px] font-semibold text-gray-900">{children}</h2>
    {sub && <p className="mt-0.5 max-w-3xl text-[13px] leading-relaxed text-gray-500">{sub}</p>}
  </header>
);

export default function MedicaoDetalhe({ numCtr }: { numCtr: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const [modo, setModo] = useState<Modo>("ambos");
  const [busca, setBusca] = useState("");
  const [soComMedicao, setSoComMedicao] = useState(false);
  const [soComSaldo, setSoComSaldo] = useState(false);
  const [soDifere, setSoDifere] = useState(false);
  const [soDivergentes, setSoDivergentes] = useState(false);
  const [sel, setSel] = useState<{ seq: number | null; mes: string | null } | null>(null);
  const [pagina, setPagina] = useState(1);
  const [verTodasLinhas, setVerTodasLinhas] = useState(false);
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
      && (!soComSaldo || l.saldoValor > 0.5)
      && (!soDifere || !l.confere)
      && (!soDivergentes || (l.divergenciaPp !== null && Math.abs(l.divergenciaPp) >= 10)));
  }, [dados, busca, soComMedicao, soComSaldo, soDifere, soDivergentes]);

  if (erro && !dados) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro} <Link href="/medicao" className="ml-2 font-medium underline">Voltar para a lista</Link></div>;
  if (!dados) return (
    <div className="space-y-4" aria-busy>
      <div className="h-8 w-80 animate-pulse rounded-lg bg-gray-200" />
      <div className="grid gap-4 md:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="h-36 animate-pulse rounded-2xl bg-gray-200/70" />)}</div>
      <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" />
    </div>
  );

  const d = dados;
  const per = periodo ?? d.periodo;
  const ultimoFechado = [...d.totais.porMes].reverse().find((m) => m.mes < d.mesAtual && m.valor > 0) ?? null;
  const somaPeriodo = d.totais.porMes.reduce((s, m) => s + m.valor, 0);
  const maxValor = Math.max(1e-9, ...d.linhas.flatMap((l) => d.meses.map((m) => l.porMes[m]?.valor ?? 0)));
  const maxDaLinha = (l: Linha) => Math.max(1e-9, ...d.meses.map((m) => l.porMes[m]?.qtd ?? 0));
  const gapPp = (d.consumo.fisicoPct - d.consumo.financeiroPct) * 100;
  const atalhos: Atalho[] = [
    { rotulo: "Últimos 12 meses", de: menos(d.mesAtual, 11), ate: d.mesAtual },
    { rotulo: `Ano ${d.mesAtual.slice(0, 4)}`, de: `${d.mesAtual.slice(0, 4)}-01`, ate: d.mesAtual },
    ...(d.primeiroMes ? [{ rotulo: "Tudo desde o início", de: d.primeiroMes, ate: d.mesAtual }] : []),
  ];
  const selecionar = (seq: number | null, mes: string | null) => { setSel({ seq, mes }); setPagina(1); };
  const mostraValor = modo !== "qtd", mostraQtd = modo !== "valor";
  const consumoLinhas = [...d.linhas].filter((l) => l.qtdContratada > 0 || l.valorContratado > 0).sort((a, b) => Math.max(b.pctQtd, b.pctValor) - Math.max(a.pctQtd, a.pctValor));

  function baixarCsv() {
    const cab = ["Linha", "Unidade", "Contratado (qtd)", "Contratado (R$)", "Antes do período (R$)", ...d.meses.map((m) => `${mesLongo(m)} (R$)`), ...d.meses.map((m) => `${mesLongo(m)} (qtd)`), "Medido acumulado (qtd)", "Medido acumulado (R$)", "Saldo (qtd)", "Saldo (R$)", "Consumo qtd (%)", "Consumo valor (%)", "Confere com o Senior", "Diferença Senior - pedidos (R$)"];
    const linhas = d.linhas.map((l) => [csvTxt(l.descricao), csvTxt(l.unidade ?? ""), csvNum(l.qtdContratada), csvNum(l.valorContratado), csvNum(l.antes.valor), ...d.meses.map((m) => csvNum(l.porMes[m]?.valor ?? 0)), ...d.meses.map((m) => csvNum(l.porMes[m]?.qtd ?? 0)), csvNum(l.qtdFaturada), csvNum(l.valorFaturado), csvNum(l.saldoQtd), csvNum(l.saldoValor), csvNum(l.pctQtd * 100), csvNum(l.pctValor * 100), csvTxt(l.confere ? "sim" : "não"), csvNum(l.difValor)].join(";"));
    const blob = new Blob(["﻿" + [cab.map(csvTxt).join(";"), ...linhas].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `medicao-${d.contrato.codccu ?? d.contrato.numCtr}-${per.de}-a-${per.ate}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  const celulaDoMes = (l: Linha, m: string) => {
    const c = l.porMes[m];
    const temValor = !!c && (c.valor > 0 || c.qtd > 0.0004);
    if (!temValor) return <td key={m} className="p-0 text-right"><span className="block px-2 py-1.5 text-gray-200">·</span></td>;
    const base = mostraValor ? c.valor / maxValor : c.qtd / maxDaLinha(l);
    const a = Math.min(0.5, 0.07 + base * 0.43);
    const ativa = sel?.seq === l.seqCvs && sel?.mes === m;
    return (
      <td key={m} className="p-0 text-right">
        <button type="button" onClick={() => selecionar(l.seqCvs, m)} title={`${l.descricao} · ${mesLongo(m)}: ${moeda(c.valor)} · ${qtdFmt(c.qtd)} ${l.unidade ?? ""}. Clique para ver os pedidos.`}
          className={`block w-full whitespace-nowrap px-2 py-1.5 text-right hover:outline hover:outline-1 hover:outline-teal-600 ${ativa ? "outline outline-2 outline-teal-700" : ""}`} style={{ backgroundColor: `rgba(13,148,136,${a})` }}>
          {modo === "ambos" ? <Dupla valor={vc(c.valor)} qtd={qtdCompacta(c.qtd)} /> : <span className="text-gray-900">{modo === "valor" ? vc(c.valor) : qtdCompacta(c.qtd)}</span>}
        </button>
      </td>
    );
  };

  const th = "sticky top-0 z-20 border-b border-gray-200 bg-gray-50 px-2 py-2 text-right text-[11px] font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="space-y-6">
      {/* ---------------- cabecalho */}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <nav className="text-[13px] text-gray-500"><Link href="/medicao" className="font-medium text-brand hover:text-brand-dark">Receita e Medição</Link> <span className="text-gray-300">/</span> {d.contrato.ccuNome ?? d.contrato.numOfi}</nav>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-gray-900">{d.contrato.ccuNome ?? d.contrato.numOfi}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            {d.contrato.codccu && <span className="rounded-md bg-gray-100 px-2 py-1 font-medium text-gray-700">CCU {d.contrato.codccu}</span>}
            <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-600">Senior: {d.contrato.numOfi} · nº {d.contrato.numCtr}</span>
            {d.contrato.inicio && <span className="rounded-md bg-gray-100 px-2 py-1 text-gray-600">Início {dataBr(d.contrato.inicio)}</span>}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 text-xs text-gray-500">
          <span className={`rounded-full px-2.5 py-1 font-semibold ${d.conferencia.naoConferem === 0 ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`} title="Compara, linha a linha, a soma dos pedidos com o faturado acumulado do Senior">
            Confere com o Senior: {d.conferencia.conferem} de {d.conferencia.linhas} linhas
          </span>
          <span>Dados do Senior de {horaBr(d.atualizadoEm)}</span>
        </div>
      </header>

      {/* ---------------- atencao */}
      {(d.alertas.length > 0 || d.outrosCentros.length > 0 || d.conferencia.naoConferem > 0) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-[13px] leading-relaxed text-amber-950" aria-label="Pontos de atenção">
          <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-amber-800">Pontos de atenção</p>
          <ul className="list-disc space-y-1 pl-5">
            {d.alertas.length > 0 && <li><b>Medição possivelmente não lançada no Senior:</b> {d.alertas.map((a) => `${mesLongo(a.mes)} (${moeda(a.valor)}; média dos 3 meses anteriores ${moedaCompacta(a.mediaAnterior)})`).join("; ")}. Vale conferir com o time de medição.</li>}
            {d.conferencia.naoConferem > 0 && <li><b>{d.conferencia.naoConferem} linha(s) em que o faturado do Senior difere da soma dos pedidos</b> (diferença somada de {moeda(d.conferencia.difValorAbsoluta)}). O saldo segue o Senior; a coluna “Confere” mostra a diferença de cada linha.</li>}
            {d.outrosCentros.length > 0 && <li>Itens rateados, no pedido, para outro centro de custo: {d.outrosCentros.map((o) => `${o.nome} (${o.itens} item(ns), ${moeda(o.valor)})`).join("; ")}. Contam na medição do contrato.</li>}
          </ul>
        </section>
      )}

      {/* ---------------- controles */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
        <SeletorPeriodo de={per.de} ate={per.ate} mesAtual={d.mesAtual} modo="passado" atalhos={atalhos} onMudar={(de, ate) => { setPeriodo({ de, ate }); setSel(null); setPagina(1); }} />
        <div className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5" role="group" aria-label="Como ver a medição">
          {([["ambos", "Valor e quantidade"], ["valor", "Valor (R$)"], ["qtd", "Quantidade"]] as const).map(([k, r]) => (
            <button key={k} type="button" onClick={() => setModo(k)} aria-pressed={modo === k} className={`rounded-md px-3.5 py-1.5 text-[13px] font-medium transition ${modo === k ? "bg-white text-gray-900 shadow-sm ring-1 ring-gray-200" : "text-gray-500 hover:text-gray-800"}`}>{r}</button>
          ))}
        </div>
      </section>

      {/* ---------------- consumo: valor x quantidade */}
      <section aria-label="Consumo do contrato">
        <Titulo sub="O mesmo contrato visto por dois lados: quanto do valor já foi medido e quanto do serviço (quantidade) já foi entregue. Quando os dois se afastam, vale entender por quê.">Consumo do contrato: valor × quantidade</Titulo>
        <div className="grid gap-4 lg:grid-cols-3">
          <Gauge titulo="Consumo por valor (financeiro)" valor={d.consumo.financeiroPct} cor="teal" destaque={`${moeda(d.totais.medido)} de ${moeda(d.totais.contratado)}`} subtitulo={`Saldo a medir: ${moeda(d.totais.saldo)}`} />
          <Gauge titulo="Consumo por quantidade (físico)" valor={d.consumo.fisicoPct} cor="indigo" destaque={`${d.consumo.linhasEsgotadas} de ${d.linhas.length} linhas esgotadas em quantidade`} subtitulo={`${d.consumo.linhasAcima80} linhas acima de 80% · ${d.consumo.linhasSemMedicao} sem medição`} />
          <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
            <p className="text-[13px] font-medium text-gray-500">Diferença entre os dois</p>
            <p className={`mt-1 text-4xl font-semibold tabular-nums tracking-tight ${Math.abs(gapPp) < 2 ? "text-gray-900" : "text-amber-700"}`}>{Math.abs(gapPp) < 0.05 ? "" : gapPp > 0 ? "+" : "−"}{Math.abs(gapPp) < 0.05 ? "0" : Math.abs(gapPp).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} <span className="text-lg font-medium text-gray-500">p.p.</span></p>
            <p className="mt-3 text-[13px] leading-relaxed text-gray-600">
              {Math.abs(gapPp) < 2 ? "Quantidade e valor andam juntos: o preço medido está alinhado ao contratado."
                : gapPp > 0 ? "A quantidade avançou mais que o valor: indício de serviços medidos a um preço abaixo do contratado, ou ajuste nos pedidos."
                  : "O valor avançou mais que a quantidade: indício de preço medido acima do contratado (reajustes) ou itens medidos só em valor."}
            </p>
            <p className="mt-2 text-xs text-gray-400">{d.consumo.linhasComDivergencia} linha(s) com consumo por quantidade e por valor 10 p.p. ou mais afastados.</p>
          </div>
        </div>
      </section>

      {/* ---------------- indicadores */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { t: "Contratado", v: moeda(d.totais.contratado), s: `${d.linhas.length} linhas no Senior` },
          { t: "Medido acumulado", v: moeda(d.totais.medido), s: `${percentual(d.totais.pct, 1)} do contratado` },
          { t: "Saldo a medir", v: moeda(d.totais.saldo), s: "contratado menos medido" },
          { t: ultimoFechado ? `Última medição (${mesCurto(ultimoFechado.mes)})` : "Última medição", v: ultimoFechado ? moeda(ultimoFechado.valor) : "—", s: ultimoFechado?.variacaoPct != null ? `${ultimoFechado.variacaoPct >= 0 ? "▲" : "▼"} ${percentual(Math.abs(ultimoFechado.variacaoPct), 1)} em relação ao mês anterior` : ultimoFechado?.boletins.join(", ") || "" },
          { t: "Média por mês", v: moeda(d.meses.length ? somaPeriodo / d.meses.length : 0), s: `no período (${d.meses.length} meses)` },
        ].map((k) => (
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
          <Titulo sub="Valor medido em cada mês (mês do boletim). Clique num mês para ver os pedidos. Barras âmbar: medição muito abaixo da média.">Medido por mês</Titulo>
          <BarrasPorMes
            pontos={d.meses.map((m) => { const t = d.totais.porMes.find((x) => x.mes === m)!; return { mes: m, valor: t.valor, rotulo: t.boletins.join(", ") }; })}
            selecionado={sel?.mes ?? null} mesAtual={d.mesAtual} alertas={d.alertas.map((a) => a.mes)} formato={(v) => vc(v)} titulo="Valor medido por mês"
            onSelecionar={(m) => selecionar(null, sel?.mes === m && sel?.seq === null ? null : m)}
          />
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
          <Titulo sub="Quanto do contrato já foi medido ao fim de cada mês, pelo valor e pela quantidade. O previsto (P0) entra aqui quando for cadastrado.">Avanço acumulado: financeiro × físico</Titulo>
          <LinhasAvanco pontos={d.totais.porMes.map((m) => ({ mes: m.mes, fin: m.acumuladoPct, fis: m.acumuladoFisicoPct }))} />
        </div>
      </section>

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Titulo sub="Para cada linha do contrato: quanto da quantidade e quanto do valor já foram consumidos. Clique numa linha para ver os pedidos dela.">Consumo por linha: quantidade × valor</Titulo>
          {consumoLinhas.length > 12 && <button type="button" onClick={() => setVerTodasLinhas((v) => !v)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">{verTodasLinhas ? "Mostrar as 12 primeiras" : `Mostrar as ${consumoLinhas.length} linhas`}</button>}
        </div>
        <ConsumoPorLinha selecionada={sel?.seq ?? null} onSelecionar={(s) => selecionar(s, null)}
          itens={(verTodasLinhas ? consumoLinhas : consumoLinhas.slice(0, 12)).map((l) => ({ seq: l.seqCvs, rotulo: l.descricao, unidade: l.unidade, pctQtd: l.pctQtd, pctValor: l.pctValor, divergenciaPp: l.divergenciaPp, detalhe: `${qtdFmt(l.qtdFaturada)} de ${qtdFmt(l.qtdContratada)} ${l.unidade ?? ""} · ${moeda(l.valorFaturado)} de ${moeda(l.valorContratado)}` }))} />
      </section>

      {/* ---------------- planilha por linha */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <Titulo sub="Cada linha contratada no Senior: o contratado, o medido em cada mês, o medido acumulado, o saldo e o consumo. Clique num valor para ver os pedidos do mês, e no nome da linha para ver todos os dela.">Medição por linha do contrato</Titulo>
          <div className="flex flex-wrap items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar linha" className="w-44 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] outline-none focus:border-brand" aria-label="Buscar linha" />
            <button type="button" onClick={baixarCsv} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">Baixar (CSV)</button>
          </div>
        </div>
        <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] text-gray-600">
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={soComMedicao} onChange={(e) => setSoComMedicao(e.target.checked)} /> Só com medição no período</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={soComSaldo} onChange={(e) => setSoComSaldo(e.target.checked)} /> Só com saldo</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={soDifere} onChange={(e) => setSoDifere(e.target.checked)} /> Só linhas que diferem do Senior ({d.conferencia.naoConferem})</label>
          <label className="flex items-center gap-1.5"><input type="checkbox" checked={soDivergentes} onChange={(e) => setSoDivergentes(e.target.checked)} /> Só quantidade × valor afastados ({d.consumo.linhasComDivergencia})</label>
          <span className="ml-auto text-xs text-gray-400">{linhasVisiveis.length} de {d.linhas.length} linhas</span>
        </div>
        <div className="max-h-[75vh] overflow-auto rounded-xl border border-gray-100">
          <table className="w-full border-separate border-spacing-0 text-[12.5px] tabular-nums">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-30 min-w-[250px] border-b border-gray-200 bg-gray-50 px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-gray-500">Linha</th>
                <th className={th}>Contratado</th>
                <th className={th} title="Medido antes do período escolhido">Antes</th>
                {d.meses.map((m) => <th key={m} className={th}>{mesCurto(m)}</th>)}
                <th className={`${th} text-gray-900`}>Medido acum.</th>
                <th className={`${th} text-gray-900`}>Saldo</th>
                <th className={`${th} min-w-[118px] text-left`}>Consumo</th>
                <th className={`${th} text-center`} title="Soma dos pedidos comparada ao faturado acumulado do Senior">Confere</th>
                <th className={`${th} border-b border-dashed border-gray-300 text-gray-300`} title="Quando o P0 do contrato for cadastrado, o previsto e o desvio aparecem aqui">P0 · desvio</th>
              </tr>
            </thead>
            <tbody>
              {linhasVisiveis.map((l) => {
                const celula = "whitespace-nowrap border-b border-gray-100 px-2 py-1.5 text-right";
                const dual = (v: number, q: number) => (modo === "ambos" ? <Dupla valor={vc(v)} qtd={qtdCompacta(q)} unidade={l.unidade} cinza /> : modo === "valor" ? vc(v) : qtdCompacta(q));
                return (
                  <tr key={l.seqCvs} className="group">
                    <td className="sticky left-0 z-10 border-b border-gray-100 bg-white px-3 py-1.5 text-left group-hover:bg-gray-50">
                      <button type="button" onClick={() => selecionar(l.seqCvs, null)} className="block w-full text-left" title="Ver todos os pedidos desta linha">
                        <span className="line-clamp-1 font-medium text-gray-800">{l.descricao}</span>
                        <span className="text-[11px] text-gray-400">linha {l.seqCvs}{l.unidade ? ` · ${l.unidade}` : ""} · {moeda(l.precoUnit)} por {l.unidade ?? "un."}</span>
                      </button>
                    </td>
                    <td className={`${celula} text-gray-700`}>{dual(l.valorContratado, l.qtdContratada)}</td>
                    <td className={`${celula} text-gray-500`}>{l.antes.valor > 0 || l.antes.qtd > 0.0004 ? dual(l.antes.valor, l.antes.qtd) : <span className="text-gray-200">·</span>}</td>
                    {d.meses.map((m) => celulaDoMes(l, m))}
                    <td className={`${celula} font-semibold`} title={`Faturado acumulado no Senior. Soma dos pedidos: ${moeda(l.medidoValor)} · ${qtdFmt(l.medidoQtd)}`}>{modo === "ambos" ? <Dupla valor={vc(l.valorFaturado)} qtd={qtdCompacta(l.qtdFaturada)} unidade={l.unidade} /> : modo === "valor" ? vc(l.valorFaturado) : qtdCompacta(l.qtdFaturada)}</td>
                    <td className={`${celula} font-semibold ${l.saldoValor <= 0.5 && l.saldoQtd <= 0.0005 ? "text-amber-700" : "text-gray-900"}`}>{modo === "ambos" ? <Dupla valor={vc(l.saldoValor)} qtd={qtdCompacta(l.saldoQtd)} unidade={l.unidade} /> : modo === "valor" ? vc(l.saldoValor) : qtdCompacta(l.saldoQtd)}</td>
                    <td className="border-b border-gray-100 px-2 py-1.5">
                      <div className="space-y-1">
                        {mostraQtd && <div className="flex items-center gap-1.5" title={`Quantidade: ${qtdFmt(l.qtdFaturada)} de ${qtdFmt(l.qtdContratada)} ${l.unidade ?? ""}`}><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className="h-1.5 bg-indigo-500" style={{ width: `${Math.min(100, l.pctQtd * 100)}%` }} /></div><span className="w-8 text-right text-[11px] text-gray-500">{Math.round(l.pctQtd * 100)}%</span></div>}
                        {mostraValor && <div className="flex items-center gap-1.5" title={`Valor: ${moeda(l.valorFaturado)} de ${moeda(l.valorContratado)}`}><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100"><div className={`h-1.5 ${l.pctValor >= 0.95 ? "bg-amber-500" : "bg-teal-600"}`} style={{ width: `${Math.min(100, l.pctValor * 100)}%` }} /></div><span className="w-8 text-right text-[11px] text-gray-500">{Math.round(l.pctValor * 100)}%</span></div>}
                      </div>
                    </td>
                    <td className="border-b border-gray-100 px-2 py-1.5 text-center">
                      {l.confere ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-800" title="A soma dos pedidos fecha com o faturado do Senior">confere</span>
                        : <span className="cursor-help rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-semibold text-amber-800" title={`Senior: ${moeda(l.valorFaturado)} · ${qtdFmt(l.qtdFaturada)}\nPedidos: ${moeda(l.medidoValor)} · ${qtdFmt(l.medidoQtd)}\nDiferença: ${moeda(l.difValor)} · ${qtdFmt(l.difQtd)}`}>difere {l.difValor !== 0 ? moedaCompacta(l.difValor).replace("R$ ", "") : ""}</span>}
                    </td>
                    <td className="border-b border-dashed border-gray-200 px-2 py-1.5 text-right text-gray-200">—</td>
                  </tr>
                );
              })}
              {linhasVisiveis.length > 0 && mostraValor && (
                <tr className="font-semibold">
                  <td className="sticky bottom-0 left-0 z-20 border-t-2 border-gray-200 bg-gray-50 px-3 py-2 text-left text-gray-900">Total do contrato <span className="font-normal text-gray-400">(em valor)</span></td>
                  <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{vc(d.totais.contratado)}</td>
                  <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right text-gray-500">{d.totais.antes > 0 ? vc(d.totais.antes) : "·"}</td>
                  {d.meses.map((m) => { const t = d.totais.porMes.find((x) => x.mes === m)!; return <td key={m} className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{t.valor > 0 ? vc(t.valor) : <span className="font-normal text-gray-300">·</span>}</td>; })}
                  <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{vc(d.totais.medido)}</td>
                  <td className="sticky bottom-0 z-10 whitespace-nowrap border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-right">{vc(d.totais.saldo)}</td>
                  <td className="sticky bottom-0 z-10 border-t-2 border-gray-200 bg-gray-50 px-2 py-2 text-left text-[11px] text-gray-500">{Math.round(d.totais.pct * 100)}% do valor</td>
                  <td className="sticky bottom-0 z-10 border-t-2 border-gray-200 bg-gray-50 px-2 py-2" />
                  <td className="sticky bottom-0 z-10 border-t-2 border-dashed border-gray-200 bg-gray-50 px-2 py-2 text-right text-gray-200">—</td>
                </tr>
              )}
              {linhasVisiveis.length === 0 && <tr><td colSpan={d.meses.length + 8} className="px-3 py-10 text-center text-gray-400">Nenhuma linha com esses filtros.</td></tr>}
            </tbody>
          </table>
        </div>
        {modo !== "valor" && <p className="mt-2 text-xs text-gray-500">As linhas têm unidades diferentes (HH, un., mês…): a quantidade é sempre lida linha a linha, por isso não há total de quantidade do contrato.</p>}
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
              <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="px-3 py-2">Mês</th><th className="px-3 py-2">Boletim</th><th className="px-3 py-2">Pedido</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Emissão</th>{sel.seq === null && <th className="px-3 py-2">Linha</th>}<th className="px-3 py-2 text-right">Quantidade</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2">CC</th></tr></thead>
              <tbody>
                {d.drill.itens.map((i) => (
                  <tr key={`${i.numPed}-${i.seqIsp}-${i.seqCvs}`} className="border-t border-gray-100 align-top">
                    <td className="whitespace-nowrap px-3 py-2 text-gray-800">{i.origem === "ACUMULADO" ? <span className="rounded-full bg-violet-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-violet-800" title="Pedido de carga que junta vários boletins (ex.: “ACUMULADOS”, “BM01 A BM32”): não é de um mês, fica sempre em “antes do período”">acumulado</span> : <>{mesCurto(i.competencia)} {i.origem === "BOLETIM" ? <span className="ml-1 rounded-full bg-teal-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-teal-800">boletim</span> : <span className="ml-1 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-gray-600" title="O pedido não traz o mês do boletim: mês da emissão menos 1">emissão</span>}</>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{i.boletim ?? "—"}{i.pedCli && <div className="text-[11px] text-gray-400">{i.pedCli}</div>}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{i.numPed} <span className="text-xs text-gray-400">item {i.seqIsp}</span></td>
                    <td className="whitespace-nowrap px-3 py-2">{i.situacao ? <span className={`rounded-full px-1.5 py-0.5 text-[10.5px] font-semibold ${i.situacao === "FATURADO" || i.situacao === "FATURADO PARCIAL" ? "bg-teal-100 text-teal-800" : i.situacao === "ESTORNADO" ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-600"}`} title={i.situacao === "ABERTO" ? "Pedido ainda não faturado no Senior" : i.situacao === "ENCERRADO" ? "Pedido encerrado no Senior sem faturar por ele" : i.situacao === "ESTORNADO" ? "Nota cancelada e item reaberto: o valor é quantidade × preço" : "Pedido faturado no Senior: o Senior zera o valor do item, que aqui é quantidade × preço e fecha com a nota"}>{i.situacao.toLowerCase()}</span> : "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-gray-600">{dataBr(i.dataEmissao)}</td>
                    {sel.seq === null && <td className="px-3 py-2 text-gray-700">{i.linha}</td>}
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700">{qtdFmt(i.qtd)}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-gray-900">{moeda(i.valor)}{i.valor === 0 && i.qtd > 0 && <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-amber-800" title="O item tem quantidade, mas o Senior não traz preço nem valor para ele.">sem valor</span>}</td>
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

      {/* ---------------- como ler */}
      <details className="rounded-2xl border border-gray-100 bg-white/80 p-5 text-[13.5px] leading-relaxed text-gray-600">
        <summary className="cursor-pointer text-sm font-medium text-gray-800">Como ler esta tela</summary>
        <div className="mt-3 space-y-2">
          <p><b>Contratado e saldo</b> vêm da linha do contrato no Senior (quantidade e valor). <b>Medido acumulado</b> é o faturado acumulado da linha no Senior; o <b>saldo</b> é o contratado menos o medido.</p>
          <p><b>Medido em cada mês</b> vem dos itens dos pedidos de venda. O mês é o do <b>boletim de medição</b> anotado no pedido (ex.: “BM35 01.2026”); quando o pedido não traz o mês, vale o mês da emissão menos 1 (regra do Rito), marcado como “emissão” no detalhe.</p>
          <p><b>Consumo financeiro</b> é o valor medido dividido pelo contratado. <b>Consumo físico</b> é a média do consumo de quantidade de cada linha, ponderada pelo valor contratado (cada linha conta no máximo 100%). Se os dois se afastam, o preço medido difere do contratado.</p>
          <p><b>Confere</b> compara, linha a linha, a soma dos pedidos com o faturado do Senior. Onde “difere”, o saldo segue o Senior e a diferença está no balão da linha (costuma vir de ajuste feito no pedido depois do faturamento, de preço do pedido diferente do contrato ou de um item lançado numa linha do contrato diferente daquela em que o Senior acumulou o faturado).</p>
          <p>O valor de cada item do pedido é o do Senior enquanto o pedido está aberto ou encerrado. Depois de <b>faturado</b>, o Senior zera o valor do item; então vale quantidade × preço, que fecha com a nota fiscal ao centavo. Itens <b>cancelados</b> não entram. Pedido de <b>carga acumulada</b> (“ACUMULADOS”, “BM01 A BM32”) junta vários boletins e não é de um mês: fica em “antes do período”.</p>
          <p>O <b>centro de custo</b> de cada item é o do rateio do pedido no Senior, nunca deduzido do nome do contrato. As colunas de <b>P0</b> ficam reservadas para quando o P0 do contrato for cadastrado.</p>
        </div>
      </details>
    </div>
  );
}
