"use client";

// Uma demanda: situacao, lista, projeto aberto a partir dela (com o andamento para o contratante acompanhar) e conversa.
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Barra, dataBr, dataHora, Pill, PRIORIDADE_COR, PRIORIDADE_ROTULO, STATUS_COR, STATUS_ROTULO, TAREFA_ROTULO } from "./comum";
import EscolhaDePessoas, { type PessoaOpcao } from "./Pessoas";

type Item = { id: string; texto: string; concluido: boolean; taskId: string | null };
type Tarefa = { id: string; title: string; status: string; dueDate: string | null; parentTaskId: string | null; responsavel: string | null };
type Anexo = {
  projeto: { id: string; name: string; status: string };
  tarefa: { id: string; title: string; status: string; dueDate: string | null; paiTitulo: string | null; responsavel: string | null };
  subtarefas: { id: string; title: string; status: string; dueDate: string | null; responsavel: string | null }[];
  andamento: number;
};
type Detalhe = {
  atendentes: { id: string; name: string }[]; anexadaProjectId: string | null; anexo: Anexo | null;
  id: string; titulo: string; descricao: string | null; status: string; prioridade: string; prazoDesejado: string | null; motivoRecusa: string | null; createdAt: string; projectId: string | null;
  contrato: { codccu: string; nome: string; cliente: string | null }; nucleo?: { id: string; name: string } | null; solicitante: { id: string; name: string; role: string };
  itens: Item[]; comentarios: { id: string; texto: string; interno: boolean; createdAt: string; autor: { id: string; name: string; role: string } }[];
  project: { id: string; name: string; status: string; startDate: string | null; endDate: string | null; andamento: number; tasks: Tarefa[] } | null;
};
const PASSOS = ["NOVA", "EM_ANALISE", "EM_PROJETO", "CONCLUIDA"];
const PROJETO_ROTULO: Record<string, string> = { PLANEJADO: "Planejado", EM_ANDAMENTO: "Em andamento", PAUSADO: "Pausado", CONCLUIDO: "Concluído" };

