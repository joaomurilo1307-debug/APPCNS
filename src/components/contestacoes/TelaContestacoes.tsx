"use client";

// Tela "Contestacoes": tudo pelo sistema, sem e-mail. O financeiro (a Monica, entrando como Julimar) ve as contestacoes de TODOS, muda a etapa (OK / ja realocado no Senior / rejeitar)
// e escreve o andamento; cada pessoa ve aqui as SUAS contestacoes (e as em que foi indicada) e e' avisada pelo sino a cada mudanca. O Senior nao e' alterado: o financeiro ajusta
// o lancamento la e marca "Já realocado" aqui.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LIMITES, ROTULO_STATUS, lerListaDeEmails, type StatusContestacao } from "@/lib/contestacoes";
import { ETAPAS, contarPorStatus, diasEmAberto, emAndamento, filtrar, linhaDoTempo, ordenar, proximasEtapas, tituloDoEvento, type Filtro, type ItemTela } from "@/lib/contestacoesTela";
import { moeda } from "@/lib/custos/formato";

type Contestacao = ItemTela & { linhaCusto: string | null; origem: string; dataLancamento: string | null; anexos: { id: string; nome: string; tamanho: number }[]; emailEnvio?: string | null; emailEnviadoEm?: string | null };

const COR: Record<StatusContestacao, { chip: string; ponto: string; faixa: string }> = {
  PENDENTE: { chip: "bg-amber-100 text-amber-800", ponto: "bg-amber-500", faixa: "border-amber-200" },
  ACEITA: { chip: "bg-sky-100 text-sky-800", ponto: "bg-sky-500", faixa: "border-sky-200" },
  REALOCADA: { chip: "bg-emerald-100 text-emerald-800", ponto: "bg-emerald-500", faixa: "border-gray-100" },
  REJEITADA: { chip: "bg-gray-200 text-gray-700", ponto: "bg-gray-400", faixa: "border-gray-100" },
};
const ROTULO_ACAO = { ACEITA: "OK, vou realocar no Senior", REALOCADA: "Já realocado no Senior", REJEITADA: "Rejeitar" } as const;
const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
const dataBr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export default function TelaContestacoes() {
  const params = useSearchParams();
  const idDaUrl = params.get("id");
  const [itens, setItens] = useState<Contestacao[] | null>(null);
  const [revisor, setRevisor] = useState(false);
  const [admin, setAdmin] = useState(false);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Filtro>({ status: "ABERTAS", busca: "", ccu: "", autorId: "" });
  const [aberto, setAberto] = useState<string | null>(idDaUrl);
  const ancora = useRef<HTMLLIElement>(null);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/contestacoes?visao=aprovacao", { cache: "no-store" }).catch(() => null);
    if (!r) return setErro("Não foi possível carregar as contestações.");
    if (!r.ok) return setErro(r.status === 403 ? "Você não tem acesso às contestações." : "Não foi possível carregar as contestações.");
    const j = await r.json();
    setItens(j.itens ?? []);
    setRevisor(!!j.revisor);
    setAdmin(!!j.admin);
    setErro("");
  }, []);
  useEffect(() => {
    void carregar();
    const t = setInterval(() => void carregar(), 60_000); // quem esta com a tela aberta ve as mudancas sem recarregar
    return () => clearInterval(t);
  }, [carregar]);
  useEffect(() => { if (idDaUrl) setAberto(idDaUrl); }, [idDaUrl]);
  useEffect(() => { if (aberto && itens && ancora.current) ancora.current.scrollIntoView({ block: "center", behavior: "smooth" }); }, [aberto, itens]);

  const contagem = useMemo(() => contarPorStatus(itens ?? []), [itens]);
  const centros = useMemo(() => Array.from(new Map((itens ?? []).map((i) => [i.codccu, i.ccuNome || `CCU ${i.codccu}`])).entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR")), [itens]);
  const autores = useMemo(() => Array.from(new Map((itens ?? []).map((i) => [i.autor.id, i.autor.name])).entries()).sort((a, b) => a[1].localeCompare(b[1], "pt-BR")), [itens]);
  const visiveis = useMemo(() => ordenar(filtrar(itens ?? [], filtro)), [itens, filtro]);

  if (erro && !itens) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{erro}</div>;
  if (!itens) return <div className="space-y-3" aria-busy><div className="h-24 animate-pulse rounded-2xl bg-gray-200/70" /><div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" /></div>;

  const aguardando = contagem.PENDENTE;
  const chip = (id: Filtro["status"], rotulo: string, n?: number) => (
    <button key={id} type="button" aria-pressed={filtro.status === id} onClick={() => setFiltro((f) => ({ ...f, status: id }))}
      className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${filtro.status === id ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
      {rotulo}{n !== undefined && <span className={`ml-1.5 ${filtro.status === id ? "text-white/80" : "text-gray-400"}`}>{n}</span>}
    </button>
  );

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Contestações</h1>
        <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-gray-500">
          {revisor
            ? "Você acompanha as contestações de custo de todos, muda a etapa e escreve o andamento. Quem contestou é avisado pelo sino a cada mudança. O ajuste no Senior é feito por você; aqui você marca como realocado."
            : "Acompanhe aqui as suas contestações de custo e o que o financeiro está fazendo. Você é avisado pelo sino a cada mudança. Para contestar um custo, use o botão Contestar na tela Ao vivo do contrato."}
        </p>
      </header>

      {revisor && aguardando > 0 && (
        <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-[14px] text-amber-900"><b>{aguardando}</b> {aguardando === 1 ? "contestação aguarda" : "contestações aguardam"} a sua decisão.</p>
      )}

      <section aria-label="Resumo por etapa" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {ETAPAS.map((s) => (
          <button key={s} type="button" onClick={() => setFiltro((f) => ({ ...f, status: s }))} className={`rounded-2xl border bg-white p-4 text-left shadow-soft transition hover:shadow-md ${filtro.status === s ? "border-brand ring-1 ring-brand/40" : COR[s].faixa}`}>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-gray-500"><i className={`inline-block h-2 w-2 rounded-full ${COR[s].ponto}`} />{ROTULO_STATUS[s]}</p>
            <p className="mt-1 text-[30px] font-semibold leading-none tabular-nums text-gray-900">{contagem[s]}</p>
          </button>
        ))}
      </section>

      <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-soft" aria-label="Filtros">
        <div className="flex flex-wrap items-center gap-1.5">
          {chip("ABERTAS", "Em andamento", contagem.PENDENTE + contagem.ACEITA)}
          {chip("TODAS", "Todas", itens.length)}
          {ETAPAS.map((s) => chip(s, ROTULO_STATUS[s], contagem[s]))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" value={filtro.busca} onChange={(e) => setFiltro((f) => ({ ...f, busca: e.target.value }))} placeholder="Buscar fornecedor, OC, título, contrato ou pessoa…" aria-label="Buscar" className="min-w-[260px] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-[13.5px] focus:border-brand focus:outline-none" />
          <select value={filtro.ccu} onChange={(e) => setFiltro((f) => ({ ...f, ccu: e.target.value }))} aria-label="Centro de custo" className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13.5px] focus:border-brand focus:outline-none">
            <option value="">Todos os centros de custo</option>
            {centros.map(([ccu, nome]) => <option key={ccu} value={ccu}>{nome}</option>)}
          </select>
          {revisor && (
            <select value={filtro.autorId} onChange={(e) => setFiltro((f) => ({ ...f, autorId: e.target.value }))} aria-label="Quem contestou" className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13.5px] focus:border-brand focus:outline-none">
              <option value="">Todas as pessoas</option>
              {autores.map(([id, nome]) => <option key={id} value={id}>{nome}</option>)}
            </select>
          )}
        </div>
      </section>

      {itens.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-12 text-center text-sm text-gray-600">Ainda não há contestações{revisor ? "" : " suas"}. Para contestar um custo, abra o contrato, vá em Custos, depois Ao vivo, e use o botão <b>Contestar</b> no lançamento.</p>
      ) : visiveis.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-10 text-center text-sm text-gray-600">Nenhuma contestação com esses filtros.</p>
      ) : (
        <ul className="space-y-3">
          {visiveis.map((c) => (
            <Cartao key={c.id} c={c} revisor={revisor} aberto={aberto === c.id} ancora={aberto === c.id ? ancora : undefined} onAbrir={() => setAberto((a) => (a === c.id ? null : c.id))} onMudou={carregar} />
          ))}
        </ul>
      )}

      {admin && <ConfigEmail itens={itens} />}
    </div>
  );
}

