"use client";

// Previsao mes a mes: quanto o Senior ja tem para pagar em cada mes (programado) e o que esta previsto, como isso varia de um mes para o outro,
// e o detalhe de qualquer mes ao clicar. Periodo, centro de custo, linha de custo, natureza e categoria filtraveis. Somente leitura.
// Usada na tela Financeiro > Previsao (todos os centros de custo que a pessoa ve) e na aba Previsao de cada contrato (ccuFixo).

import { useCallback, useEffect, useRef, useState } from "react";
import FiltroContratos from "@/components/FiltroContratos";
import GraficoMeses from "./GraficoMeses";
import PlanilhaMeses, { type CelulaSel, type DadosPlanilha } from "./PlanilhaMeses";
import SeletorPeriodo from "./SeletorPeriodo";
import { useAbrirOC } from "@/components/custos/AbrirOC";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";

type Mes = { mes: string; programado: number; previsto: number; total: number; qtd: number; variacao: { valor: number; pct: number | null } | null };
type Faixa = { programado: number; previsto: number; total: number; qtd: number };
type Item = {
  numTit: string; tipo: string; fornecedorNome: string | null; descricao: string | null; numOcp: string | null; numOcpVinculada?: string | null; ocSituacao?: string | null;
  vencimento: string; valorAberto: number; ccu: string; ccuNome: string; ctaFin?: string | null; contaNome?: string | null; natureza: "PROGRAMADO" | "PREVISTO"; categoria: string; categoriaRotulo: string; valorTipo?: "FIXO" | "VARIAVEL" | null;
};
type Resposta = {
  hoje: string; mesAtual: string; periodo: { de: string; ate: string };
  meses: Mes[]; antes: Faixa; depois: Faixa; semData: Faixa;
  totais: { programado: number; previsto: number; total: number; mediaMensal: number; maiorMes: { mes: string; total: number } | null };
  centros: { ccu: string; nome: string; n: number; total: number }[];
  linhasDeCusto: { cod: string; nome: string; n: number; total: number }[];
  categorias: { chave: string; rotulo: string; n: number; total: number }[];
  drill: { mes: string; total: number; programado: number; previsto: number; qtd: number; pagina: number; paginas: number; itens: Item[]; porCategoria: { chave: string; rotulo: string; n: number; total: number }[] } | null;
  planilha: DadosPlanilha; celula: { dim: string; grupo: string; filho: string | null } | null;
  foraDoCusto: { n: number; valor: number }; semVencimento: number; sincronizadoEm: string | null;
};

const COR_CAT: Record<string, string> = { RECORRENTE: "bg-violet-500", VEICULO: "bg-sky-500", TI: "bg-teal-500", AQUISICAO: "bg-amber-500", OC_PROGRAMADA: "bg-rose-500", DEMAIS: "bg-gray-400" };
const dataBr = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const SEM_CCU = "_sem_cc";

// nome da linha (e da linha filha) escolhida na planilha, para o titulo do detalhe
function rotuloDaCelula(d: Resposta): string {
  if (!d.celula) return "";
  const l = d.planilha.linhas.find((x) => x.chave === d.celula!.grupo);
  const f = d.celula.filho ? l?.filhos?.find((x) => x.chave === d.celula!.filho) : null;
  return [l?.rotulo ?? d.celula.grupo, f?.rotulo].filter(Boolean).join(" › ");
}

const nomeDaFaixa = (m: string, de: string, mesAtual: string) =>
  m === "antes" ? (de >= mesAtual ? "Em atraso (antes do período)" : "Antes do período") : m === "depois" ? "Depois do período" : m === "sem_data" ? "Sem data" : mesLongo(m);

function Variacao({ v }: { v: Mes["variacao"] }) {
  if (!v) return <span className="text-gray-300">—</span>;
  if (Math.abs(v.valor) < 0.5) return <span className="text-gray-400">= igual</span>;
  const sobe = v.valor > 0;
  return (
    <span className={sobe ? "text-red-700" : "text-emerald-700"} title="Variação em relação ao mês anterior">
      {sobe ? "▲" : "▼"} {moedaCompacta(Math.abs(v.valor)).replace("R$ ", "")}{v.pct !== null ? ` (${percentual(Math.abs(v.pct), Math.abs(v.pct) < 0.1 ? 1 : 0)})` : ""}
    </span>
  );
}