export default function DemandaDetalhe({ id, base, modo }: { id: string; base: string; modo: "gestor" | "cliente" }) {
  const [d, setD] = useState<Detalhe | null>(null);
  const [podeGerir, setPodeGerir] = useState(false);
  const [souSolicitante, setSouSolicitante] = useState(false);
  const [erro, setErro] = useState("");
  const [msg, setMsg] = useState("");
  const [equipes, setEquipes] = useState<{ id: string; name: string }[]>([]);
  const [nucleos, setNucleos] = useState<{ id: string; name: string }[]>([]);
  const [pessoas, setPessoas] = useState<PessoaOpcao[]>([]);
  const [projetos, setProjetos] = useState<{ id: string; name: string; equipe: string | null }[]>([]);
  const [souAtendente, setSouAtendente] = useState(false);
  const [anexar, setAnexar] = useState(false);
  const [quemAtende, setQuemAtende] = useState(false);
  const [abrir, setAbrir] = useState(false);
  const [recusar, setRecusar] = useState(false);

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/demandas/${id}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErro(j.error || "Erro ao carregar");
    setD(j.demanda); setPodeGerir(j.podeGerir); setSouSolicitante(j.souSolicitante); setSouAtendente(!!j.souAtendente);
  }, [id]);
  useEffect(() => { void carregar(); }, [carregar]);
  useEffect(() => { if (podeGerir) fetch("/api/demandas/opcoes").then(async (r) => { if (!r.ok) return; const o = await r.json(); setEquipes(o.equipes); setNucleos(o.nucleos ?? []); setPessoas(o.pessoas ?? []); setProjetos(o.projetos ?? []); }); }, [podeGerir]);

  async function chamar(url: string, metodo: string, corpo?: any) {
    setMsg("");
    const r = await fetch(url, { method: metodo, headers: { "Content-Type": "application/json" }, body: corpo ? JSON.stringify(corpo) : undefined });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMsg(typeof j.error === "string" ? j.error : "Não foi possível concluir."); return null; }
    await carregar();
    return j;
  }

  if (erro) return <div className="mx-auto max-w-xl py-16 text-center"><p className="text-base font-medium text-gray-700">{erro}</p><Link href={base} className="mt-3 inline-block text-sm font-medium text-brand">← Voltar às demandas</Link></div>;
  if (!d) return <div className="space-y-4" aria-busy><div className="h-10 w-96 animate-pulse rounded-lg bg-gray-200" /><div className="h-64 animate-pulse rounded-2xl bg-gray-200/70" /></div>;

  const pode = podeGerir || (souSolicitante && d.status === "NOVA");
  const tarefaDoItem = (i: Item) => d.project?.tasks.find((t) => t.id === i.taskId) ?? d.anexo?.subtarefas.find((t) => t.id === i.taskId);
  const feito = (i: Item) => (i.taskId && (d.project || d.anexo) ? tarefaDoItem(i)?.status === "FEITO" : i.concluido);
  const ligada = !!d.projectId || !!d.anexadaProjectId;
  const passo = PASSOS.indexOf(d.status);
  const campo = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none";

  return (
    <div className="mx-auto max-w-4xl">
      <Link href={base} className="text-[13px] font-medium text-brand hover:text-brand-dark">← Demandas</Link>
      <header className="mt-1 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          <Pill cor={STATUS_COR[d.status]}>{STATUS_ROTULO[d.status]}</Pill>
          {d.prioridade !== "NORMAL" && <Pill cor={PRIORIDADE_COR[d.prioridade]}>{PRIORIDADE_ROTULO[d.prioridade]}</Pill>}
          <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-800">CCU {d.contrato.codccu}</span>
          {d.nucleo && modo !== "cliente" && <span className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-semibold text-indigo-800">Núcleo {d.nucleo.name}</span>}
        </div>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-gray-900">{d.titulo}</h1>
        <p className="text-sm text-gray-500">{d.contrato.nome} · pedido por {d.solicitante.name} em {dataBr(d.createdAt)}{d.prazoDesejado ? ` · prazo desejado ${dataBr(d.prazoDesejado)}` : ""}</p>
        {modo !== "cliente" && (d.atendentes.length > 0 || souAtendente) && (
          <p className="mt-1 text-sm text-gray-500">
            Pedida para: <b className="text-gray-700">{d.atendentes.map((a) => a.name).join(", ") || "—"}</b>
            {souAtendente && <span className="ml-2 rounded-md bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">Para você</span>}
          </p>
        )}
      </header>

      {d.status !== "RECUSADA" ? (
        <ol className="mb-5 grid grid-cols-4 gap-2" aria-label="Andamento da demanda">
          {PASSOS.map((p, i) => (
            <li key={p} className={`rounded-xl border px-3 py-2 text-center text-[13px] font-medium ${i < passo ? "border-emerald-200 bg-emerald-50 text-emerald-800" : i === passo ? "border-brand bg-brand/10 text-brand-dark" : "border-gray-200 bg-white text-gray-400"}`}>{i < passo ? "✓ " : ""}{STATUS_ROTULO[p]}</li>
          ))}
        </ol>
      ) : (
        <div className="mb-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700"><b>Demanda recusada.</b> {d.motivoRecusa}</div>
      )}

      {podeGerir && (
        <div className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm">
          <span className="mr-1 text-xs font-semibold uppercase tracking-wide text-gray-400">Gestão</span>
          {d.status === "NOVA" && <button onClick={() => chamar(`/api/demandas/${d.id}`, "PATCH", { status: "EM_ANALISE" })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Colocar em análise</button>}
          {!ligada && (d.status === "NOVA" || d.status === "EM_ANALISE") && (
            <>
              <button onClick={() => setAnexar(true)} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">Aceitar e anexar a um projeto</button>
              <button onClick={() => setAbrir(true)} className="rounded-lg border border-brand px-3 py-1.5 text-sm font-semibold text-brand-dark hover:bg-brand/5">Criar projeto novo a partir da demanda</button>
            </>
          )}
          {d.projectId && <Link href={`/projetos/${d.projectId}`} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">Ir para o projeto →</Link>}
          {d.anexadaProjectId && <Link href={`/projetos/${d.anexadaProjectId}`} className="rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-dark">Ir para o projeto →</Link>}
          {pessoas.length > 0 && <button onClick={() => setQuemAtende(true)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Quem atende</button>}
          {d.status === "EM_PROJETO" && <button onClick={() => chamar(`/api/demandas/${d.id}`, "PATCH", { status: "CONCLUIDA" })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Marcar como concluída</button>}
          {(d.status === "NOVA" || d.status === "EM_ANALISE") && <button onClick={() => setRecusar(true)} className="rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50">Recusar</button>}
          {(d.status === "RECUSADA" || d.status === "CONCLUIDA") && !ligada && <button onClick={() => chamar(`/api/demandas/${d.id}`, "PATCH", { status: "EM_ANALISE" })} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm hover:bg-gray-50">Reabrir</button>}
          {nucleos.length > 0 && (
            <label className="ml-auto flex items-center gap-2 text-sm text-gray-600">
              Núcleo
              <select value={d.nucleo?.id ?? ""} onChange={(e) => chamar(`/api/demandas/${d.id}`, "PATCH", { nucleoId: e.target.value || null })} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm">
                <option value="">Sem núcleo</option>
                {nucleos.map((n) => <option key={n.id} value={n.id}>{n.name}</option>)}
              </select>
            </label>
          )}
          {msg && <span className="text-sm text-red-600">{msg}</span>}
        </div>
      )}
      {!podeGerir && msg && <p className="mb-3 text-sm text-red-600">{msg}</p>}

      {d.descricao && <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><h2 className="mb-1 text-sm font-semibold text-gray-900">Descrição</h2><p className="whitespace-pre-line text-[14px] text-gray-700">{d.descricao}</p></section>}

      <section className="mb-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Lista do que precisa ser feito</h2>
        {d.itens.length === 0 ? <p className="text-sm text-gray-400">Sem itens na lista.</p> : (
          <ul className="space-y-1.5">
            {d.itens.map((i) => {
              const t = tarefaDoItem(i);
              return (
                <li key={i.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-gray-50">
                  <input type="checkbox" checked={feito(i)} disabled={!podeGerir || ligada} onChange={(e) => chamar(`/api/demandas/${d.id}/itens/${i.id}`, "PATCH", { concluido: e.target.checked })} className="h-4 w-4 accent-teal-600" />
                  <span className={`flex-1 text-[14px] ${feito(i) ? "text-gray-400 line-through" : "text-gray-800"}`}>{i.texto}</span>
                  {t && <span className="text-xs text-gray-500">{TAREFA_ROTULO[t.status] ?? t.status}{modo === "gestor" && t.responsavel ? ` · ${t.responsavel}` : ""}</span>}
                  {pode && !i.taskId && <button onClick={() => chamar(`/api/demandas/${d.id}/itens/${i.id}`, "DELETE")} className="text-xs text-red-600">remover</button>}
                </li>
              );
            })}
          </ul>
        )}
        {pode && <NovoItem onAdd={(texto) => chamar(`/api/demandas/${d.id}/itens`, "POST", { texto })} />}
      </section>

      {d.anexo && (
        <section className="mb-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Anexada ao projeto: {d.anexo.projeto.name}</h2>
            <Pill cor="bg-violet-100 text-violet-800">{TAREFA_ROTULO[d.anexo.tarefa.status] ?? d.anexo.tarefa.status}</Pill>
          </div>
          <p className="mt-1 text-[13px] text-gray-600">{d.anexo.tarefa.paiTitulo ? `Subtarefa de “${d.anexo.tarefa.paiTitulo}”` : "Tarefa do projeto"}: <b>{d.anexo.tarefa.title}</b>{modo === "gestor" && d.anexo.tarefa.responsavel ? ` · ${d.anexo.tarefa.responsavel}` : ""}{d.anexo.tarefa.dueDate ? ` · até ${dataBr(d.anexo.tarefa.dueDate)}` : ""}</p>
          <div className="mt-3 flex items-center gap-3"><div className="flex-1"><Barra pct={d.anexo.andamento} /></div><span className="text-sm font-semibold tabular-nums text-gray-700">{d.anexo.andamento}% concluído</span></div>
          {d.anexo.subtarefas.length > 0 && (
            <ul className="mt-3 divide-y divide-violet-100 text-[13.5px]">
              {d.anexo.subtarefas.map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-1.5"><span className="text-gray-800">{t.title}</span><span className="text-xs text-gray-500">{TAREFA_ROTULO[t.status] ?? t.status}{modo === "gestor" && t.responsavel ? ` · ${t.responsavel}` : ""}{t.dueDate ? ` · até ${dataBr(t.dueDate)}` : ""}</span></li>
              ))}
            </ul>
          )}
        </section>
      )}

      {d.project && (
        <section className="mb-5 rounded-2xl border border-violet-100 bg-violet-50/40 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-gray-900">Projeto: {d.project.name}</h2>
            <Pill cor="bg-violet-100 text-violet-800">{PROJETO_ROTULO[d.project.status] ?? d.project.status}</Pill>
          </div>
          <div className="mt-3 flex items-center gap-3"><div className="flex-1"><Barra pct={d.project.andamento} /></div><span className="text-sm font-semibold tabular-nums text-gray-700">{d.project.andamento}% concluído</span></div>
          {d.project.endDate && <p className="mt-1 text-xs text-gray-500">Prazo do projeto: {dataBr(d.project.endDate)}</p>}
          {modo === "cliente" && d.project.tasks.length > 0 && (
            <ul className="mt-3 divide-y divide-violet-100 text-[13.5px]">
              {d.project.tasks.filter((t) => !t.parentTaskId).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-3 py-1.5"><span className="text-gray-800">{t.title}</span><span className="text-xs text-gray-500">{TAREFA_ROTULO[t.status] ?? t.status}{t.dueDate ? ` · até ${dataBr(t.dueDate)}` : ""}</span></li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Conversa</h2>
        <ul className="space-y-3">
          {d.comentarios.map((c) => (
            <li key={c.id} className={`rounded-xl px-3 py-2 text-[14px] ${c.interno ? "border border-amber-200 bg-amber-50" : "bg-gray-50"}`}>
              <p className="text-xs text-gray-500"><b className="text-gray-700">{c.autor.name}</b> · {dataHora(c.createdAt)}{c.interno && <span className="ml-2 rounded bg-amber-200 px-1.5 text-[11px] font-semibold text-amber-900">nota interna</span>}</p>
              <p className="mt-0.5 whitespace-pre-line text-gray-800">{c.texto}</p>
            </li>
          ))}
          {d.comentarios.length === 0 && <li className="text-sm text-gray-400">Nenhuma mensagem ainda.</li>}
        </ul>
        <NovoComentario podeInterno={modo === "gestor"} onEnviar={(texto, interno) => chamar(`/api/demandas/${d.id}/comentarios`, "POST", { texto, interno })} />
      </section>

      {abrir && (
        <Modal onFechar={() => setAbrir(false)} titulo="Criar projeto novo a partir da demanda" largo>
          <AbrirProjeto equipes={equipes} pessoas={pessoas} nomePadrao={d.titulo} atendentes={d.atendentes.map((a) => a.id)} onAbrir={async (teamId, nome, executores, visualizadores) => { const j = await chamar(`/api/demandas/${d.id}/abrir-projeto`, "POST", { teamId, nome: nome || undefined, executores, visualizadores }); if (j?.projectId) window.location.href = `/projetos/${j.projectId}`; }} />
        </Modal>
      )}
      {anexar && (
        <Modal onFechar={() => setAnexar(false)} titulo="Aceitar e anexar a um projeto" largo>
          <AnexarProjeto projetos={projetos} pessoas={pessoas} atendentes={d.atendentes.map((a) => a.id)} onAnexar={async (projectId, parentTaskId, executorId) => { const j = await chamar(`/api/demandas/${d.id}/anexar`, "POST", { projectId, parentTaskId: parentTaskId || null, executorId: executorId || null }); if (j) setAnexar(false); }} />
        </Modal>
      )}
      {quemAtende && (
        <Modal onFechar={() => setQuemAtende(false)} titulo="Quem atende esta demanda">
          <QuemAtende pessoas={pessoas} inicial={d.atendentes.map((a) => a.id)} onSalvar={async (ids) => { const j = await chamar(`/api/demandas/${d.id}`, "PATCH", { atendentes: ids }); if (j) setQuemAtende(false); }} />
        </Modal>
      )}
      {recusar && (
        <Modal onFechar={() => setRecusar(false)} titulo="Recusar demanda">
          <Recusar onConfirmar={async (motivo) => { await chamar(`/api/demandas/${d.id}`, "PATCH", { status: "RECUSADA", motivoRecusa: motivo }); setRecusar(false); }} campo={campo} />
        </Modal>
      )}
    </div>
  );
}

function Modal({ titulo, children, onFechar, largo }: { titulo: string; children: React.ReactNode; onFechar: () => void; largo?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className={`my-12 w-full ${largo ? "max-w-2xl" : "max-w-lg"} rounded-2xl bg-white p-6 shadow-xl`}><h2 className="mb-3 text-lg font-semibold">{titulo}</h2>{children}</div>
    </div>
  );
}

function NovoItem({ onAdd }: { onAdd: (t: string) => void }) {
  const [t, setT] = useState("");
  const enviar = () => { if (t.trim()) { onAdd(t.trim()); setT(""); } };
  return <div className="mt-3 flex gap-2"><input value={t} onChange={(e) => setT(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); enviar(); } }} placeholder="Adicionar item à lista" maxLength={300} className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none" /><button onClick={enviar} className="rounded-lg border border-gray-200 px-3 text-sm">Adicionar</button></div>;
}

function NovoComentario({ onEnviar, podeInterno }: { onEnviar: (t: string, interno: boolean) => Promise<any>; podeInterno: boolean }) {
  const [t, setT] = useState("");
  const [interno, setInterno] = useState(false);
  const [env, setEnv] = useState(false);
  return (
    <div className="mt-4">
      <textarea value={t} onChange={(e) => setT(e.target.value)} rows={2} placeholder="Escreva uma mensagem…" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
      <div className="mt-2 flex items-center justify-between">
        {podeInterno ? <label className="flex items-center gap-2 text-[13px] text-gray-600"><input type="checkbox" checked={interno} onChange={(e) => setInterno(e.target.checked)} className="accent-amber-600" />Nota interna (o contratante não vê)</label> : <span />}
        <button disabled={env || !t.trim()} onClick={async () => { setEnv(true); const j = await onEnviar(t.trim(), interno); setEnv(false); if (j) setT(""); }} className="rounded-lg bg-brand px-4 py-1.5 text-sm font-semibold text-white disabled:opacity-50">Enviar</button>
      </div>
    </div>
  );
}

function AbrirProjeto({ equipes, pessoas, nomePadrao, atendentes, onAbrir }: { equipes: { id: string; name: string }[]; pessoas: PessoaOpcao[]; nomePadrao: string; atendentes: string[]; onAbrir: (teamId: string, nome: string, executores: string[], visualizadores: string[]) => Promise<void> }) {
  const [teamId, setTeamId] = useState(equipes.length === 1 ? equipes[0].id : "");
  const [nome, setNome] = useState(nomePadrao);
  const [executores, setExecutores] = useState<string[]>(atendentes);
  const [visualizadores, setVisualizadores] = useState<string[]>([]);
  const [env, setEnv] = useState(false);
  const campo = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none";
  const rot = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-500">Cada item da lista vira uma tarefa do projeto, e você continua montando tarefas e subtarefas lá. Quem pediu e as pessoas abaixo passam a ver o projeto; o contratante acompanha o andamento no portal.</p>
      <div><label className={rot}>Equipe que executa</label><select className={campo} value={teamId} onChange={(e) => setTeamId(e.target.value)}><option value="">Escolha…</option>{equipes.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select>{equipes.length === 0 && <p className="mt-1 text-xs text-amber-700">Você não gerencia nenhuma equipe. Só o gestor da equipe (ou um admin, ou quem atende a demanda e faz parte da equipe) cria projeto.</p>}</div>
      <div><label className={rot}>Nome do projeto</label><input className={campo} value={nome} onChange={(e) => setNome(e.target.value)} /></div>
      {pessoas.length > 0 && (
        <>
          <div>
            <label className={rot}>Quem vai executar</label>
            <EscolhaDePessoas pessoas={pessoas} valor={executores} onChange={setExecutores} vazio="Ninguém ainda: você distribui as tarefas depois." />
            <p className="mt-1 text-xs text-gray-400">Veem o projeto e recebem as tarefas. Com um só executor, as tarefas já nascem com ele.</p>
          </div>
          <div>
            <label className={rot}>Quem só acompanha (visualizador)</label>
            <EscolhaDePessoas pessoas={pessoas} valor={visualizadores} onChange={setVisualizadores} vazio="Ninguém além de quem pediu." />
            <p className="mt-1 text-xs text-gray-400">Veem o projeto sem receber tarefas. Quem pediu (se for da casa) já acompanha sempre.</p>
          </div>
        </>
      )}
      <div className="flex justify-end"><button disabled={!teamId || env} onClick={async () => { setEnv(true); await onAbrir(teamId, nome, executores, visualizadores.filter((v) => !executores.includes(v))); setEnv(false); }} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{env ? "Criando…" : "Criar projeto"}</button></div>
    </div>
  );
}

function AnexarProjeto({ projetos, pessoas, atendentes, onAnexar }: { projetos: { id: string; name: string; equipe: string | null }[]; pessoas: PessoaOpcao[]; atendentes: string[]; onAnexar: (projectId: string, parentTaskId: string, executorId: string) => Promise<void> }) {
  const [projectId, setProjectId] = useState("");
  const [tarefas, setTarefas] = useState<{ id: string; title: string; parentTaskId: string | null; status: string }[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [paiId, setPaiId] = useState("");
  const [executorId, setExecutorId] = useState(atendentes.length === 1 ? atendentes[0] : "");
  const [env, setEnv] = useState(false);
  const campo = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none";
  const rot = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
  useEffect(() => {
    setPaiId(""); setTarefas([]);
    if (!projectId) return;
    setCarregando(true);
    fetch(`/api/demandas/projeto-tarefas?projectId=${encodeURIComponent(projectId)}`).then(async (r) => { if (r.ok) setTarefas((await r.json()).tarefas ?? []); }).finally(() => setCarregando(false));
  }, [projectId]);
  const ordenadas = [...tarefas.filter((t) => !t.parentTaskId), ...tarefas.filter((t) => t.parentTaskId)];
  const nomeDoPai = (t: { parentTaskId: string | null }) => tarefas.find((x) => x.id === t.parentTaskId)?.title;
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-500">A demanda vira uma <b>tarefa</b> do projeto escolhido, ou uma <b>subtarefa</b> de uma tarefa que já existe, e cada item da lista vira subtarefa dela. Quem pediu acompanha o andamento por esta demanda.</p>
      <div>
        <label className={rot}>Projeto</label>
        <select className={campo} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Escolha…</option>
          {projetos.map((p) => <option key={p.id} value={p.id}>{p.name}{p.equipe ? ` · ${p.equipe}` : ""}</option>)}
        </select>
        {projetos.length === 0 && <p className="mt-1 text-xs text-amber-700">Você ainda não vê nenhum projeto em andamento. Use “Criar projeto novo a partir da demanda”.</p>}
      </div>
      {projectId && (
        <div>
          <label className={rot}>Onde fica</label>
          <select className={campo} value={paiId} onChange={(e) => setPaiId(e.target.value)} disabled={carregando}>
            <option value="">{carregando ? "Carregando tarefas…" : "Como uma tarefa do projeto"}</option>
            {ordenadas.map((t) => <option key={t.id} value={t.id}>Subtarefa de: {t.parentTaskId ? `${nomeDoPai(t) ?? "…"} › ` : ""}{t.title}</option>)}
          </select>
        </div>
      )}
      {pessoas.length > 0 && (
        <div>
          <label className={rot}>Quem executa (opcional)</label>
          <select className={campo} value={executorId} onChange={(e) => setExecutorId(e.target.value)}>
            <option value="">Ninguém ainda</option>
            {pessoas.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <p className="mt-1 text-xs text-gray-400">Recebe a tarefa e as subtarefas, com aviso, e passa a ver o projeto.</p>
        </div>
      )}
      <div className="flex justify-end"><button disabled={!projectId || env} onClick={async () => { setEnv(true); await onAnexar(projectId, paiId, executorId); setEnv(false); }} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{env ? "Anexando…" : "Aceitar e anexar"}</button></div>
    </div>
  );
}

function QuemAtende({ pessoas, inicial, onSalvar }: { pessoas: PessoaOpcao[]; inicial: string[]; onSalvar: (ids: string[]) => Promise<void> }) {
  const [ids, setIds] = useState<string[]>(inicial);
  const [env, setEnv] = useState(false);
  return (
    <div className="space-y-3">
      <p className="text-[13px] text-gray-500">Quem está aqui recebe aviso, vê a demanda em “Pedidas para mim” e pode aceitá-la.</p>
      <EscolhaDePessoas pessoas={pessoas} valor={ids} onChange={setIds} max={10} vazio="Ninguém em particular." />
      <div className="flex justify-end"><button disabled={env} onClick={async () => { setEnv(true); await onSalvar(ids); setEnv(false); }} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">{env ? "Salvando…" : "Salvar"}</button></div>
    </div>
  );
}

function Recusar({ onConfirmar, campo }: { onConfirmar: (m: string) => Promise<void>; campo: string }) {
  const [m, setM] = useState("");
  return <div className="space-y-3"><textarea className={campo} rows={3} value={m} onChange={(e) => setM(e.target.value)} placeholder="Explique o motivo (o contratante verá)" /><div className="flex justify-end"><button disabled={m.trim().length < 3} onClick={() => onConfirmar(m.trim())} className="rounded-lg bg-red-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-50">Recusar demanda</button></div></div>;
}
