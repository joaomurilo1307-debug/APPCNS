"use client";

// "Pagos / semana" abaixo do "Ao vivo" no Custo por Centro de Custo (pedido do Joao, 03/11/2026): o que foi PAGO nos dias escolhidos do mes (um ou varios),
// titulo a titulo e centro de custo a centro de custo, no lugar do relatorio semanal que a Cris recebia. O valor de cada linha e' so' o do centro de custo
// olhado; o rateio completo e o calculo abrem na propria linha. Pago = baixa lancada no Senior ou pagamento confirmado pelo retorno do banco; titulo so'
// programado, enviado ao banco sem retorno, rejeitado ou cancelado NAO aparece (so' o que foi pago). Somente leitura. Acompanha o Senior: relê o que o sistema ja tem a cada 3 minutos
// e, quando as baixas lidas do Senior passam de 20 minutos, pede a leitura ao servidor (a mesma do botao Atualizar do alto da tela, uma por vez).

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import BotaoExcel from "@/components/BotaoExcel";
import { useAbrirOC } from "./AbrirOC";
import type { AbaExcel } from "@/lib/exportarExcel";
import { mesLongo, moeda, percentual } from "@/lib/custos/formato";
import type { Aprovacao, LinhaPago, ResumoDia, ResumoPagos, SituacaoPago } from "@/lib/contratos/pagosPorDia";

type Resposta = {
  mes: string; dias: number[]; hoje: string; linhas: LinhaPago[]; semConfirmacao: LinhaPago[]; diasDoMes: ResumoDia[]; resumo: ResumoPagos;
  centros: { codccu: string; nome: string; n: number }[];
  atualizadoEm: { custo: string | null; titulos: string | null };
};

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");
const diaMes = (iso: string) => iso.slice(8, 10) + "/" + iso.slice(5, 7);
const hora = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }) : "—");
const hojeBR = () => new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
const BAIXAS_VELHAS_MS = 20 * 60_000;
const SEMANA = ["D", "S", "T", "Q", "Q", "S", "S"];

/** [1,2,3,7] -> "1-3,7" (o formato que a API entende). */
export function diasParaTexto(dias: number[]): string {
  const o = [...dias].sort((a, b) => a - b);
  const partes: string[] = [];
  for (let i = 0; i < o.length; ) {
    let j = i;
    while (j + 1 < o.length && o[j + 1] === o[j] + 1) j++;
    partes.push(j > i ? `${o[i]}-${o[j]}` : String(o[i]));
    i = j + 1;
  }
  return partes.join(",");
}

const SITUACAO: Record<SituacaoPago, { rotulo: string; cor: string }> = {
  pago: { rotulo: "Baixado no Senior", cor: "bg-emerald-100 text-emerald-800" },
  pago_banco: { rotulo: "Pago pelo banco · falta a baixa no Senior", cor: "bg-sky-100 text-sky-800" },
  enviado_banco: { rotulo: "Enviado ao banco, sem retorno", cor: "bg-amber-100 text-amber-800" },
  programado: { rotulo: "Só programado, sem remessa", cor: "bg-gray-100 text-gray-600" },
};
const OC_COR: Record<string, string> = { ANA: "bg-amber-100 text-amber-800", PRE: "bg-amber-100 text-amber-800", APR: "bg-emerald-100 text-emerald-800", REP: "bg-red-100 text-red-700", CAN: "bg-gray-200 text-gray-700" };

function Aprovacoes({ lista }: { lista: Aprovacao[] }) {
  if (lista.length === 0) return null;
  return (
    <div className="mt-0.5 text-[11px] leading-snug text-gray-500">
      {lista.map((a, i) => (
        <span key={`${a.nivel}-${a.nome}-${i}`} className="mr-2 inline-block whitespace-nowrap">
          <b className="font-semibold text-gray-600">N{a.nivel}</b> {a.nome}{a.data ? ` ${diaMes(a.data)}` : ""}
        </span>
      ))}
    </div>
  );
}

