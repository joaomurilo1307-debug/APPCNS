"use client";

// Lista de demandas de projetos (gestao e contratante usam o mesmo componente; o contratante so' ve as dos contratos a que esta ligado).
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Barra, dataBr, Pill, PRIORIDADE_COR, PRIORIDADE_ROTULO, STATUS_COR, STATUS_ROTULO } from "./comum";
import EscolhaDePessoas, { type PessoaOpcao } from "./Pessoas";

type Demanda = {
  id: string; titulo: string; status: string; prioridade: string; prazoDesejado: string | null; createdAt: string; projectId: string | null;
  contrato: { codccu: string; nome: string }; nucleo?: { id: string; name: string } | null; solicitante: { id: string; name: string; role: string };
  itensTotal: number; itensFeitos: number; andamento: number | null; projetoStatus: string | null;
  atendentes?: { id: string; name: string }[]; paraMim?: boolean; anexadaProjectId?: string | null;
};
type Opcoes = { contratos: { codccu: string; nome: string; cliente: string | null }[]; equipes: { id: string; name: string }[]; nucleos?: { id: string; name: string }[]; pessoas?: PessoaOpcao[]; podeGerir: boolean };

export default function DemandasView({ base, modo }: { base: string; modo: "gestor" | "cliente" }) {
  const [lista, setLista] = useState<Demanda[] | null>(null);
  const [opcoes, setOpcoes] = useState<Opcoes | null>(null);
  const [erro, setErro] = useState("");
  const [status, setStatus] = useState("todas");
  const [contrato, setContrato] = useState("");
  const [nucleo, setNucleo] = useState("");
  const [busca, setBusca] = useState("");
  const [novo, setNovo] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch("/api/demandas", { cache: "no-store" });
    if (!r.ok) return setErro((await r.json().catch(() => ({}))).error || "Erro ao carregar");
    setLista((await r.json()).demandas);
  }, []);
  useEffect(() => {
    void carregar();
    fetch("/api/demandas/opcoes").then(async (r) => (r.ok ? setOpcoes(await r.json()) : null));
  }, [carregar]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = { todas: lista?.length ?? 0 };
    for (const d of lista ?? []) { c[d.status] = (c[d.status] ?? 0) + 1; if (d.paraMim) c.paraMim = (c.paraMim ?? 0) + 1; }
    return c;
  }, [lista]);
  const filtradas = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return (lista ?? []).filter((d) => (status === "todas" || (status === "paraMim" ? !!d.paraMim : d.status === status)) && (!contrato || d.contrato.codccu === contrato) && (!nucleo || d.nucleo?.id === nucleo) && (!t || `${d.titulo} ${d.contrato.nome} ${d.solicitante.name}`.toLowerCase().includes(t)));
  }, [lista, status, contrato, nucleo, busca]);

  const abas: [string, string][] = [["todas", "Todas"], ...(modo === "gestor" ? ([["paraMim", "Pedidas para mim"]] as [string, string][]) : []), ["NOVA", "Novas"], ["EM_ANALISE", "Em análise"], ["EM_PROJETO", "Em projeto"], ["CONCLUIDA", "Concluídas"], ["RECUSADA", "Recusadas"]];

  return (
    <div className="mx-auto max-w-5xl">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{modo === "cliente" ? "Suas demandas" : "Demandas de projetos"}</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">
            {modo === "cliente" ? "Registre o que você precisa para o contrato, em forma de lista, e acompanhe a análise e a execução." : "Pedidos de projeto por contrato, feitos pela gestão ou pelo contratante. Analise, abra o projeto a partir da demanda, delegue e execute, com o contratante acompanhando."}
          </p>
        </div>
        <button onClick={() => setNovo(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark">+ Nova demanda</button>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {abas.map(([k, n]) => (
          <button key={k} onClick={() => setStatus(k)} className={`rounded-full border px-3 py-1 text-[13px] font-medium transition ${status === k ? "border-brand bg-brand text-white" : k === "paraMim" && (contagem.paraMim ?? 0) > 0 ? "border-indigo-300 bg-indigo-50 text-indigo-800 hover:bg-indigo-100" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
            {n} <span className="opacity-70">{contagem[k] ?? 0}</span>
          </button>
        ))}
        <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar…" className="ml-auto w-48 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
        {opcoes && (opcoes.nucleos?.length ?? 0) > 0 && (lista ?? []).some((d) => d.nucleo) && (
          <select value={nucleo} onChange={(e) => setNucleo(e.target.value)} className="max-w-[14rem] rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
            <option value="">Todos os núcleos</option>
            {opcoes.nucleos!.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
          </select>
        )}
        {opcoes && opcoes.contratos.length > 1 && (
          <select value={contrato} onChange={(e) => setContrato(e.target.value)} className="max-w-[16rem] rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
            <option value="">Todos os contratos</option>
            {opcoes.contratos.map((c) => <option key={c.codccu} value={c.codccu}>{c.codccu} · {c.nome}</option>)}
          </select>
        )}
      </div>

      {erro && <p className="text-sm text-red-600">{erro}</p>}
      {!lista && !erro ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200/70" />)}</div>
      ) : filtradas.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-200 bg-white/70 px-6 py-14 text-center">
          <p className="text-base font-medium text-gray-700">{(lista ?? []).length === 0 ? "Nenhuma demanda ainda." : "Nenhuma demanda com esse filtro."}</p>
          {(lista ?? []).length === 0 && <p className="mt-1 text-sm text-gray-500">Use “Nova demanda” para registrar o primeiro pedido.</p>}
        </div>
      ) : (
        <ul className="space-y-3">
          {filtradas.map((d) => (
            <li key={d.id}>
              <Link href={`${base}/${d.id}`} className="block rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:border-brand/40 hover:shadow-md">
                <div className="flex flex-wrap items-center gap-2">
                  <Pill cor={STATUS_COR[d.status]}>{STATUS_ROTULO[d.status]}</Pill>
                  {d.prioridade !== "NORMAL" && <Pill cor={PRIORIDADE_COR[d.prioridade]}>{PRIORIDADE_ROTULO[d.prioridade]}</Pill>}
                  <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">CCU {d.contrato.codccu}</span>
                  {d.nucleo && <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">Núcleo {d.nucleo.name}</span>}
                  {d.paraMim && <span className="rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">Para você</span>}
                  <span className="ml-auto text-xs text-gray-400">{dataBr(d.createdAt)}</span>
                </div>
                <h2 className="mt-2 text-base font-semibold text-gray-900">{d.titulo}</h2>
                <p className="text-[13px] text-gray-500">{d.contrato.nome} · pedido por {d.solicitante.name}{d.atendentes && d.atendentes.length > 0 && modo === "gestor" ? ` · para ${d.atendentes.map((a) => a.name).join(", ")}` : ""}{d.prazoDesejado ? ` · prazo desejado ${dataBr(d.prazoDesejado)}` : ""}</p>
                <div className="mt-3 flex items-center gap-3">
                  {d.andamento !== null ? (
                    <><div className="flex-1"><Barra pct={d.andamento} /></div><span className="text-xs tabular-nums text-gray-500">{d.andamento}% do projeto</span></>
                  ) : (
                    <span className="text-xs text-gray-500">{d.itensTotal ? `${d.itensTotal} ${d.itensTotal === 1 ? "item" : "itens"} na lista` : "Sem itens na lista"}</span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {novo && opcoes && <NovaDemanda opcoes={opcoes} onFechar={() => setNovo(false)} onCriada={(id) => { setNovo(false); window.location.href = `${base}/${id}`; }} />}
      {novo && !opcoes && <div className="fixed inset-0 z-50 bg-black/30" />}
    </div>
  );
}

function NovaDemanda({ opcoes, onFechar, onCriada }: { opcoes: Opcoes; onFechar: () => void; onCriada: (id: string) => void }) {
  const [f, setF] = useState({ contrato: opcoes.contratos.length === 1 ? opcoes.contratos[0].codccu : "", titulo: "", descricao: "", prioridade: "NORMAL", prazo: "", nucleoId: "" });
  const [itens, setItens] = useState<string[]>([]);
  const [atendentes, setAtendentes] = useState<string[]>([]);
  const [novoItem, setNovoItem] = useState("");
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);
  const campo = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none";
  const rot = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
  const addItem = () => { const t = novoItem.trim(); if (t) { setItens((x) => [...x, t]); setNovoItem(""); } };

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!f.contrato) return setErro("Escolha o contrato.");
    setSalvando(true); setErro("");
    const pendente = novoItem.trim();
    const r = await fetch("/api/demandas", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contrato: f.contrato, titulo: f.titulo, descricao: f.descricao || undefined, prioridade: f.prioridade, prazoDesejado: f.prazo || null, nucleoId: f.nucleoId || undefined, atendentes: atendentes.length ? atendentes : undefined, itens: pendente ? [...itens, pendente] : itens }) });
    setSalvando(false);
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return setErro(typeof d.error === "string" ? d.error : "Confira os campos (o título precisa ter pelo menos 3 letras).");
    onCriada(d.id);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onFechar}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Nova demanda</h2>
        <p className="mb-4 text-[13px] text-gray-500">Descreva o pedido e liste o que precisa ser feito. A gestão analisa e pode abrir um projeto a partir dela.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={rot}>Contrato</label>
            <select className={campo} value={f.contrato} onChange={(e) => setF({ ...f, contrato: e.target.value })} required>
              <option value="">Escolha…</option>
              {opcoes.contratos.map((c) => <option key={c.codccu} value={c.codccu}>{c.codccu} · {c.nome}</option>)}
            </select>
            {opcoes.contratos.length === 0 && <p className="mt-1 text-xs text-amber-700">Você ainda não está ligado a nenhum contrato. Peça ao administrador.</p>}
          </div>
          {(opcoes.nucleos?.length ?? 0) > 0 && (
            <div className="sm:col-span-2">
              <label className={rot}>Núcleo que vai atender (opcional)</label>
              <select className={campo} value={f.nucleoId} onChange={(e) => setF({ ...f, nucleoId: e.target.value })}>
                <option value="">Sem núcleo definido</option>
                {opcoes.nucleos!.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
              <p className="mt-1 text-xs text-gray-400">O coordenador e o gerente do núcleo escolhido passam a ver e controlar esta demanda.</p>
            </div>
          )}
          {(opcoes.pessoas?.length ?? 0) > 0 && (
            <div className="sm:col-span-2">
              <label className={rot}>Quem vai atender (opcional)</label>
              <EscolhaDePessoas pessoas={opcoes.pessoas!} valor={atendentes} onChange={setAtendentes} max={10} vazio="Ninguém em particular: a gestão distribui." />
              <p className="mt-1 text-xs text-gray-400">Cada pessoa escolhida recebe um aviso, vê a demanda em “Pedidas para mim” e pode aceitá-la: anexar a um projeto que já existe ou criar um projeto novo.</p>
            </div>
          )}
          <div className="sm:col-span-2"><label className={rot}>Título</label><input className={campo} value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} required maxLength={160} /></div>
          <div className="sm:col-span-2"><label className={rot}>Descrição</label><textarea className={campo} rows={3} value={f.descricao} onChange={(e) => setF({ ...f, descricao: e.target.value })} /></div>
          <div><label className={rot}>Prioridade</label><select className={campo} value={f.prioridade} onChange={(e) => setF({ ...f, prioridade: e.target.value })}>{Object.entries(PRIORIDADE_ROTULO).map(([k, n]) => <option key={k} value={k}>{n}</option>)}</select></div>
          <div><label className={rot}>Prazo desejado (opcional)</label><input type="date" className={campo} value={f.prazo} onChange={(e) => setF({ ...f, prazo: e.target.value })} /></div>
          <div className="sm:col-span-2">
            <label className={rot}>Lista do que precisa ser feito</label>
            <ul className="mb-2 space-y-1">
              {itens.map((t, i) => (
                <li key={i} className="flex items-center gap-2 rounded-lg bg-gray-50 px-3 py-1.5 text-sm"><span className="text-gray-400">{i + 1}.</span><span className="flex-1">{t}</span><button type="button" onClick={() => setItens((x) => x.filter((_, k) => k !== i))} className="text-xs text-red-600">remover</button></li>
              ))}
            </ul>
            <div className="flex gap-2">
              <input className={campo} value={novoItem} onChange={(e) => setNovoItem(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addItem(); } }} placeholder="Digite um item e tecle Enter" maxLength={300} />
              <button type="button" onClick={addItem} className="rounded-lg border border-gray-200 px-3 text-sm">Adicionar</button>
            </div>
          </div>
        </div>
        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">Cancelar</button>
          <button disabled={salvando || opcoes.contratos.length === 0} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-60">{salvando ? "Enviando…" : "Criar demanda"}</button>
        </div>
      </form>
    </div>
  );
}
