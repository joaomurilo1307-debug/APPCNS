"use client";

// Contratos: cada centro de custo do Senior que o financeiro e a diretoria acompanham, com a ficha (cliente, numero, vigencia)
// e o custo lido do Senior. Clicar abre o contrato (visao geral, custos, custo de pessoal, P0 e previsao).

import Link from "next/link";
import FiltroContratos from "@/components/FiltroContratos";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { chaveMes, contratosNaBase, linhasDoContrato, type ContratoCusto } from "@/lib/custos/agregacao";
import { mesCurto, moedaCompacta, percentual } from "@/lib/custos/formato";
import { Sparkline } from "@/components/custos/graficos";
import BotaoExcel from "@/components/BotaoExcel";
import GerenciarContratosAtivos from "@/components/contratos/GerenciarContratosAtivos";
import type { AbaExcel } from "@/lib/exportarExcel";

type Ficha = { id: string; codccu: string; nome: string; tipo: string; status: string; acompanharResultados: boolean; cliente: string | null; numero: string | null; vigenciaInicio: string | null; vigenciaFim: string | null; valor: number | null };
type Resp = { contratos: ContratoCusto[]; meses: string[]; mesCorrente: string };

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export default function ContratosPage() {
  const [fichas, setFichas] = useState<Ficha[] | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);
  const [gerenciando, setGerenciando] = useState(false);
  const [paraGerenciar, setParaGerenciar] = useState<Ficha[]>([]);
  const [custos, setCustos] = useState<Resp | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"CONTRATO" | "ADMINISTRATIVO" | "todos">("CONTRATO");
  const [status, setStatus] = useState<"ATIVO" | "ENCERRADO" | "todos">("todos");
  const [acompanhamento, setAcompanhamento] = useState<"incluidos" | "fora" | "todos">("incluidos");
  const [ordem, setOrdem] = useState<"custo" | "nome" | "ccu">("custo");
  const requisicao = useRef(0);

  const carregarFichas = useCallback(async (signal?: AbortSignal) => {
    const sequencia = ++requisicao.current;
    setFichas(null); setCustos(null); setErro(null);
    try {
      const [r, custo] = await Promise.all([
        fetch(`/api/contratos?acompanhamento=${acompanhamento}`, { cache: "no-store", signal }),
        fetch(`/api/custos-conta${acompanhamento === "incluidos" ? "" : "?acompanhamento=todos"}`, { cache: "no-store", signal }),
      ]);
      const [j, c] = await Promise.all([r.json(), custo.json()]);
      if (!r.ok || !custo.ok) throw new Error(typeof j.error === "string" ? j.error : typeof c.error === "string" ? c.error : "Erro ao carregar os contratos.");
      if (signal?.aborted || sequencia !== requisicao.current) return;
      setFichas(j.contratos); setPodeEditar(!!j.podeEditar); setCustos(c);
    } catch (e) { if (!signal?.aborted && sequencia === requisicao.current) setErro(e instanceof Error ? e.message : "Erro ao carregar os contratos."); }
  }, [acompanhamento]);

  async function abrirGerenciamento() {
    try {
      const r = await fetch("/api/contratos?acompanhamento=todos&ignorarSelecao=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) throw new Error("Não foi possível carregar o gerenciamento dos contratos.");
      setParaGerenciar(j.contratos); setGerenciando(true);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível carregar o gerenciamento dos contratos."); }
  }

  useEffect(() => {
    const controller = new AbortController();
    void carregarFichas(controller.signal);
    return () => controller.abort();
  }, [carregarFichas]);

  const mesesAsc = useMemo(() => (custos ? custos.meses.map(chaveMes).sort() : []), [custos]);
  const mesCorrente = custos ? chaveMes(custos.mesCorrente) : "";

  const linhas = useMemo(() => {
    if (!fichas) return [];
    const porCcu = new Map<string, ContratoCusto>();
    if (custos) for (const c of contratosNaBase(custos.contratos, "pagamento")) porCcu.set(c.codccu, c);
    const f = { de: mesesAsc[0] ?? "", ate: mesesAsc[mesesAsc.length - 1] ?? "", tipo: "todos" as const, grupo: "todos" };
    return fichas.map((ficha) => {
      const cc = porCcu.get(ficha.codccu);
      const serie = cc && mesesAsc.length ? mesesAsc.map((_, i) => soma(linhasDoContrato(cc, f, mesesAsc).map((l) => l.serie[i] ?? 0))) : [];
      const iRef = mesesAsc.length ? (mesesAsc[mesesAsc.length - 1] === mesCorrente ? mesesAsc.length - 2 : mesesAsc.length - 1) : -1;
      const ref = iRef >= 0 ? serie[iRef] ?? 0 : 0;
      const ant = iRef > 0 ? serie[iRef - 1] ?? 0 : 0;
      return { ficha, total: soma(serie), serie, ref, mesRef: iRef >= 0 ? mesesAsc[iRef] : "", var: ant ? (ref - ant) / Math.abs(ant) : null };
    });
  }, [fichas, custos, mesesAsc, mesCorrente]);

  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const l = linhas.filter(({ ficha: f }) => (tipo === "todos" || f.tipo === tipo) && (status === "todos" || f.status === status) && (!t || `${f.codccu} ${f.nome} ${f.cliente ?? ""} ${f.numero ?? ""}`.toLowerCase().includes(t)));
    return l.sort((a, b) => (ordem === "custo" ? b.total - a.total : ordem === "nome" ? a.ficha.nome.localeCompare(b.ficha.nome, "pt-BR") : a.ficha.codccu.localeCompare(b.ficha.codccu, undefined, { numeric: true })));
  }, [linhas, busca, tipo, status, ordem]);

  if (erro) return <div role="alert" className="p-6 text-sm text-red-600">{erro}<button onClick={() => void carregarFichas()} className="ml-3 underline">Tentar novamente</button></div>;
  const carregando = !fichas || !custos;
  const totalAno = soma(filtradas.map((l) => l.total));
  const hoje = Date.now();

  // planilha da lista que esta na tela (respeita busca, tipo, situacao e ordem): ficha do contrato + custo mes a mes lido do Senior
  function abasExcel(): AbaExcel[] {
    return [{
      nome: "Contratos",
      observacao: `Contratos · acompanhamento: ${acompanhamento} · tipo: ${tipo === "todos" ? "todos" : tipo === "CONTRATO" ? "contratos" : "administrativos"} · situação: ${status === "todos" ? "todas" : status === "ATIVO" ? "ativos" : "encerrados"}${busca.trim() ? ` · busca: ${busca.trim()}` : ""}`,
      colunas: [
        { titulo: "CCU", largura: 8 }, { titulo: "Contrato", largura: 40 }, { titulo: "Tipo", largura: 16 }, { titulo: "Situação", largura: 12 }, { titulo: "Resultados", largura: 20 }, { titulo: "Cliente", largura: 30 }, { titulo: "Número", largura: 16 },
        { titulo: "Vigência início", tipo: "data" }, { titulo: "Vigência fim", tipo: "data" }, { titulo: "Valor do contrato", tipo: "moeda" }, { titulo: "Custo total no período", tipo: "moeda" },
        ...mesesAsc.map((m) => ({ titulo: mesCurto(m), tipo: "moeda" as const })),
      ],
      linhas: filtradas.map(({ ficha: f, total, serie }) => [
        f.codccu, f.nome, f.tipo === "CONTRATO" ? "Contrato" : "Administrativo", f.status === "ATIVO" ? "Ativo" : "Encerrado", f.acompanharResultados ? "Incluído" : "Fora dos resultados", f.cliente ?? "", f.numero ?? "",
        f.vigenciaInicio, f.vigenciaFim, f.valor, total, ...mesesAsc.map((_, i) => serie[i] ?? 0),
      ]),
    }];
  }

  const seg = (ativo: boolean) => `px-3.5 py-1.5 text-[13px] font-medium transition ${ativo ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`;

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Contratos</h1>
          <p className="mt-1 max-w-3xl text-[15px] text-gray-500">Cada contrato é um centro de custo do Senior. Abra um contrato para ver custos, equipe alocada, orçamento base (P0) e previsão. Os valores vêm do Senior.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {podeEditar && fichas && (
            <button onClick={() => void abrirGerenciamento()} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 transition hover:bg-gray-50" title="Escolher os contratos incluídos nos resultados, independentemente da situação operacional.">
              Gerenciar inclusão nos resultados
            </button>
          )}
          <BotaoExcel arquivo="contratos" gerar={abasExcel} desabilitado={carregando || filtradas.length === 0} />
        </div>
      </header>
      {gerenciando && <GerenciarContratosAtivos contratos={paraGerenciar} aoFechar={() => setGerenciando(false)} aoSalvar={() => { setGerenciando(false); void carregarFichas(); }} />}

      <div className="mb-4 flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
        <div className="min-w-[16rem] flex-1">
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Buscar</label>
          <div className="flex items-center gap-2">
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, CCU, cliente ou número…" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
            <FiltroContratos key={acompanhamento} incluirForaDosResultados={acompanhamento !== "incluidos"} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Resultados</label>
          <select value={acompanhamento} onChange={(e) => setAcompanhamento(e.target.value as typeof acompanhamento)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="incluidos">Incluídos nos resultados</option><option value="fora">Fora dos resultados</option><option value="todos">Todos · com histórico</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Tipo</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
            {([["CONTRATO", "Contratos"], ["ADMINISTRATIVO", "Administrativos"], ["todos", "Todos"]] as const).map(([v, n]) => <button key={v} onClick={() => setTipo(v)} className={seg(tipo === v)}>{n}</button>)}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Situação</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
            {([["ATIVO", "Ativos"], ["ENCERRADO", "Encerrados"], ["todos", "Todos"]] as const).map(([v, n]) => <button key={v} onClick={() => setStatus(v)} className={seg(status === v)}>{n}</button>)}
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500">Ordenar por</label>
          <select value={ordem} onChange={(e) => setOrdem(e.target.value as any)} className="rounded-lg border border-gray-200 px-3 py-2 text-sm">
            <option value="custo">Maior custo</option>
            <option value="nome">Nome</option>
            <option value="ccu">CCU</option>
          </select>
        </div>
      </div>

      {carregando ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="h-44 animate-pulse rounded-2xl bg-gray-200/70" />)}
        </div>
      ) : (
        <>
          <p className="mb-3 text-[13px] text-gray-500">
            {filtradas.length} {filtradas.length === 1 ? "contrato" : "contratos"} · custo no período <b className="text-gray-700">{moedaCompacta(totalAno)}</b> (Senior, {mesesAsc[0] ? mesCurto(mesesAsc[0]) : "—"} a {mesCorrente ? mesCurto(mesCorrente) : "—"})
          </p>
          {filtradas.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-14 text-center text-sm text-gray-500">Nenhum contrato com esse filtro (ou sem acesso liberado para você).</div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filtradas.map(({ ficha: f, total, serie, ref, mesRef, var: v }) => {
                const fim = f.vigenciaFim ? new Date(f.vigenciaFim).getTime() : null;
                const dias = fim ? Math.ceil((fim - hoje) / 86_400_000) : null;
                return (
                  <Link key={f.id} href={`/contratos/${f.codccu}`} className="group block rounded-2xl border border-gray-100 bg-white p-5 shadow-soft transition hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-md">
                    <div className="flex items-center gap-2">
                      <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold tabular-nums text-teal-800">CCU {f.codccu}</span>
                      {f.tipo === "ADMINISTRATIVO" && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Administrativo</span>}
                      {f.status === "ENCERRADO" && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-medium text-slate-700">Encerrado</span>}
                      {!f.acompanharResultados && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">Fora dos resultados</span>}
                      <span className="ml-auto text-gray-300 transition group-hover:text-brand">→</span>
                    </div>
                    <h2 className="mt-2 truncate text-lg font-semibold text-gray-900" title={f.nome}>{f.nome}</h2>
                    <p className="truncate text-[13px] text-gray-500">{[f.cliente, f.numero && `nº ${f.numero}`].filter(Boolean).join(" · ") || "Ficha ainda não preenchida"}</p>
                    <div className="mt-4 flex items-end justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-medium uppercase tracking-wide text-gray-400">Custo no período</p>
                        <p className="text-2xl font-semibold tabular-nums text-gray-900">{moedaCompacta(total)}</p>
                        {mesRef && (
                          <p className="text-xs text-gray-500">
                            {mesCurto(mesRef)}: {moedaCompacta(ref)}{" "}
                            {v !== null && <span className={v > 0 ? "text-red-600" : "text-emerald-700"}>{v > 0 ? "▲" : "▼"} {percentual(Math.abs(v), Math.abs(v) < 0.1 ? 1 : 0)}</span>}
                          </p>
                        )}
                      </div>
                      <Sparkline valores={serie} largura={110} altura={34} />
                    </div>
                    {f.vigenciaFim && (
                      <p className={`mt-3 border-t border-gray-100 pt-2 text-xs ${dias !== null && dias < 0 ? "text-red-600" : dias !== null && dias < 90 ? "text-amber-700" : "text-gray-500"}`}>
                        Vigência até {dataBr(f.vigenciaFim)}{dias !== null && (dias < 0 ? " · vencida" : dias < 90 ? ` · faltam ${dias} dias` : "")}
                      </p>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
