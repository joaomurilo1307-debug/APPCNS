"use client";

// Aba "Atualizações" do projeto: registro cronologico de status da equipe (estilo "status update"): a pessoa avalia a saude, conta o que aconteceu
// e quem acompanha o projeto le tudo num lugar so'. O semaforo calculado do sistema continua separado (cabecalho do projeto).
import { useEffect, useState } from "react";
import SeloSaude from "./SeloSaude";
import { ROTULO_SAUDE, type NivelSaude } from "@/lib/projetos/saude";
import { useAtualizarAoVoltar } from "@/lib/atualizarAoVoltar";

type Atualizacao = { id: string; saude: string; texto: string; createdAt: string; autor: { id: string; name: string } };
const AVALIACOES = ["NO_PRAZO", "ATENCAO", "ATRASADO"] as const;
const quando = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AtualizacoesProjeto({ projectId, podeEscrever, meuId, podeGerir }: { projectId: string; podeEscrever: boolean; meuId?: string; podeGerir: boolean }) {
  const [lista, setLista] = useState<Atualizacao[] | null>(null);
  const [saude, setSaude] = useState<(typeof AVALIACOES)[number]>("NO_PRAZO");
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  async function carregar() {
    const r = await fetch(`/api/projects/${projectId}/atualizacoes`, { cache: "no-store" });
    const d = await r.json().catch(() => null);
    if (r.ok && Array.isArray(d)) setLista(d);
    else setLista((x) => x ?? []);
  }
  useEffect(() => { void carregar(); }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps
  useAtualizarAoVoltar(carregar);

  async function publicar(e: React.FormEvent) {
    e.preventDefault();
    setEnviando(true);
    setErro("");
    const r = await fetch(`/api/projects/${projectId}/atualizacoes`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ saude, texto }) });
    setEnviando(false);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return setErro(typeof j.error === "string" ? j.error : "Não foi possível publicar.");
    }
    setTexto("");
    setSaude("NO_PRAZO");
    void carregar();
  }

  async function apagar(a: Atualizacao) {
    if (!confirm("Apagar esta atualização?")) return;
    const r = await fetch(`/api/projects/${projectId}/atualizacoes/${a.id}`, { method: "DELETE" });
    if (r.ok) void carregar();
    else setErro("Não foi possível apagar.");
  }

  return (
    <div className="max-w-3xl">
      <p className="mb-3 text-sm text-gray-500">Registre como o projeto está indo: a avaliação da equipe e o que aconteceu. O responsável e o aprovador do projeto são avisados.</p>
      {podeEscrever && (
        <form onSubmit={publicar} className="mb-5 rounded-xl border border-gray-200 bg-white p-4 shadow-soft">
          <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-xs font-medium uppercase tracking-wide text-gray-500">Como está o projeto?</span>
            {AVALIACOES.map((n) => (
              <button type="button" key={n} onClick={() => setSaude(n)} aria-pressed={saude === n} className={`rounded-full border px-3 py-1 text-xs font-medium transition ${saude === n ? "border-brand bg-brand text-white" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>{ROTULO_SAUDE[n]}</button>
            ))}
          </div>
          <textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} maxLength={4000} placeholder="O que andou, o que travou e o que vem a seguir…" className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none" />
          <div className="mt-2 flex items-center gap-3">
            <button disabled={enviando || texto.trim().length < 3} className="rounded-md bg-brand px-4 py-1.5 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">{enviando ? "Publicando…" : "Publicar atualização"}</button>
            {erro && <span className="text-xs text-red-600">{erro}</span>}
          </div>
        </form>
      )}
      {lista === null ? (
        <p className="text-sm text-gray-400">Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">Ainda não há atualizações neste projeto.</p>
      ) : (
        <ol className="space-y-3">
          {lista.map((a) => (
            <li key={a.id} className="rounded-xl border border-gray-100 bg-white p-4 shadow-soft">
              <div className="mb-1.5 flex flex-wrap items-center gap-2 text-xs text-gray-500">
                <SeloSaude saude={{ nivel: a.saude as NivelSaude, rotulo: ROTULO_SAUDE[a.saude as NivelSaude] ?? a.saude, motivos: [] }} />
                <b className="text-gray-700">{a.autor.name}</b>
                <span>{quando(a.createdAt)}</span>
                {(a.autor.id === meuId || podeGerir) && <button onClick={() => apagar(a)} className="ml-auto text-gray-400 hover:text-red-600">apagar</button>}
              </div>
              <p className="whitespace-pre-wrap text-sm text-gray-800">{a.texto}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
