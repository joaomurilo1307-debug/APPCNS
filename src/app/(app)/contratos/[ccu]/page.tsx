"use client";

// Pagina de um contrato: abas Visao geral, Custos (a tela de custos por centro de custo, travada neste contrato), Custo de pessoal,
// P0 e Previsao. A aba ativa fica na URL (?aba=...), entao o link e' compartilhavel.

import Link from "next/link";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import CustoPorContratoView from "@/components/custos/CustoPorContratoView";
import { AbaP0, AbaPessoal, AbaPrevisao, AbaFichaContrato } from "@/components/contratos/AbasContrato";
import FichaEditor, { type FichaContrato } from "@/components/contratos/FichaEditor";
import BotaoDossie from "@/components/contratos/BotaoDossie";
import { AbaMedicaoDoContrato, useMedicaoDoContrato } from "@/components/contratos/MedicaoDoContrato";
import ControleAcompanhamentoContrato from "@/components/contratos/ControleAcompanhamentoContrato";
import PainelMetasContrato from "@/components/contractGoals/PainelMetasContrato";
import GraficosDoContrato from "@/components/contratos/GraficosDoContrato";
import { normalizarPeriodoConsolidado } from "@/lib/medicao/consolidado";

const ABAS = [
  { id: "visao", nome: "Visão geral" },
  { id: "ficha", nome: "Ficha e projetos" },
  { id: "metas", nome: "Metas" },
  { id: "acoes", nome: "Planos de Ação" },
  { id: "medicao", nome: "Receita e Medição" },
  { id: "custos", nome: "Custos" },
  { id: "pessoal", nome: "Custo de pessoal" },
  { id: "p0", nome: "P0" },
  { id: "previsao", nome: "Previsão" },
] as const;

const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

function Pagina() {
  const { ccu } = useParams<{ ccu: string }>();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const aba = (ABAS.find((a) => a.id === params.get("aba"))?.id ?? "visao") as (typeof ABAS)[number]["id"];

  const [ficha, setFicha] = useState<FichaContrato | null>(null);
  const [podeEditar, setPodeEditar] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [editando, setEditando] = useState(false);
  const medicao = useMedicaoDoContrato(ccu);
  const mesAtual = medicao.estado === "ok" ? medicao.dados.mesAtual : new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const de = params.get("de"), ate = params.get("ate");
  const periodo = useMemo(() => normalizarPeriodoConsolidado(de, ate, mesAtual), [de, ate, mesAtual]);
  const mudarPeriodo = useCallback((de: string, ate: string) => {
    const n = new URLSearchParams(params.toString());
    const p = normalizarPeriodoConsolidado(de, ate, mesAtual);
    n.set("de", p.de); n.set("ate", p.ate);
    router.replace(`${pathname}?${n}`, { scroll: false });
  }, [mesAtual, params, pathname, router]);

  useEffect(() => {
    const controller = new AbortController();
    setFicha(null); setErro(null); setEditando(false);
    fetch(`/api/contratos/${encodeURIComponent(ccu)}`, { cache: "no-store", signal: controller.signal }).then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (controller.signal.aborted) return;
      if (!r.ok) return setErro(d.error || "Contrato não encontrado");
      setFicha(d.contrato); setPodeEditar(!!d.podeEditar);
    }).catch(() => { if (!controller.signal.aborted) setErro("Não foi possível carregar a ficha do contrato."); });
    return () => controller.abort();
  }, [ccu]);

  const irParaAba = useCallback((a: string) => {
    const n = new URLSearchParams(params.toString());
    if (a === "visao") n.delete("aba"); else n.set("aba", a);
    router.replace(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  if (erro) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-base font-medium text-gray-700">{erro}</p>
        <Link href="/contratos" className="mt-3 inline-block text-sm font-medium text-brand">← Voltar para Contratos</Link>
      </div>
    );
  }
  if (!ficha) return <div className="space-y-4" aria-busy><div className="h-10 w-96 animate-pulse rounded-lg bg-gray-200" /><div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" /></div>;

  return (
    <div className="mx-auto max-w-[1400px]">
      <Link href="/contratos" className="text-[13px] font-medium text-brand hover:text-brand-dark">← Contratos</Link>
      <header className="mt-1 mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-teal-50 px-2.5 py-0.5 text-lg font-semibold tabular-nums text-teal-800">CCU {ficha.codccu}</span>
            {ficha.tipo === "ADMINISTRATIVO" && <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-600">Administrativo</span>}
            {ficha.status === "ENCERRADO" && <span className="rounded-full bg-slate-200 px-2.5 py-0.5 text-xs font-medium text-slate-700">Encerrado</span>}
          </div>
          <h1 className="mt-1 truncate text-3xl font-semibold tracking-tight text-gray-900">{ficha.nome}</h1>
          <p className="mt-0.5 text-[14px] text-gray-500">
            {[ficha.cliente, ficha.numero && `contrato ${ficha.numero}`, ficha.vigenciaFim && `vigência até ${dataBr(ficha.vigenciaFim)}`].filter(Boolean).join(" · ") || "Ficha do contrato ainda não preenchida"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <BotaoDossie ficha={ficha} />
          {podeEditar && <button onClick={() => setEditando(true)} className="rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50">Editar ficha</button>}
        </div>
      </header>

      {podeEditar && <ControleAcompanhamentoContrato ficha={ficha} onSalvo={setFicha} />}

      <nav className="mb-5 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-gray-200" aria-label="Seções do contrato">
        {ABAS.map((a) => (
          <button key={a.id} onClick={() => irParaAba(a.id)} className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[14px] font-medium transition ${aba === a.id ? "border-brand text-brand" : "border-transparent text-gray-500 hover:text-gray-800"}`}>
            {a.nome}
          </button>
        ))}
      </nav>

      {aba === "visao" && <GraficosDoContrato key={ficha.codccu} codccu={ficha.codccu} medicao={medicao} periodo={periodo} onPeriodo={mudarPeriodo} />}
      {aba === "ficha" && <AbaFichaContrato ficha={ficha} irParaAba={irParaAba} />}
      {aba === "metas" && <PainelMetasContrato key={`metas:${ficha.codccu}`} codccu={ficha.codccu} modo="metas" />}
      {aba === "acoes" && <PainelMetasContrato key={`acoes:${ficha.codccu}`} codccu={ficha.codccu} modo="acoes" />}
      {aba === "medicao" && <AbaMedicaoDoContrato key={ficha.codccu} estado={medicao} periodo={periodo} onPeriodo={mudarPeriodo} />}
      {aba === "custos" && <CustoPorContratoView ccuFixo={ficha.codccu} />}
      {aba === "pessoal" && <AbaPessoal />}
      {aba === "p0" && <AbaP0 key={ficha.codccu} codccu={ficha.codccu} nomeContrato={ficha.nome} />}
      {aba === "previsao" && <AbaPrevisao codccu={ficha.codccu} />}

      {editando && <FichaEditor ficha={ficha} onSalvo={(f) => { setFicha(f); setEditando(false); }} onFechar={() => setEditando(false)} />}
    </div>
  );
}

export default function ContratoPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-gray-500">Carregando...</div>}>
      <Pagina />
    </Suspense>
  );
}
