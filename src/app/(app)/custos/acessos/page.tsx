"use client";

// Quem ve qual centro de custo (CCU) na tela Custo por Centro de Custo. So' ADMIN. Cada pessoa pode ver 1, varios, todos ou nenhum.
// Aqui se libera/retira CCU por pessoa, se importa uma lista em lote e se ve quais centros de custo ninguem acompanha ainda.

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { moedaCompacta } from "@/lib/custos/formato";

type Pessoa = { id: string; nome: string; email: string; papel: string; ativo: boolean; cargo: string | null; verTodosCustos: boolean; verTudoPeloPapel: boolean; verTudo: boolean; liberados: string[]; viaEquipe: string[] };
type Centro = { codccu: string; nome: string; total: number; pessoas: number };
type Relatorio = { aplicado: boolean; erros: string[]; resumo: Record<string, number>; relatorio: { email: string; nome: string | null; situacao: string; todos: boolean; ccusNovos: string[]; ccusRemovidos: string[]; ccusDesconhecidos: string[]; avisoPapel?: string }[] };

function escopoTexto(p: Pessoa) {
  if (p.verTudo) return { texto: "Vê todos", cor: "bg-emerald-100 text-emerald-800" };
  const n = new Set([...p.liberados, ...p.viaEquipe]).size;
  if (n === 0) return { texto: "Nenhum", cor: "bg-gray-100 text-gray-500" };
  return { texto: n === 1 ? "1 centro" : `${n} centros`, cor: "bg-sky-100 text-sky-800" };
}