export default function PagosPorDia({ codccu }: { codccu?: string }) {
  const mesAtual = hojeBR().slice(0, 7);
  const [mes, setMes] = useState(mesAtual);
  const [dias, setDias] = useState<number[]>([]);
  const [ultimoClique, setUltimoClique] = useState<number | null>(null);
  const [centro, setCentro] = useState("");
  const [situacao, setSituacao] = useState<"todos" | "pago" | "pago_banco">("todos");
  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [dados, setDados] = useState<Resposta | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Set<string>>(new Set());
  const [pagina, setPagina] = useState(1);
  const consultaRef = useRef("");
  const dadosRef = useRef<Resposta | null>(null);
  const atualizandoRef = useRef(false);
  const [atualizando, setAtualizando] = useState(false);
  const { abrirOC, janelaOC } = useAbrirOC();

  const ccu = codccu ?? centro;
  const consulta = useMemo(() => {
    const p = new URLSearchParams({ mes });
    if (dias.length) p.set("dias", diasParaTexto(dias));
    if (ccu) p.set("ccu", ccu);
    if (situacao !== "todos") p.set("situacao", situacao);
    if (buscaAplicada) p.set("q", buscaAplicada);
    return p.toString();
  }, [mes, dias, ccu, situacao, buscaAplicada]);

  const carregar = useCallback(async () => {
    consultaRef.current = consulta;
    try {
      const r = await fetch(`/api/custos-conta/pagos?${consulta}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (consultaRef.current !== consulta) return; // chegou uma resposta velha: ignora
      if (!r.ok) throw new Error(j.error || "Não foi possível carregar os pagamentos.");
      dadosRef.current = j;
      setDados(j);
      setErro(null);
    } catch (e: any) {
      setErro(e?.message || "Não foi possível carregar os pagamentos.");
    }
  }, [consulta]);

  useEffect(() => { void carregar(); }, [carregar]);

  // pede ao servidor que leia as baixas novas do Senior (a mesma atualizacao do botao "Atualizar" do alto da tela: roda em segundo plano, uma por vez) e,
  // quando ela termina, recarrega a tabela
  const carregarRef = useRef(carregar);
  useEffect(() => { carregarRef.current = carregar; }, [carregar]);
  const pedirAtualizacao = useCallback(async () => {
    if (atualizandoRef.current) return;
    try {
      const r = await fetch("/api/custos-conta/atualizar", { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok || !(j.iniciada || j.estado?.emCurso)) { if (r.ok) void carregarRef.current(); return; }
      atualizandoRef.current = true;
      setAtualizando(true);
      for (let i = 0; i < 150; i++) { // ate ~10 min, olhando de 4 em 4 s
        await new Promise((res) => setTimeout(res, 4000));
        const e = await fetch("/api/custos-conta/atualizar", { cache: "no-store" }).then((x) => (x.ok ? x.json() : null)).catch(() => null);
        if (e && !e.emCurso) break;
      }
    } catch {
      /* sem permissao ou sem rede: a tabela continua com o que ja tem */
    } finally {
      atualizandoRef.current = false;
      setAtualizando(false);
      void carregarRef.current();
    }
  }, []);

  // acompanha o Senior: relê a cada 3 minutos e quando a aba volta a ficar visivel; baixas lidas ha mais de 20 min pedem uma leitura nova
  useEffect(() => {
    const ciclo = async () => {
      if (document.visibilityState !== "visible") return;
      await carregarRef.current();
      const c = dadosRef.current?.atualizadoEm.custo;
      if (!c || Date.now() - new Date(c).getTime() > BAIXAS_VELHAS_MS) void pedirAtualizacao();
    };
    const t = setInterval(() => void ciclo(), 180_000);
    const v = () => void ciclo();
    document.addEventListener("visibilitychange", v);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", v); };
  }, [pedirAtualizacao]);
  useEffect(() => {
    const t = setTimeout(() => { setBuscaAplicada(busca.trim()); setPagina(1); }, 350);
    return () => clearTimeout(t);
  }, [busca]);

  const meses = useMemo(() => {
    const lista: string[] = [];
    let [a, m] = [2026, 1];
    const [fa, fm] = mesAtual.split("-").map(Number);
    while (a < fa || (a === fa && m <= fm)) { lista.push(`${a}-${String(m).padStart(2, "0")}`); m++; if (m > 12) { m = 1; a++; } }
    return lista;
  }, [mesAtual]);
  const trocarMes = (novo: string) => { setMes(novo); setDias([]); setUltimoClique(null); setPagina(1); setAberta(new Set()); };
  const indice = meses.indexOf(mes);

  const [anoMes, mesNum] = mes.split("-").map(Number);
  const primeiroDiaSemana = new Date(Date.UTC(anoMes, mesNum - 1, 1)).getUTCDay();
  const porDia = new Map((dados?.diasDoMes ?? []).map((d) => [d.dia, d]));
  const total = dados?.diasDoMes.length ?? new Date(Date.UTC(anoMes, mesNum, 0)).getUTCDate();

  function clicarDia(d: number, shift: boolean) {
    setPagina(1);
    if (shift && ultimoClique !== null) {
      const [de, ate] = [Math.min(ultimoClique, d), Math.max(ultimoClique, d)];
      const faixa = Array.from({ length: ate - de + 1 }, (_, i) => de + i);
      setDias((atual) => Array.from(new Set([...atual, ...faixa])).sort((a, b) => a - b));
    } else {
      setDias((atual) => (atual.includes(d) ? atual.filter((x) => x !== d) : [...atual, d].sort((a, b) => a - b)));
    }
    setUltimoClique(d);
  }
  const alternar = (chave: string) => setAberta((s) => { const n = new Set(s); if (n.has(chave)) n.delete(chave); else n.add(chave); return n; });

  const linhasPagina = 100;
  const linhas = dados?.linhas ?? [];
  const paginas = Math.max(1, Math.ceil(linhas.length / linhasPagina));
  const visiveis = linhas.slice((Math.min(pagina, paginas) - 1) * linhasPagina, Math.min(pagina, paginas) * linhasPagina);
  const filtrando = dias.length > 0 || !!buscaAplicada || situacao !== "todos" || (!codccu && !!centro);

  function abasExcel(): AbaExcel[] {
    if (!dados) return [];
    const ocTxt = (l: LinhaPago) => (l.numOcp ? `OC ${l.numOcp} (${l.ocRotulo})` : "Sem OC");
    const aprTxt = (l: LinhaPago) => l.aprovacoes.map((a) => `N${a.nivel} ${a.nome}${a.data ? ` ${dataBr(a.data)}` : ""}`).join(" · ");
    const rateioTxt = (l: LinhaPago) => l.rateios.map((r) => `${r.ccuNome} (${r.conta}): ${r.valor.toFixed(2).replace(".", ",")}`).join(" | ");
    const colunas = [
      { titulo: "Data", tipo: "data" as const, largura: 12 }, { titulo: "Situação", largura: 26 }, { titulo: "Título", largura: 14 }, { titulo: "Tipo", largura: 7 }, { titulo: "Fornecedor", largura: 38 },
      { titulo: "Conta financeira", largura: 30 }, { titulo: "Alocado em (centro de custo)", largura: 30 }, { titulo: "Valor deste centro", tipo: "moeda" as const, largura: 16 },
      { titulo: "Total pago do título", tipo: "moeda" as const, largura: 16 }, { titulo: "% deste centro", tipo: "percentual" as const, largura: 12 }, { titulo: "OC", largura: 22 }, { titulo: "Aprovações da OC", largura: 44 }, { titulo: "Rateio completo", largura: 70 },
    ];
    const corpo = (ls: LinhaPago[]) => ls.map((l) => [l.data, SITUACAO[l.situacao].rotulo, l.numTit, l.tipo ?? "", l.fornecedor, l.conta, `${l.ccu} - ${l.ccuNome}`, l.valor, l.totalPago, l.percentual, ocTxt(l), aprTxt(l), rateioTxt(l)]);
    const periodo = `${mesLongo(mes)}${dias.length ? ` · dias ${diasParaTexto(dias)}` : ""}${ccu ? ` · centro ${ccu}` : ""}`;
    const abas: AbaExcel[] = [
      { nome: "Pagos", colunas, linhas: corpo(dados.linhas), observacao: `Pagos / semana · ${periodo}. Pago = baixa no Senior ou pagamento confirmado pelo banco. A coluna Valor deste centro soma só a parte do centro de custo da linha.`, rodape: ["", "TOTAL PAGO", "", "", "", "", "", dados.resumo.pagos.valor, "", "", "", "", ""] },
      {
        nome: "Rateios completos",
        colunas: [{ titulo: "Data", tipo: "data", largura: 12 }, { titulo: "Título", largura: 14 }, { titulo: "Fornecedor", largura: 38 }, { titulo: "Centro de custo", largura: 32 }, { titulo: "Conta financeira", largura: 30 }, { titulo: "Valor", tipo: "moeda", largura: 16 }, { titulo: "% do título", tipo: "percentual", largura: 12 }, { titulo: "É a linha deste centro?", largura: 20 }],
        linhas: dados.linhas.flatMap((l) => l.rateios.map((r) => [l.data, l.numTit, l.fornecedor, `${r.ccu} - ${r.ccuNome}`, r.conta, r.valor, r.percentual, r.desta ? "sim" : ""])),
      },
    ];
    return abas;
  }

  const resumo = dados?.resumo;
  const nCentros = resumo?.porCentro.length ?? 0;

  return (
    <section className="mt-8 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Pagos por dia">
      <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="relative flex h-2.5 w-2.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /><span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" /></span>
            Pagos / semana
          </h2>
          <p className="mt-0.5 max-w-3xl text-[13.5px] text-gray-500">O que foi pago {codccu ? "neste centro de custo" : "nos centros de custo que você acompanha"}, título a título. Escolha um ou mais dias do mês. O valor de cada linha é só o do centro de custo; clique na linha para ver o rateio completo e o cálculo. Pago = baixado no Senior ou confirmado pelo banco.</p>
        </div>
        {dados && <p className="text-xs text-gray-400">Senior sincronizado — títulos {hora(dados.atualizadoEm.titulos)} · baixas {hora(dados.atualizadoEm.custo)} · acompanha o Senior sozinho{atualizando ? " · lendo as baixas novas agora…" : ""}</p>}
      </header>

      {/* ---------------- mes e dias */}
      <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50/60 p-3">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => indice > 0 && trocarMes(meses[indice - 1])} disabled={indice <= 0} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm disabled:opacity-40" aria-label="Mês anterior">‹</button>
          <select value={mes} onChange={(e) => trocarMes(e.target.value)} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-sm font-medium" aria-label="Mês">
            {meses.map((m) => <option key={m} value={m}>{mesLongo(m)}</option>)}
          </select>
          <button type="button" onClick={() => indice < meses.length - 1 && trocarMes(meses[indice + 1])} disabled={indice >= meses.length - 1} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-sm disabled:opacity-40" aria-label="Próximo mês">›</button>
          <span className="ml-2 text-[13px] text-gray-500">{dias.length === 0 ? "Mês todo" : `${dias.length} dia${dias.length === 1 ? "" : "s"}: ${diasParaTexto(dias)}`}</span>
          <span className="ml-auto flex gap-3 text-[13px]">
            <button type="button" onClick={() => { setDias((dados?.diasDoMes ?? []).filter((d) => d.pagamentos > 0).map((d) => d.dia)); setPagina(1); }} className="font-medium text-brand hover:text-brand-dark">Só dias com pagamento</button>
            <button type="button" onClick={() => { setDias([]); setUltimoClique(null); setPagina(1); }} className="font-medium text-brand hover:text-brand-dark">Mês todo</button>
          </span>
        </div>
        <div className="grid grid-cols-7 gap-1.5 sm:max-w-xl" role="group" aria-label="Dias do mês">
          {SEMANA.map((s, i) => <span key={i} className="text-center text-[11px] font-medium uppercase text-gray-400">{s}</span>)}
          {Array.from({ length: primeiroDiaSemana }, (_, i) => <span key={`v${i}`} />)}
          {Array.from({ length: total }, (_, i) => {
            const d = i + 1;
            const r = porDia.get(d);
            const marcado = dias.includes(d);
            const tem = !!r && r.pagamentos > 0;
            const futuro = `${mes}-${String(d).padStart(2, "0")}` > hojeBR();
            return (
              <button key={d} type="button" onClick={(e) => clicarDia(d, e.shiftKey)} aria-pressed={marcado}
                title={r ? `${d}/${String(mesNum).padStart(2, "0")}: ${r.pagamentos} pagamento${r.pagamentos === 1 ? "" : "s"} · ${moeda(r.valor)}` : undefined}
                className={`relative rounded-lg border px-1 py-1.5 text-center text-sm tabular-nums transition ${marcado ? "border-brand bg-brand/10 font-semibold text-gray-900" : tem ? "border-gray-200 bg-white text-gray-800 hover:border-gray-300" : "border-transparent text-gray-300 hover:border-gray-200"} ${futuro ? "opacity-60" : ""}`}>
                {d}
                {tem && <span className="block text-[10px] leading-none text-emerald-700">{r.pagamentos}</span>}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-[11px] text-gray-400">Clique em um dia para marcar ou desmarcar; com Shift, marca do último clicado até este. O número em verde é a quantidade de pagamentos do dia.</p>
      </div>

      {/* ---------------- filtros */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {!codccu && (
          <select value={centro} onChange={(e) => { setCentro(e.target.value); setPagina(1); }} className="max-w-[260px] rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Centro de custo">
            <option value="">Todos os centros de custo</option>
            {(dados?.centros ?? []).map((c) => <option key={c.codccu} value={c.codccu}>{c.codccu} · {c.nome} ({c.n})</option>)}
          </select>
        )}
        <select value={situacao} onChange={(e) => { setSituacao(e.target.value as typeof situacao); setPagina(1); }} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm" aria-label="Como foi confirmado">
          <option value="todos">Todos os pagos</option>
          <option value="pago">Baixados no Senior</option>
          <option value="pago_banco">Pagos pelo banco, sem baixa no Senior</option>
        </select>
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar fornecedor, título, OC ou conta" className="min-w-[220px] flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm outline-none focus:border-brand" />
        {filtrando && <button type="button" onClick={() => { setDias([]); setCentro(""); setSituacao("todos"); setBusca(""); setPagina(1); }} className="text-[13px] font-medium text-brand hover:text-brand-dark">Limpar filtros</button>}
        <button type="button" onClick={() => { void carregar(); void pedirAtualizacao(); }} disabled={atualizando} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] text-gray-600 hover:bg-gray-50 disabled:opacity-60" title="Lê as baixas novas direto do Senior (leva alguns minutos; a tabela se atualiza sozinha quando termina)">{atualizando ? "Lendo o Senior…" : "Atualizar agora"}</button>
        <BotaoExcel arquivo={`pagos-${mes}${dias.length ? `-dias-${diasParaTexto(dias).replace(/,/g, "_")}` : ""}`} gerar={abasExcel} desabilitado={!dados} />
      </div>

      {erro && <div className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{erro}</div>}
      {!dados && !erro && <div className="py-8 text-center text-sm text-gray-500">Lendo os pagamentos…</div>}

      {dados && resumo && (
        <>
          {/* ---------------- totais */}
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 px-4 py-2">
              <span className="block text-xs text-emerald-800">Total pago{ccu ? " neste centro" : ""}</span>
              <span className="block text-lg font-semibold tabular-nums text-gray-900">{moeda(resumo.pagos.valor)}</span>
              <span className="block text-xs text-gray-500">{resumo.pagos.pagamentos} pagamento{resumo.pagos.pagamentos === 1 ? "" : "s"} · {resumo.pagos.linhas} linha{resumo.pagos.linhas === 1 ? "" : "s"}</span>
            </div>
            <div className="rounded-xl border border-gray-200 px-4 py-2">
              <span className="block text-xs text-gray-500">Baixado no Senior</span>
              <span className="block text-[15px] font-medium tabular-nums text-gray-800">{moeda(resumo.porSituacao.pago.valor)}</span>
              <span className="block text-xs text-gray-400">{resumo.porSituacao.pago.linhas} linhas</span>
            </div>
            <div className="rounded-xl border border-gray-200 px-4 py-2">
              <span className="block text-xs text-gray-500">Pago pelo banco, sem baixa</span>
              <span className="block text-[15px] font-medium tabular-nums text-gray-800">{moeda(resumo.porSituacao.pago_banco.valor)}</span>
              <span className="block text-xs text-gray-400">{resumo.porSituacao.pago_banco.linhas} linhas</span>
            </div>
            {nCentros > 1 && resumo.porCentro.slice(0, 6).map((c) => (
              <button key={c.ccu} type="button" onClick={() => !codccu && (setCentro(c.ccu), setPagina(1))} disabled={!!codccu} className="rounded-xl border border-gray-200 px-3 py-2 text-left hover:border-gray-300 disabled:cursor-default" title="Filtrar por este centro de custo">
                <span className="block max-w-[170px] truncate text-xs text-gray-500">{c.nome}</span>
                <span className="block text-[15px] font-medium tabular-nums text-gray-800">{moeda(c.valor)}</span>
              </button>
            ))}
          </div>

          {/* ---------------- tabela */}
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full min-w-[1080px] text-[13px]">
              <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-3 py-2">Pago em</th><th className="px-3 py-2">Título</th><th className="px-3 py-2">Fornecedor</th><th className="px-3 py-2">Conta</th>
                  <th className="px-3 py-2">Conta alocada</th><th className="px-3 py-2 text-right">Valor</th><th className="px-3 py-2 text-right">Total pago</th><th className="px-3 py-2">OC e aprovações</th><th className="px-3 py-2"><span className="sr-only">Cálculo</span></th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((l) => {
                  const sit = SITUACAO[l.situacao];
                  const abertaAqui = aberta.has(l.chave);
                  return (
                    <Fragment key={l.chave}>
                      <tr className="border-t border-gray-100 align-top">
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">
                          {dataBr(l.data)}
                          <div className="mt-0.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${sit.cor}`}>{sit.rotulo}</span></div>
                          {l.forma === "adiantamento" && <div className="mt-0.5 text-[11px] text-gray-400">quitado por adiantamento</div>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-gray-700">{l.numTit}{l.tipo ? <span className="ml-1 text-xs text-gray-400">{l.tipo}</span> : null}</td>
                        <td className="px-3 py-2 font-medium text-gray-800">{l.fornecedor}</td>
                        <td className="px-3 py-2 text-gray-600">{l.conta}</td>
                        <td className="px-3 py-2 text-gray-600"><span className="text-gray-400">{l.ccu}</span> {l.ccuNome}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{moeda(l.valor)}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-500">{moeda(l.totalPago)}</td>
                        <td className="px-3 py-2">
                          {l.numOcp ? (
                            <>
                              <button type="button" onClick={() => abrirOC(l.numOcp as string)} className="mr-1.5 rounded-md border border-brand/40 px-1.5 py-0.5 text-xs font-medium text-brand hover:bg-brand/10" title="Abrir a OC">OC {l.numOcp}</button>
                              <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${l.ocSituacao ? OC_COR[l.ocSituacao] ?? "bg-gray-100 text-gray-600" : "bg-gray-100 text-gray-600"}`}>{l.ocRotulo}</span>
                              <Aprovacoes lista={l.aprovacoes} />
                            </>
                          ) : <span className="text-xs text-gray-400">Sem OC</span>}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-right">
                          <button type="button" onClick={() => alternar(l.chave)} aria-expanded={abertaAqui} className="rounded-lg border border-gray-200 px-2 py-1 text-xs font-medium text-gray-600 hover:bg-gray-50">{abertaAqui ? "Fechar" : "Cálculo"}</button>
                        </td>
                      </tr>
                      {abertaAqui && <tr className="bg-gray-50/70"><td colSpan={9} className="px-4 py-3"><Calculo linha={l} /></td></tr>}
                    </Fragment>
                  );
                })}
                {linhas.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-gray-400">Nenhum pagamento confirmado com esses filtros.</td></tr>}
              </tbody>
              {linhas.length > 0 && (
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50 font-semibold text-gray-900">
                    <td className="px-3 py-2" colSpan={5}>Total pago ({resumo.pagos.linhas} linha{resumo.pagos.linhas === 1 ? "" : "s"} · {resumo.pagos.pagamentos} pagamento{resumo.pagos.pagamentos === 1 ? "" : "s"})</td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{moeda(resumo.pagos.valor)}</td>
                    <td className="px-3 py-2" colSpan={3} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          <footer className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[13px] text-gray-500">
            <span>Pessoal e impostos (salários, férias, rescisão, encargos) não entram, como no custo. Só aparece o que foi pago.</span>
            {paginas > 1 && (
              <span className="flex items-center gap-3">
                <button type="button" disabled={pagina <= 1} onClick={() => setPagina(pagina - 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Anterior</button>
                <span>Página {Math.min(pagina, paginas)} de {paginas}</span>
                <button type="button" disabled={pagina >= paginas} onClick={() => setPagina(pagina + 1)} className="rounded-lg border border-gray-200 px-3 py-1.5 disabled:opacity-40">Próxima</button>
              </span>
            )}
          </footer>

        </>
      )}
      {janelaOC}
    </section>
  );
}

/** "Como chegou nesse valor": a conta da linha e o rateio completo do pagamento, com o centro da linha marcado. */
function Calculo({ linha: l }: { linha: LinhaPago }) {
  const soma = Math.round(l.rateios.reduce((s, r) => s + r.valor, 0) * 100) / 100;
  const fecha = Math.abs(soma - l.totalPago) < 0.005;
  return (
    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
      <div>
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Como chegou nesse valor</p>
        <p className="mt-1 text-[13px] text-gray-700">
          Total pago do título <b className="tabular-nums">{moeda(l.totalPago)}</b> × <b className="tabular-nums">{percentual(l.percentual, 2)}</b> (parte do centro {l.ccu}) = <b className="tabular-nums text-gray-900">{moeda(l.valor)}</b>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {l.situacao === "pago" ? `Baixa lançada no Senior com data de pagamento ${dataBr(l.data)}${l.forma === "adiantamento" ? " (quitado por adiantamento)" : ""}. ` : ""}
          {l.situacao === "pago_banco" && l.remessa ? `O retorno do Itaú confirmou o pagamento em ${dataBr(l.remessa.data)}${l.remessa.valorEfetivado != null ? ` (${moeda(l.remessa.valorEfetivado)})` : ""}; baixa no Senior: ${l.remessa.baixaSenior ?? "ainda não lançada"}${l.remessa.baixaSeniorMsg ? ` — ${l.remessa.baixaSeniorMsg}` : ""}. ` : ""}
          Vencimento do título: {dataBr(l.vencimento) || "—"}.
        </p>
        <p className={`mt-1 text-xs ${fecha ? "text-emerald-700" : "text-red-700"}`}>{fecha ? `✓ A soma dos rateios (${moeda(soma)}) fecha com o total pago.` : `A soma dos rateios (${moeda(soma)}) difere do total pago (${moeda(l.totalPago)}).`}</p>
      </div>
      <div className="overflow-x-auto rounded-lg border border-gray-100 bg-white">
        <table className="w-full text-[12.5px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="px-2 py-1.5">Centro de custo</th><th className="px-2 py-1.5">Conta</th><th className="px-2 py-1.5 text-right">Valor</th><th className="px-2 py-1.5 text-right">%</th></tr></thead>
          <tbody>
            {l.rateios.map((r, i) => (
              <tr key={`${r.ccu}-${r.conta}-${i}`} className={`border-t border-gray-100 ${r.desta ? "bg-emerald-50 font-semibold text-gray-900" : "text-gray-600"}`}>
                <td className="px-2 py-1.5"><span className="text-gray-400">{r.ccu}</span> {r.ccuNome}{r.desta ? <span className="ml-1.5 rounded bg-emerald-100 px-1 text-[10px] text-emerald-800">esta linha</span> : null}</td>
                <td className="px-2 py-1.5">{r.conta}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{moeda(r.valor)}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{percentual(r.percentual, 2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot><tr className="border-t border-gray-200 bg-gray-50 font-semibold text-gray-800"><td className="px-2 py-1.5" colSpan={2}>Total do pagamento</td><td className="px-2 py-1.5 text-right tabular-nums">{moeda(soma)}</td><td className="px-2 py-1.5 text-right tabular-nums">100%</td></tr></tfoot>
        </table>
      </div>
    </div>
  );
}