function Cartao({ c, revisor, aberto, ancora, onAbrir, onMudou }: { c: Contestacao; revisor: boolean; aberto: boolean; ancora?: React.Ref<HTMLLIElement>; onAbrir: () => void; onMudou: () => Promise<void> }) {
  const [acao, setAcao] = useState<"ACEITA" | "REALOCADA" | "REJEITADA" | null>(null);
  const [texto, setTexto] = useState("");
  const [recado, setRecado] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const tempo = linhaDoTempo(c);
  const ultimo = tempo[tempo.length - 1];
  const dias = diasEmAberto(c.criadoEm, Date.now());

  async function enviar(url: string, metodo: string, corpo: unknown, depois: () => void) {
    setSalvando(true); setErro("");
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: JSON.stringify(corpo) }).catch(() => null);
    const j = r ? await r.json().catch(() => ({})) : {};
    setSalvando(false);
    if (!r || !r.ok) return setErro(typeof j.error === "string" ? j.error : "Não foi possível salvar. Tente de novo.");
    depois();
    await onMudou();
  }
  const confirmar = () => acao && void enviar(`/api/contestacoes/${c.id}`, "PATCH", { status: acao, parecer: texto.trim() || null }, () => { setAcao(null); setTexto(""); });
  const mandarRecado = () => void enviar(`/api/contestacoes/${c.id}/andamento`, "POST", { texto: recado }, () => setRecado(""));

  return (
    <li ref={ancora} id={c.id} className={`rounded-2xl border bg-white shadow-soft ${aberto ? "border-brand/40 ring-1 ring-brand/20" : COR[c.status].faixa}`}>
      <button type="button" onClick={onAbrir} aria-expanded={aberto} className="flex w-full flex-wrap items-start justify-between gap-3 p-4 text-left">
        <div className="min-w-0">
          <p className="truncate text-[15px] font-semibold text-gray-900">{c.fornecedor}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            <span className="rounded-md bg-sky-50 px-2 py-0.5 font-medium text-sky-800">OC {c.numOcp ?? "não ligada"}</span>
            <span className="rounded-md bg-violet-50 px-2 py-0.5 font-medium text-violet-800">Título {c.numTit ?? "sem título"}</span>
            <span className="text-gray-500">{moeda(c.valor)} · {c.ccuNome || `CCU ${c.codccu}`}</span>
          </p>
          <p className="mt-1 text-xs text-gray-500">
            Contestado por <b className="text-gray-700">{c.autor.name}</b> em {dataHora(c.criadoEm)}{emAndamento(c.status) && ` · há ${dias} ${dias === 1 ? "dia" : "dias"}`}
            {ultimo && ultimo.tipo !== "CRIADA" && <> · último andamento: {tituloDoEvento(ultimo)} ({dataHora(ultimo.em)})</>}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${COR[c.status].chip}`}>{ROTULO_STATUS[c.status]}</span>
      </button>

      {aberto && (
        <div className="space-y-4 border-t border-gray-100 p-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">O que foi contestado</p>
            <p className="mt-1 whitespace-pre-wrap rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">{c.justificativa}</p>
            <p className="mt-1.5 text-xs text-gray-500">
              {c.linhaCusto && <>Linha de custo: {c.linhaCusto} · </>}{c.dataLancamento && <>Lançamento de {dataBr(c.dataLancamento)} · </>}CCU {c.codccu}
              {c.indicado && <> · responsável indicado: <b>{c.indicado.name}</b></>}
            </p>
            {c.anexos.length > 0 && (
              <ul className="mt-2 flex flex-wrap gap-2">
                {c.anexos.map((a) => <li key={a.id}><a href={`/api/contestacoes/${c.id}/anexos/${a.id}`} className="inline-flex items-center gap-1 rounded-md border border-gray-200 px-2 py-1 text-xs text-brand-dark hover:bg-gray-50">📎 {a.nome} <span className="text-gray-400">({(a.tamanho / 1024 / 1024).toFixed(1)} MB)</span></a></li>)}
              </ul>
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Andamento</p>
            <ol className="mt-2 space-y-3 border-l-2 border-gray-100 pl-4">
              {tempo.map((e) => (
                <li key={e.id} className="relative">
                  <i className={`absolute -left-[22px] top-1.5 h-2.5 w-2.5 rounded-full ring-2 ring-white ${e.tipo === "NOTA" ? "bg-gray-300" : COR[(e.status as StatusContestacao) ?? "PENDENTE"]?.ponto ?? "bg-gray-300"}`} />
                  <p className="text-[13px] font-semibold text-gray-800">{tituloDoEvento(e)} <span className="font-normal text-gray-500">· {e.porNome}{e.via === "e-mail" ? " (por e-mail)" : ""} · {dataHora(e.em)}</span></p>
                  {e.texto && e.tipo !== "CRIADA" && <p className="mt-0.5 whitespace-pre-wrap text-[13px] text-gray-600">{e.texto}</p>}
                </li>
              ))}
            </ol>
          </div>

          {emAndamento(c.status) && (
            <div className="space-y-3">
              {revisor && acao === null && (
                <div className="flex flex-wrap gap-2">
                  {proximasEtapas(c.status).map((e) => (
                    <button key={e} type="button" onClick={() => { setAcao(e); setTexto(""); setErro(""); }} className={`rounded-lg px-4 py-1.5 text-sm font-semibold ${e === "REALOCADA" ? "bg-emerald-600 text-white hover:bg-emerald-700" : e === "ACEITA" ? "bg-sky-600 text-white hover:bg-sky-700" : "border border-gray-300 text-gray-700 hover:bg-gray-50"}`}>{ROTULO_ACAO[e]}</button>
                  ))}
                </div>
              )}
              {revisor && acao !== null && (
                <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
                  <p className="mb-1 text-sm font-medium text-gray-700">{ROTULO_ACAO[acao]}</p>
                  <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={LIMITES.parecerMax} placeholder={acao === "REJEITADA" ? "Motivo (obrigatório)" : "Observação para quem contestou (opcional)"} className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
                  <p className="mt-1 text-xs text-gray-500">Quem contestou será avisado pelo sino.{acao === "REALOCADA" && " Marque só depois de ajustar o lançamento no Senior."}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={confirmar} disabled={salvando} className="rounded-md bg-brand px-4 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{salvando ? "Salvando…" : "Confirmar"}</button>
                    <button type="button" onClick={() => { setAcao(null); setErro(""); }} className="rounded-md border border-gray-300 px-4 py-1.5 text-sm text-gray-600 hover:bg-white">Cancelar</button>
                  </div>
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-gray-500" htmlFor={`recado-${c.id}`}>{revisor ? "Escrever o andamento (a pessoa é avisada)" : "Escrever um recado para o financeiro"}</label>
                <div className="mt-1 flex gap-2">
                  <input id={`recado-${c.id}`} value={recado} onChange={(e) => setRecado(e.target.value)} maxLength={2000} placeholder={revisor ? "Ex.: Estou ajustando no Senior, termino hoje." : "Ex.: Segue a nota que comprova."} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-brand focus:outline-none" />
                  <button type="button" onClick={mandarRecado} disabled={salvando || recado.trim().length < 3} className="rounded-md border border-brand px-4 py-1.5 text-sm font-semibold text-brand hover:bg-brand/5 disabled:opacity-50">Enviar</button>
                </div>
              </div>
              {erro && <p role="alert" className="text-sm text-red-700">{erro}</p>}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Envio por e-mail: fica para depois (o servidor de e-mail ainda recusa o login); so' o administrador ve. Mantem a lista de quem recebe e o resultado do ultimo envio. */
function ConfigEmail({ itens }: { itens: Contestacao[] }) {
  const [emails, setEmails] = useState("");
  const [destinos, setDestinos] = useState<string[]>([]);
  const [msg, setMsg] = useState("");
  useEffect(() => { fetch("/api/contestacoes/config", { cache: "no-store" }).then(async (r) => { if (r.ok) { const j = await r.json(); setEmails(j.emails ?? ""); setDestinos(j.destinos ?? []); } }).catch(() => {}); }, []);
  const ultimo = itens.find((i) => i.emailEnvio);
  async function salvar() {
    setMsg("");
    const { invalidos } = lerListaDeEmails(emails);
    if (invalidos.length) return setMsg(`E-mail inválido: ${invalidos.join(", ")}`);
    const r = await fetch("/api/contestacoes/config", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ emails }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setMsg(typeof j.error === "string" ? j.error : "Não foi possível salvar.");
    setEmails(j.emails ?? ""); setDestinos(j.destinos ?? []); setMsg("Salvo.");
  }
  return (
    <details className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
      <summary className="cursor-pointer text-[14px] font-semibold text-gray-800">Envio por e-mail (a configurar depois)</summary>
      <div className="mt-3 space-y-2 text-sm text-gray-600">
        <p>Por enquanto tudo acontece aqui, pelo sistema. O e-mail do pedido ainda depende do servidor de e-mail aceitar o login do sistema.</p>
        {ultimo && <p className="text-xs text-gray-500">Último envio tentado: {ultimo.emailEnvio}</p>}
        <label className="block text-xs font-medium text-gray-500" htmlFor="emails-contestacao">E-mails que recebem os pedidos (separados por vírgula)</label>
        <div className="flex gap-2"><input id="emails-contestacao" value={emails} onChange={(e) => setEmails(e.target.value)} className="min-w-0 flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm" /><button type="button" onClick={salvar} className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50">Salvar</button></div>
        {msg && <p className="text-xs text-gray-600">{msg}</p>}
        {destinos.length > 0 && <p className="text-xs text-gray-500">Hoje recebem: {destinos.join(", ")}</p>}
      </div>
    </details>
  );
}