export default function AcessosCentrosDeCusto() {
  const [dados, setDados] = useState<{ pessoas: Pessoa[]; centros: Centro[]; quemVeTudo: number } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [buscaP, setBuscaP] = useState("");
  const [filtroP, setFiltroP] = useState<"todas" | "nenhum" | "restrito" | "tudo">("todas");
  const [buscaC, setBuscaC] = useState("");
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [importar, setImportar] = useState(false);

  const carregar = useCallback(async () => {
    const res = await fetch("/api/custos-conta/acessos", { cache: "no-store" });
    if (!res.ok) {
      setErro((await res.json().catch(() => ({}))).error || "Erro ao carregar");
      return;
    }
    setDados(await res.json());
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const sel = dados?.pessoas.find((p) => p.id === selId) ?? null;
  useEffect(() => {
    setMarcados(new Set(sel?.liberados ?? []));
    setAviso(null);
  }, [selId, sel?.liberados.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const pessoas = useMemo(() => {
    const t = buscaP.trim().toLowerCase();
    return (dados?.pessoas ?? []).filter((p) => {
      if (t && !p.nome.toLowerCase().includes(t) && !p.email.toLowerCase().includes(t)) return false;
      const n = new Set([...p.liberados, ...p.viaEquipe]).size;
      if (filtroP === "nenhum") return !p.verTudo && n === 0;
      if (filtroP === "restrito") return !p.verTudo && n > 0;
      if (filtroP === "tudo") return p.verTudo;
      return true;
    });
  }, [dados, buscaP, filtroP]);

  const centrosVisiveis = useMemo(() => {
    const t = buscaC.trim().toLowerCase();
    return (dados?.centros ?? []).filter((c) => !t || c.nome.toLowerCase().includes(t) || c.codccu.includes(t));
  }, [dados, buscaC]);

  const sujo = !!sel && (marcados.size !== sel.liberados.length || sel.liberados.some((c) => !marcados.has(c)));

  async function salvar() {
    if (!sel) return;
    setSalvando(true);
    setAviso(null);
    try {
      const res = await fetch("/api/custos-conta/acessos", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId: sel.id, ccus: Array.from(marcados) }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha ao salvar");
      setAviso(`Salvo: ${d.adicionados} liberado(s), ${d.removidos} retirado(s).`);
      await carregar();
    } catch (e: any) {
      setAviso(e?.message || "Falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  async function alternarVerTodos() {
    if (!sel) return;
    const res = await fetch(`/api/users/${sel.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ verTodosCustos: !sel.verTodosCustos }) });
    if (res.ok) await carregar();
    else setAviso("Não foi possível alterar “ver todos”.");
  }

  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;
  if (!dados) return <div className="p-6 text-sm text-gray-500">Carregando…</div>;

  const semAcompanhamento = dados.centros.filter((c) => c.pessoas === 0);
  const pessoasSemNada = dados.pessoas.filter((p) => p.ativo && !p.verTudo && new Set([...p.liberados, ...p.viaEquipe]).size === 0).length;

  return (
    <div className="mx-auto max-w-[1400px]">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/custos/plano-de-contas" className="text-[13px] font-medium text-brand hover:text-brand-dark">
            ← Custo por centro de custo
          </Link>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight text-gray-900">Acesso aos centros de custo</h1>
          <p className="mt-1 max-w-3xl text-[15px] text-gray-500">Cada pessoa pode ver 1, vários, todos ou nenhum centro de custo. Quem é ADMIN/DIRETOR ou tem “ver todos” enxerga tudo; os demais veem só os centros liberados aqui e os das equipes de que participam.</p>
        </div>
        <button onClick={() => setImportar(true)} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-brand-dark">
          Importar lista
        </button>
      </header>

      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Pessoas que veem tudo", dados.quemVeTudo],
          ["Centros de custo", dados.centros.length],
          ["Centros sem ninguém acompanhando", semAcompanhamento.length],
          ["Pessoas ativas sem nenhum acesso", pessoasSemNada],
        ].map(([r, v]) => (
          <div key={r as string} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{r}</p>
            <p className="mt-1 text-[28px] font-semibold leading-tight tabular-nums text-gray-900">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-5 lg:grid-cols-[380px_minmax(0,1fr)]">
        <section className="rounded-2xl border border-gray-100 bg-white p-4 shadow-soft">
          <input value={buscaP} onChange={(e) => setBuscaP(e.target.value)} placeholder="Buscar pessoa…" className="mb-3 w-full rounded-lg border border-gray-200 px-3 py-2 text-[15px] focus:border-brand focus:outline-none" />
          <div className="mb-3 flex flex-wrap gap-1.5">
            {([["todas", "Todas"], ["nenhum", "Sem acesso"], ["restrito", "Restritas"], ["tudo", "Veem tudo"]] as const).map(([k, n]) => (
              <button key={k} onClick={() => setFiltroP(k)} className={`rounded-full border px-3 py-1 text-[13px] font-medium ${filtroP === k ? "border-brand bg-brand text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                {n}
              </button>
            ))}
          </div>
          <ul className="max-h-[640px] space-y-1 overflow-y-auto">
            {pessoas.map((p) => {
              const e = escopoTexto(p);
              return (
                <li key={p.id}>
                  <button onClick={() => setSelId(p.id)} className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2 text-left ${selId === p.id ? "bg-brand-light ring-1 ring-brand/40" : "hover:bg-gray-50"} ${p.ativo ? "" : "opacity-50"}`}>
                    <span className="min-w-0">
                      <span className="block truncate text-[15px] font-medium text-gray-900">{p.nome}</span>
                      <span className="block truncate text-[13px] text-gray-500">{p.cargo ?? p.email}</span>
                    </span>
                    <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${e.cor}`}>{e.texto}</span>
                  </button>
                </li>
              );
            })}
            {pessoas.length === 0 && <li className="py-6 text-center text-sm text-gray-400">Ninguém neste filtro.</li>}
          </ul>
        </section>

        <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
          {!sel ? (
            <p className="py-16 text-center text-[15px] text-gray-400">Escolha uma pessoa à esquerda para ver e ajustar os centros de custo dela.</p>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold text-gray-900">{sel.nome}</h2>
                  <p className="text-[13px] text-gray-500">
                    {sel.email} · {sel.papel}
                  </p>
                </div>
                {!sel.verTudoPeloPapel && (
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-[14px] text-gray-700">
                    <input type="checkbox" checked={sel.verTodosCustos} onChange={alternarVerTodos} className="h-4 w-4 accent-[#00A99D]" />
                    Pode ver <b>todos</b> os centros de custo
                  </label>
                )}
              </div>

              {sel.verTudo ? (
                <p className="rounded-xl bg-emerald-50 p-4 text-[15px] text-emerald-800">{sel.verTudoPeloPapel ? `Pelo papel (${sel.papel}) esta pessoa já vê todos os centros de custo.` : "Esta pessoa está marcada para ver todos os centros de custo. Desmarque acima para escolher só alguns."}</p>
              ) : (
                <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <input value={buscaC} onChange={(e) => setBuscaC(e.target.value)} placeholder="Buscar centro de custo ou CCU…" className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-[15px] focus:border-brand focus:outline-none" />
                    <button onClick={() => setMarcados((m) => new Set([...m, ...centrosVisiveis.map((c) => c.codccu)]))} className="rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50">
                      Marcar os {centrosVisiveis.length} da lista
                    </button>
                    <button onClick={() => setMarcados(new Set())} className="rounded-lg border border-gray-200 px-3 py-2 text-[13px] font-medium text-gray-600 hover:bg-gray-50">
                      Limpar
                    </button>
                    <span className="ml-auto text-[13px] text-gray-500">{marcados.size} liberado(s) manualmente{sel.viaEquipe.length ? ` + ${new Set(sel.viaEquipe).size} por equipe` : ""}</span>
                  </div>
                  <ul className="max-h-[480px] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
                    {centrosVisiveis.map((c) => {
                      const porEquipe = sel.viaEquipe.includes(c.codccu);
                      return (
                        <li key={c.codccu}>
                          <label className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-gray-50">
                            <input type="checkbox" checked={porEquipe || marcados.has(c.codccu)} disabled={porEquipe} onChange={() => setMarcados((m) => { const n = new Set(m); if (n.has(c.codccu)) n.delete(c.codccu); else n.add(c.codccu); return n; })} className="h-4 w-4 accent-[#00A99D]" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[15px] text-gray-900">{c.nome}</span>
                              <span className="text-[13px] text-gray-500">
                                CCU {c.codccu} · {moedaCompacta(c.total)} em 2026 · {c.pessoas} {c.pessoas === 1 ? "pessoa acompanha" : "pessoas acompanham"}
                              </span>
                            </span>
                            {porEquipe && <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">via equipe</span>}
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                  <div className="mt-4 flex items-center gap-3">
                    <button onClick={salvar} disabled={!sujo || salvando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white shadow-soft hover:bg-brand-dark disabled:opacity-50">
                      {salvando ? "Salvando…" : "Salvar acessos"}
                    </button>
                    {aviso && <span className="text-[13px] text-gray-600">{aviso}</span>}
                  </div>
                </>
              )}
            </>
          )}
        </section>
      </div>

      <section className="mt-5 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <h2 className="text-base font-semibold text-gray-900">Centros de custo que ninguém acompanha ainda ({semAcompanhamento.length})</h2>
        <p className="mb-3 text-[13px] text-gray-500">Só quem vê todos (ADMIN, DIRETOR, “ver todos”) enxerga estes centros hoje.</p>
        <div className="flex flex-wrap gap-2">
          {semAcompanhamento.map((c) => (
            <span key={c.codccu} className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-[13px] text-gray-700" title={`CCU ${c.codccu}`}>
              {c.nome} <span className="text-gray-400">· {moedaCompacta(c.total)}</span>
            </span>
          ))}
          {semAcompanhamento.length === 0 && <span className="text-[13px] text-emerald-700">Todos os centros de custo têm ao menos uma pessoa acompanhando.</span>}
        </div>
      </section>

      {importar && <ModalImportar onFechar={() => setImportar(false)} onAplicado={carregar} />}
    </div>
  );
}

function ModalImportar({ onFechar, onAplicado }: { onFechar: () => void; onAplicado: () => void }) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"somar" | "substituir">("somar");
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function chamar(aplicar: boolean) {
    setCarregando(true);
    setErro(null);
    try {
      const res = await fetch("/api/custos-conta/acessos/importar", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto, modo, aplicar }) });
      const d = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(d.error || "Falha");
      setRel(d);
      if (aplicar) onAplicado();
    } catch (e: any) {
      setErro(e?.message || "Falha");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onClick={onFechar}>
      <div className="my-8 w-full max-w-3xl rounded-2xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between">
          <h2 className="text-xl font-semibold text-gray-900">Importar lista de acessos</h2>
          <button onClick={onFechar} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100">✕</button>
        </div>
        <p className="mb-2 text-[14px] text-gray-600">Uma pessoa por linha: <code className="rounded bg-gray-100 px-1">email;190, 230, 102235</code> ou <code className="rounded bg-gray-100 px-1">email;todos</code>. Pode colar direto do Excel (e-mail, tab, centros).</p>
        <textarea value={texto} onChange={(e) => { setTexto(e.target.value); setRel(null); }} rows={9} placeholder={"maria@consominas.com.br;190, 230\njoao@consominas.com.br;todos"} className="w-full rounded-xl border border-gray-200 p-3 font-mono text-[13px] focus:border-brand focus:outline-none" />
        <div className="mt-2 flex flex-wrap items-center gap-4 text-[14px] text-gray-700">
          <label className="flex items-center gap-1.5"><input type="radio" checked={modo === "somar"} onChange={() => setModo("somar")} className="accent-[#00A99D]" /> Somar aos acessos atuais</label>
          <label className="flex items-center gap-1.5"><input type="radio" checked={modo === "substituir"} onChange={() => setModo("substituir")} className="accent-[#00A99D]" /> Substituir (deixa só os da lista)</label>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <button onClick={() => chamar(false)} disabled={!texto.trim() || carregando} className="rounded-lg border border-brand px-4 py-2 text-sm font-medium text-brand hover:bg-brand-light disabled:opacity-50">Conferir (não grava)</button>
          <button onClick={() => chamar(true)} disabled={!rel || rel.aplicado || rel.resumo.pessoasEncontradas === 0 || carregando} className="rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">Aplicar</button>
          {erro && <span className="text-[13px] text-red-600">{erro}</span>}
        </div>
        {rel && (
          <div className="mt-4 space-y-3 text-[14px]">
            <p className={`rounded-xl p-3 ${rel.aplicado ? "bg-emerald-50 text-emerald-800" : "bg-gray-50 text-gray-700"}`}>
              {rel.aplicado ? "Aplicado. " : "Conferência (nada foi gravado). "}
              {rel.resumo.pessoasEncontradas} pessoa(s) · {rel.resumo.acessosNovos} acesso(s) novo(s) · {rel.resumo.acessosRemovidos} retirado(s)
              {rel.resumo.pessoasNaoEncontradas ? ` · ${rel.resumo.pessoasNaoEncontradas} e-mail(s) não encontrado(s)` : ""}
              {rel.resumo.centrosDesconhecidos ? ` · ${rel.resumo.centrosDesconhecidos} centro(s) desconhecido(s)` : ""}
            </p>
            {rel.erros.length > 0 && <ul className="list-disc rounded-xl bg-red-50 p-3 pl-6 text-red-700">{rel.erros.map((e) => <li key={e}>{e}</li>)}</ul>}
            <ul className="max-h-64 divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-100">
              {rel.relatorio.map((r) => (
                <li key={r.email} className="px-3 py-2">
                  <span className="font-medium text-gray-900">{r.nome ?? r.email}</span>{" "}
                  {r.situacao !== "ok" ? <span className="text-red-600">— e-mail não encontrado no sistema</span> : r.todos ? <span className="text-emerald-700">— passa a ver todos</span> : <span className="text-gray-600">— +{r.ccusNovos.length}{r.ccusRemovidos.length ? ` −${r.ccusRemovidos.length}` : ""}</span>}
                  {r.ccusDesconhecidos.length > 0 && <span className="text-amber-700"> · centro(s) inexistente(s): {r.ccusDesconhecidos.join(", ")}</span>}
                  {r.avisoPapel && <span className="text-gray-500"> · {r.avisoPapel}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
