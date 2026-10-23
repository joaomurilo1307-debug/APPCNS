"use client";

// Secao "Contestacoes de custo" da tela Aprovacoes. O financeiro (modulo "Aprovar contestacoes de custo") ve todas e decide; quem contestou ou foi
// indicado como responsavel ve as suas, so' para acompanhar. Aceitar NAO altera o Senior: o financeiro ajusta o lancamento la.

import { useCallback, useEffect, useState } from "react";
import { LIMITES, ROTULO_STATUS, lerListaDeEmails, type StatusContestacao } from "@/lib/contestacoes";
import { moeda } from "@/lib/custos/formato";

type Contestacao = {
  id: string; criadoEm: string; codccu: string; ccuNome: string | null; origem: string; numTit: string | null; numOcp: string | null; fornecedor: string;
  linhaCusto: string | null; valor: number; dataLancamento: string | null; justificativa: string; status: StatusContestacao; parecer: string | null; decididoEm: string | null;
  autor: { id: string; name: string }; indicado: { id: string; name: string } | null; decididoPor: { id: string; name: string } | null;
  anexos: { id: string; nome: string; tamanho: number }[];
};

const COR: Record<StatusContestacao, string> = { PENDENTE: "bg-amber-100 text-amber-800", ACEITA: "bg-emerald-100 text-emerald-800", REJEITADA: "bg-gray-200 text-gray-700" };
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export default function ContestacoesDeCusto() {
  const [itens, setItens] = useState<Contestacao[] | null>(null);
  const [revisor, setRevisor] = useState(false);
  const [decidindo, setDecidindo] = useState<{ id: string; status: "ACEITA" | "REJEITADA" } | null>(null);
  const [parecer, setParecer] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [verDecididas, setVerDecididas] = useState(false);
  // e-mails que recebem os pedidos (so' o financeiro que revisa edita)
  const [emails, setEmails] = useState("");
  const [destinos, setDestinos] = useState<string[]>([]);
  const [msgEmails, setMsgEmails] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch("/api/contestacoes?visao=aprovacao", { cache: "no-store" }).catch(() => null);
    if (!r?.ok) return setItens([]);
    const j = await r.json();
    setItens(j.itens ?? []);
    setRevisor(!!j.revisor);
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => {
    if (!revisor) return;
    fetch("/api/contestacoes/config", { cache: "no-store" }).then(async (r) => { if (r.ok) { const j = await r.json(); setEmails(j.emails ?? ""); setDestinos(j.destinos ?? []); } }).catch(() => {});
  }, [revisor]);

  async function salvarEmails() {
    setMsgEmails("");
    const { invalidos } = lerListaDeEmails(emails);
    if (invalidos.length) return setMsgEmails(`E-mail inválido: ${invalidos.join(", ")}`);
    const r = await fetch("/api/contestacoes/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsgEmails(typeof j.error === "string" ? j.error : "Não foi possível salvar.");
    setEmails(j.emails ?? ""); setDestinos(j.destinos ?? []); setMsgEmails("Salvo.");
  }

  async function decidir() {
    if (!decidindo) return;
    setSalvando(true); setErro("");
    const r = await fetch(`/api/contestacoes/${decidindo.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: decidindo.status, parecer: parecer.trim() || null }) });
    const j = await r.json().catch(() => ({}));
    setSalvando(false);
    if (!r.ok) return setErro(typeof j.error === "string" ? j.error : "Não foi possível registrar a decisão.");
    setDecidindo(null); setParecer("");
    await carregar();
  }

  if (!itens || (itens.length === 0 && !revisor)) return null;
  const pendentes = itens.filter((c) => c.status === "PENDENTE");
  const decididas = itens.filter((c) => c.status !== "PENDENTE");

  const cartao = (c: Contestacao) => (
    <li key={c.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-gray-900">{c.fornecedor}</p>
          <p className="mt-0.5 flex flex-wrap gap-1.5 text-xs">
            <span className="rounded-md bg-sky-50 px-2 py-0.5 font-medium text-sky-800">OC {c.numOcp ?? "não ligada"}</span>
            <span className="rounded-md bg-violet-50 px-2 py-0.5 font-medium text-violet-800">Título {c.numTit ?? "sem título"}</span>
          </p>
          <p className="text-sm text-gray-500">{moeda(c.valor)} · {c.ccuNome || `CC ${c.codccu}`}{c.linhaCusto ? ` · ${c.linhaCusto}` : ""}{c.dataLancamento ? ` · ${dataBr(c.dataLancamento)}` : ""}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR[c.status]}`}>{ROTULO_STATUS[c.status]}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{c.justificativa}</p>
      <p className="mt-2 text-xs text-gray-500">
        Contestado por <b>{c.autor.name}</b> em {dataHora(c.criadoEm)}
        {c.indicado && <> · responsável indicado: <b>{c.indicado.name}</b></>}
      </p>
      {c.anexos.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {c.anexos.map((a) => (
            <li key={a.id}><a href={`/api/contestacoes/${c.id}/anexos/${a.id}`} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-brand-dark hover:bg-gray-50">📎 {a.nome} <span className="text-gray-400">({(a.tamanho / 1024 / 1024).toFixed(1)} MB)</span></a></li>
          ))}
        </ul>
      )}
      {c.status !== "PENDENTE" && (
        <p className="mt-2 text-sm text-gray-600">{c.decididoPor?.name ?? "Financeiro"} {c.status === "ACEITA" ? "aceitou" : "rejeitou"} em {c.decididoEm ? dataHora(c.decididoEm) : ""}.{c.parecer ? ` Parecer: ${c.parecer}` : ""}{c.status === "ACEITA" ? " O ajuste no Senior é feito pelo financeiro." : ""}</p>
      )}
      {revisor && c.status === "PENDENTE" && (
        decidindo?.id === c.id ? (
          <div className="mt-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <p className="mb-1 text-sm font-medium text-gray-700">{decidindo.status === "ACEITA" ? "Aceitar a contestação" : "Rejeitar a contestação"}</p>
            <textarea value={parecer} onChange={(e) => setParecer(e.target.value)} rows={3} maxLength={LIMITES.parecerMax} placeholder={decidindo.status === "REJEITADA" ? "Motivo da rejeição (obrigatório)" : "Parecer (opcional)"} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" />
            {erro && <p role="alert" className="mt-1 text-sm text-red-700">{erro}</p>}
            <div className="mt-2 flex gap-2">
              <button onClick={decidir} disabled={salvando} className={`rounded-md px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-60 ${decidindo.status === "ACEITA" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-gray-700 hover:bg-gray-800"}`}>{salvando ? "Salvando…" : "Confirmar"}</button>
              <button onClick={() => { setDecidindo(null); setParecer(""); setErro(""); }} className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-white">Cancelar</button>
            </div>
          </div>
        ) : (
          <div className="mt-3 flex gap-2">
            <button onClick={() => { setDecidindo({ id: c.id, status: "ACEITA" }); setParecer(""); setErro(""); }} className="rounded-md bg-emerald-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700">Aceitar</button>
            <button onClick={() => { setDecidindo({ id: c.id, status: "REJEITADA" }); setParecer(""); setErro(""); }} className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-700 hover:bg-gray-50">Rejeitar</button>
          </div>
        )
      )}
    </li>
  );

  return (
    <section id="contestacoes" className="mb-8">
      <h2 className="mb-1 text-sm font-semibold text-gray-600">Contestações de custo ({pendentes.length} aguardando)</h2>
      <p className="mb-3 text-xs text-gray-500">{revisor ? "Pedidos feitos na tela Ao vivo dos contratos. Aceitar registra a decisão; o ajuste no Senior é do financeiro." : "As contestações que você fez ou em que foi indicado como responsável. A decisão é do financeiro."}</p>
      {revisor && (
        <div className="mb-3 rounded-xl border border-gray-200 bg-white p-3">
          <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">E-mails que recebem os pedidos de contestação</label>
          <div className="flex flex-wrap items-center gap-2">
            <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="nome@consominas.com.br, outro@consominas.com.br" className="min-w-[260px] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" />
            <button type="button" onClick={salvarEmails} className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium hover:bg-gray-50">Salvar</button>
            {msgEmails && <span className={`text-xs ${msgEmails === "Salvo." ? "text-emerald-700" : "text-red-700"}`}>{msgEmails}</span>}
          </div>
          <p className="mt-1 text-[11px] text-gray-400">Cada pedido chega por e-mail com a OC, o título e a descrição. Recebem também as pessoas com o módulo “Aprovar contestações de custo”{destinos.length ? ` (hoje: ${destinos.join(", ")})` : ""}.</p>
        </div>
      )}
      {pendentes.length > 0 ? <ul className="space-y-3">{pendentes.map(cartao)}</ul> : <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">Nenhuma contestação aguardando decisão.</p>}
      {decididas.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setVerDecididas((v) => !v)} className="text-[13px] font-medium text-brand hover:text-brand-dark">{verDecididas ? "Ocultar" : "Ver"} decididas ({decididas.length})</button>
          {verDecididas && <ul className="mt-2 space-y-3">{decididas.map(cartao)}</ul>}
        </div>
      )}
    </section>
  );
}