export default function PrevisaoMensal({ ccuFixo }: { ccuFixo?: string }) {
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<{ de: string; ate: string } | null>(null);
  const [ccu, setCcu] = useState("");
  const [conta, setConta] = useState("");
  const [categoria, setCategoria] = useState("");
  const [natureza, setNatureza] = useState("");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [mes, setMes] = useState<string | null>(null);
  const [mesInicial, setMesInicial] = useState(true);
  const [pagina, setPagina] = useState(1);
  const [dim, setDim] = useState("conta");
  const [celula, setCelula] = useState<CelulaSel>(null);
  const [carregando, setCarregando] = useState(false);
  const detalheRef = useRef<HTMLElement | null>(null);
  const ultima = useRef("");
  const { abrirOC, janelaOC } = useAbrirOC();

  const centro = ccuFixo ?? ccu;
  const consulta = useCallback(() => {
    const p = new URLSearchParams();
    if (periodo) { p.set("de", periodo.de); p.set("ate", periodo.ate); }
    if (centro) p.set("ccu", centro);
    if (conta) p.set("conta", conta);
    if (categoria) p.set("categoria", categoria);
    if (natureza) p.set("natureza", natureza);
    if (buscaAplicada) p.set("q", buscaAplicada);
    if (dim !== "conta") p.set("dim", dim);
    if (mes) p.set("mes", mes);
    if (celula) { p.set("grupo", celula.grupo); if (celula.filho) p.set("filho", celula.filho); }
    if (pagina > 1) p.set("pagina", String(pagina));
    return p.toString();
  }, [periodo, centro, conta, categoria, natureza, buscaAplicada, mes, pagina, dim, celula]);

  useEffect(() => {
    const qs = consulta();
    ultima.current = qs;
    setCarregando(true);
    fetch(`/api/previsao/mensal${qs ? `?${qs}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (ultima.current !== qs) return; // resposta velha
        if (!r.ok) throw new Error(j.error || "Não foi possível carregar a previsão.");
        setDados(j);
        setErro(null);
        if (!periodo) setPeriodo(j.periodo);
        if (mesInicial) { setMesInicial(false); if (!mes) setMes(j.mesAtual >= j.periodo.de && j.mesAtual <= j.periodo.ate ? j.mesAtual : j.periodo.de); }
      })
      .catch((e) => { if (ultima.current === qs) setErro(e.message); })
      .finally(() => { if (ultima.current === qs) setCarregando(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [consulta]);

  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const mudar = (fn: () => void) => { fn(); setPagina(1); };
  const escolherMes = (m: string) => { setCelula(null); setMes((atual) => (atual === m && !celula ? null : m)); setPagina(1); };
  const abrirCelula = (grupo: string, filho: string | null, m: string) => { setCelula({ grupo, filho, mes: m }); setMes(m); setPagina(1); };
  const chaveCelula = celula ? `${celula.grupo}|${celula.filho ?? ""}|${celula.mes}` : "";
  const mudarDim = (v: string) => { setDim(v); setCelula(null); setPagina(1); };

  // ao clicar numa celula da planilha, leva a tela ate o detalhe quando ele chega
  useEffect(() => {
    if (chaveCelula && dados?.drill && dados.drill.mes === mes) detalheRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveCelula, dados?.drill?.mes, dados?.drill?.total]);

  if (erro && !dados) return <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>;
  if (!dados) return <div className="rounded-xl border border-gray-100 bg-white px-5 py-10 text-center text-sm text-gray-500">Lendo a previsão do Senior…</div>;

  const d = dados;
  const per = periodo ?? d.periodo;
  const comFiltro = !!(conta || categoria || natureza || buscaAplicada || (!ccuFixo && ccu));

  const linhaFaixa = (chave: "antes" | "depois" | "sem_data", f: Faixa) =>
    f.qtd > 0 && (
      <tr key={chave} onClick={() => escolherMes(chave)} className={`cursor-pointer border-t border-gray-100 text-gray-600 hover:bg-gray-50 ${mes === chave ? "bg-teal-50" : ""}`}>
        <td className="px-3 py-2 text-left">{nomeDaFaixa(chave, per.de, d.mesAtual)}</td>
        <td className="px-3 py-2 text-right">{moedaCompacta(f.programado)}</td>
        <td className="px-3 py-2 text-right">{moedaCompacta(f.previsto)}</td>
        <td className="px-3 py-2 text-right font-medium">{moedaCompacta(f.total)}</td>
        <td className="px-3 py-2 text-right text-gray-300">—</td>
        <td className="px-3 py-2 text-right">{f.qtd}</td>
      </tr>
    );

  return (
    <div className="space-y-5">
      {/* ---------------- filtros */}
      <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <SeletorPeriodo de={per.de} ate={per.ate} mesAtual={d.mesAtual} modo="futuro" onMudar={(de, ate) => mudar(() => { setPeriodo({ de, ate }); setMes(null); setCelula(null); })} />
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {!ccuFixo && (
            <select value={ccu} onChange={(e) => mudar(() => { setCcu(e.target.value); setConta(""); })} className="max-w-[280px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Centro de custo">
              <option value="">Todos os centros de custo</option>
              {d.centros.map((c) => <option key={c.ccu} value={c.ccu}>{c.ccu === SEM_CCU ? "" : `${c.ccu} · `}{c.nome} ({moedaCompacta(c.total).replace("R$ ", "")})</option>)}
              {ccu && !d.centros.some((c) => c.ccu === ccu) && <option value={ccu}>{ccu}</option>}
            </select>
          )}
          <select value={conta} onChange={(e) => mudar(() => setConta(e.target.value))} className="max-w-[320px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Linha de custo">
            <option value="">Todas as linhas de custo</option>
            {d.linhasDeCusto.map((l) => <option key={l.cod} value={l.cod}>{l.nome} ({l.n} · {moedaCompacta(l.total).replace("R$ ", "")})</option>)}
            {conta && !d.linhasDeCusto.some((l) => l.cod === conta) && <option value={conta}>{conta}</option>}
          </select>
          <select value={natureza} onChange={(e) => mudar(() => setNatureza(e.target.value))} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Programado ou previsto">
            <option value="">Programado e previsto</option>
            <option value="PROGRAMADO">Só o já programado</option>
            <option value="PREVISTO">Só o previsto</option>
          </select>
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, descrição, título ou OC" className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
          <FiltroContratos />
          {comFiltro && <button type="button" onClick={() => { setCcu(""); setConta(""); setCategoria(""); setNatureza(""); setBusca(""); setPagina(1); }} className="text-[13px] font-medium text-brand hover:text-brand-dark">Limpar filtros</button>}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => mudar(() => setCategoria(""))} className={`rounded-full border px-3 py-1 text-[13px] ${!categoria ? "border-brand bg-brand/10 font-semibold text-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>Todas as categorias</button>
          {d.categorias.filter((c) => c.n > 0 || categoria === c.chave).map((c) => (
            <button key={c.chave} type="button" onClick={() => mudar(() => setCategoria(categoria === c.chave ? "" : c.chave))}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${categoria === c.chave ? "border-brand bg-brand/10 font-semibold text-gray-900" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
              <span className={`h-2 w-2 rounded-full ${COR_CAT[c.chave]}`} />{c.rotulo}<span className="tabular-nums text-gray-400">{moedaCompacta(c.total).replace("R$ ", "")}</span>
            </button>
          ))}
        </div>
      </section>

      {/* ---------------- resumo do periodo */}
      <div className={`grid gap-4 sm:grid-cols-2 xl:grid-cols-5 ${carregando ? "opacity-70 transition" : ""}`}>
        {[
          { t: "Total no período", v: moeda(d.totais.total), s: `${mesLongo(per.de)} a ${mesLongo(per.ate)}` },
          { t: "Já programado", v: moeda(d.totais.programado), s: "títulos e OCs com data" },
          { t: "Previsto", v: moeda(d.totais.previsto), s: "previsões do Senior (PRV)" },
          { t: "Média por mês", v: moeda(d.totais.mediaMensal), s: `${d.meses.length} mês(es)` },
          { t: "Maior mês", v: d.totais.maiorMes ? moeda(d.totais.maiorMes.total) : "—", s: d.totais.maiorMes ? mesLongo(d.totais.maiorMes.mes) : "sem valores no período" },
        ].map((k) => (
          <div key={k.t} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
            <p className="text-[13px] font-medium text-gray-500">{k.t}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums text-gray-900">{k.v}</p>
            <p className="text-xs text-gray-400">{k.s}</p>
          </div>
        ))}
      </div>

      {/* ---------------- mes a mes */}
      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <header className="mb-3">
          <h2 className="text-base font-semibold text-gray-900">Mês a mês</h2>
          <p className="mt-0.5 text-[13px] text-gray-500">Quanto precisa em cada mês e como varia em relação ao mês anterior. Clique num mês para ver o que já está programado e o que está previsto.</p>
        </header>
        <GraficoMeses meses={d.meses} selecionado={mes} mesAtual={d.mesAtual} onSelecionar={escolherMes} />
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[720px] text-[13.5px] tabular-nums">
            <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr><th className="px-3 py-2 text-left">Mês</th><th className="px-3 py-2 text-right">Já programado</th><th className="px-3 py-2 text-right">Previsto</th><th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Variação vs mês anterior</th><th className="px-3 py-2 text-right">Lançamentos</th></tr>
            </thead>
            <tbody>
              {linhaFaixa("antes", d.antes)}
              {d.meses.map((m) => (
                <tr key={m.mes} onClick={() => escolherMes(m.mes)} className={`cursor-pointer border-t border-gray-100 hover:bg-gray-50 ${mes === m.mes ? "bg-teal-50" : ""}`}>
                  <td className="px-3 py-2 text-left font-medium text-gray-800">{mesLongo(m.mes)}{m.mes === d.mesAtual && <span className="ml-2 rounded-full bg-teal-100 px-2 py-0.5 text-[11px] font-semibold text-teal-800">mês atual</span>}{m.mes < d.mesAtual && <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-700">vencido</span>}</td>
                  <td className="px-3 py-2 text-right">{m.programado > 0 ? moedaCompacta(m.programado) : <span className="text-gray-300">–</span>}</td>
                  <td className="px-3 py-2 text-right">{m.previsto > 0 ? moedaCompacta(m.previsto) : <span className="text-gray-300">–</span>}</td>
                  <td className="px-3 py-2 text-right font-semibold text-gray-900">{m.total > 0 ? moeda(m.total) : <span className="font-normal text-gray-300">–</span>}</td>
                  <td className="px-3 py-2 text-right"><Variacao v={m.variacao} /></td>
                  <td className="px-3 py-2 text-right text-gray-600">{m.qtd || <span className="text-gray-300">–</span>}</td>
                </tr>
              ))}
              {linhaFaixa("depois", d.depois)}
              {linhaFaixa("sem_data", d.semData)}
            </tbody>
          </table>
        </div>
      </section>

      {/* ---------------- planilha mes a mes (linhas que abrem) */}
      <PlanilhaMeses dados={d.planilha} dim={dim} onDim={mudarDim} onCelula={abrirCelula} selecionada={celula} esconderCcu={!!ccuFixo} />

      {/* ---------------- detalhe do mes */}
      {mes && d.drill && d.drill.mes === mes && (
        <section ref={detalheRef} className="scroll-mt-4 rounded-2xl border border-teal-200 bg-white p-5 shadow-soft">
          <header className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{nomeDaFaixa(mes, per.de, d.mesAtual)}{d.celula && <span className="ml-2 text-base font-normal text-gray-500">· {rotuloDaCelula(d)}</span>}</h2>
              <p className="mt-0.5 text-[13.5px] text-gray-600">
                <b className="tabular-nums text-gray-900">{moeda(d.drill.total)}</b> em {d.drill.qtd} lançamento(s) · já programado <b className="tabular-nums">{moeda(d.drill.programado)}</b> · previsto <b className="tabular-nums">{moeda(d.drill.previsto)}</b>
              </p>
            </div>
            <div className="flex gap-2">
              {celula && <button type="button" onClick={() => { setCelula(null); setPagina(1); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">Ver o mês inteiro</button>}
              <button type="button" onClick={() => { setMes(null); setCelula(null); }} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50">Fechar</button>
            </div>
          </header>
          <div className="mb-3 flex flex-wrap gap-2">
            {d.drill.porCategoria.map((c) => (
              <button key={c.chave} type="button" onClick={() => mudar(() => setCategoria(categoria === c.chave ? "" : c.chave))}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] ${categoria === c.chave ? "border-brand bg-brand/10 font-semibold" : "border-gray-200 text-gray-600 hover:border-gray-300"}`}>
                <span className={`h-2 w-2 rounded-full ${COR_CAT[c.chave]}`} />{c.rotulo} · {c.n}<span className="tabular-nums text-gray-400">{moedaCompacta(c.total).replace("R$ ", "")}</span>
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[1000px] text-[13px]">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr><th className="px-3 py-2">Vencimento</th><th className="px-3 py-2">Situação</th><th className="px-3 py-2">Fornecedor</th><th className="px-3 py-2">Título / OC</th>{!ccuFixo && <th className="px-3 py-2">Centro de custo</th>}<th className="px-3 py-2">Linha de custo</th><th className="px-3 py-2">Categoria</th><th className="px-3 py-2 text-right">Valor</th></tr>
              </thead>
              <tbody>
                {d.drill.itens.map((i, k) => {
                  const oc = i.tipo === "OC" ? i.numOcp : i.numOcpVinculada ?? i.numOcp;
                  return (
                    <tr key={`${i.numTit}-${i.ccu}-${i.ctaFin ?? ""}-${k}`} className="border-t border-gray-100 align-top">
                      <td className={`whitespace-nowrap px-3 py-2 tabular-nums ${i.vencimento && i.vencimento < d.hoje ? "text-red-700" : "text-gray-800"}`}>{i.vencimento ? dataBr(i.vencimento) : <span className="text-gray-400">sem data</span>}{i.vencimento && i.vencimento < d.hoje && <span className="ml-1 text-[11px]">vencido</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${i.natureza === "PREVISTO" ? "bg-violet-100 text-violet-800" : "bg-teal-100 text-teal-800"}`}>{i.natureza === "PREVISTO" ? "Previsto" : "Já programado"}</span></td>
                      <td className="px-3 py-2"><div className="font-medium text-gray-800">{i.fornecedorNome ?? "—"}</div>{i.descricao && <div className="line-clamp-2 max-w-[360px] text-xs text-gray-400" title={i.descricao}>{i.descricao}</div>}{i.valorTipo && <span className={`mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-[11px] font-semibold ${i.valorTipo === "FIXO" ? "bg-violet-100 text-violet-800" : "bg-amber-100 text-amber-800"}`}>{i.valorTipo === "FIXO" ? "valor fixo" : "valor variável"}</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600">{i.tipo === "OC" ? <span className="text-gray-500">OC (ainda sem título)</span> : i.numTit}{oc && <button type="button" onClick={() => abrirOC(oc)} className="ml-2 rounded-md border border-brand/40 px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/10" title="Abrir a OC">OC {oc}</button>}</td>
                      {!ccuFixo && <td className="px-3 py-2 text-gray-600"><span className="text-gray-400">{i.ccu === SEM_CCU ? "" : i.ccu}</span> {i.ccuNome}</td>}
                      <td className="px-3 py-2 text-gray-600">{i.contaNome ?? <span className="text-gray-300">não informada</span>}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-gray-600"><span className={`mr-1.5 inline-block h-2 w-2 rounded-full ${COR_CAT[i.categoria]}`} />{i.categoriaRotulo}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right font-medium tabular-nums text-gray-900">{moeda(i.valorAberto)}</td>
                    </tr>
                  );
                })}
                {d.drill.itens.length === 0 && <tr><td colSpan={ccuFixo ? 7 : 8} className="px-3 py-8 text-center text-gray-400">Nenhum lançamento com esses filtros.</td></tr>}
              </tbody>
            </table>
          </div>
          <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-500">
            <span>{d.drill.qtd} lançamento(s)</span>
            <span className="flex items-center gap-3">
              <button type="button" disabled={d.drill.pagina <= 1} onClick={() => setPagina(d.drill!.pagina - 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
              <span>Página {d.drill.pagina} de {d.drill.paginas}</span>
              <button type="button" disabled={d.drill.pagina >= d.drill.paginas} onClick={() => setPagina(d.drill!.pagina + 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
            </span>
          </footer>
        </section>
      )}

      {/* ---------------- notas */}
      <div className="space-y-1 text-xs text-gray-500">
        <p>Já programado = títulos em aberto (parcelas, compras, contas) e OCs com data de pagamento prevista. Previsto = previsões lançadas no Senior (tipo PRV). O mês é o do vencimento. O centro de custo e a linha de custo vêm do rateio do Senior. Dados do Senior sincronizados às {hora(d.sincronizadoEm)}.</p>
        {d.foraDoCusto.n > 0 && <p>{d.foraDoCusto.n} lançamento(s) de contas de pessoal e impostos ({moeda(d.foraDoCusto.valor)}) ficam de fora, como no custo: eles são do Custo de pessoal.</p>}
        {d.semVencimento > 0 && <p>{d.semVencimento} título(s) em aberto sem data de vencimento válida no Senior não entram.</p>}
      </div>
      {janelaOC}
    </div>
  );
}
