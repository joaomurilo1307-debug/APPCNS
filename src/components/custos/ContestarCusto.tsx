"use client";

// Janela "Contestar" da tela Ao vivo: quem acompanha o contrato diz que aquele lancamento nao e' dele, justifica, anexa arquivos e indica quem
// e' o responsavel pelo custo. O pedido cai nas Aprovacoes do financeiro. O Senior nao e' alterado: o financeiro ajusta la, se aceitar.

import { useEffect, useMemo, useState } from "react";
import { LIMITES, referenciaDoLancamento, validarPedido } from "@/lib/contestacoes";
import { moeda } from "@/lib/custos/formato";

export type LancamentoContestavel = { chave: string; fornecedor: string; numTit: string | null; numOcp: string | null; valor: number; linhaCusto: string | null; ccu: string; ccuNome: string | null };
type Pessoa = { id: string; name: string };

const campo = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-brand";

export default function ContestarCusto({ item, onFechar, onEnviada }: { item: LancamentoContestavel; onFechar: () => void; onEnviada: () => void }) {
  const [justificativa, setJustificativa] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [busca, setBusca] = useState("");
  const [indicado, setIndicado] = useState<Pessoa | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch("/api/presence").then(async (r) => { if (r.ok && vivo) setPessoas((await r.json()).map((p: any) => ({ id: p.id, name: p.name }))); }).catch(() => {});
    return () => { vivo = false; };
  }, []);

  const sugestoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return t.length < 2 ? [] : pessoas.filter((p) => p.name.toLowerCase().includes(t)).slice(0, 6);
  }, [busca, pessoas]);

  function escolherArquivos(lista: FileList | null) {
    if (!lista) return;
    setArquivos((atual) => [...atual, ...Array.from(lista)].slice(0, LIMITES.arquivosMax + 1));
  }

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const problema = validarPedido({ chave: item.chave, justificativa, arquivos: arquivos.map((a) => ({ name: a.name, size: a.size })) });
    if (problema) return setErro(problema);
    setErro(""); setEnviando(true);
    const f = new FormData();
    f.set("chave", item.chave);
    f.set("justificativa", justificativa.trim());
    if (indicado) f.set("indicadoId", indicado.id);
    for (const a of arquivos) f.append("arquivos", a);
    const r = await fetch("/api/contestacoes", { method: "POST", body: f });
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    if (!r.ok) return setErro(typeof j.error === "string" ? j.error : "Não foi possível enviar a contestação.");
    onEnviada();
  }

  const ref = referenciaDoLancamento(item);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Contestar custo" onClick={onFechar}>
      <form onSubmit={enviar} onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-xl rounded-2xl bg-white shadow-2xl">
        <header className="rounded-t-2xl border-b border-gray-100 bg-gradient-to-r from-amber-50 to-transparent px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">Contestar custo</p>
          <h2 className="text-lg font-semibold text-gray-900">{item.fornecedor}</h2>
          <p className="text-sm text-gray-500">{ref.charAt(0).toUpperCase() + ref.slice(1)} · {moeda(item.valor)} · {item.ccuNome || `CC ${item.ccu}`}{item.linhaCusto ? ` · ${item.linhaCusto}` : ""}</p>
        </header>

        <div className="grid gap-4 px-6 py-5">
          <p className="rounded-lg bg-gray-50 px-3 py-2 text-[13px] text-gray-600">Use quando este custo não é do seu contrato. O pedido segue para o financeiro com a OC, o título e a sua descrição, nas Aprovações e por e-mail. Ele aceita ou rejeita; se aceitar, o ajuste é feito no Senior pelo financeiro.</p>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Justificativa</span>
            <textarea className={campo} rows={4} value={justificativa} onChange={(e) => setJustificativa(e.target.value)} maxLength={LIMITES.justificativaMax} placeholder="Explique por que este custo não é do seu contrato." required />
            <span className={`mt-0.5 block text-right text-[11px] ${justificativa.trim().length >= LIMITES.justificativaMin ? "text-gray-400" : "text-amber-700"}`}>{justificativa.trim().length} / mínimo {LIMITES.justificativaMin}</span>
          </label>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Quem é o responsável por este custo? <span className="font-normal normal-case text-gray-400">(opcional)</span></span>
            {indicado ? (
              <p className="flex items-center justify-between rounded-lg border border-brand/40 bg-brand/5 px-3 py-2 text-sm">
                <span><b>{indicado.name}</b> será avisado(a) de que você indicou.</span>
                <button type="button" onClick={() => { setIndicado(null); setBusca(""); }} className="text-xs text-gray-500 hover:text-red-600">Trocar</button>
              </p>
            ) : (
              <>
                <input className={campo} value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Digite o nome da pessoa…" />
                {sugestoes.length > 0 && (
                  <ul className="mt-1 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white text-sm shadow-sm">
                    {sugestoes.map((p) => <li key={p.id}><button type="button" onClick={() => setIndicado(p)} className="block w-full px-3 py-1.5 text-left hover:bg-gray-50">{p.name}</button></li>)}
                  </ul>
                )}
              </>
            )}
          </div>

          <div>
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">Arquivos <span className="font-normal normal-case text-gray-400">(opcional, até {LIMITES.arquivosMax}, {Math.round(LIMITES.bytesPorArquivo / 1024 / 1024)} MB cada)</span></span>
            <input type="file" multiple onChange={(e) => { escolherArquivos(e.target.files); e.target.value = ""; }} className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200" />
            {arquivos.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {arquivos.map((a, i) => (
                  <li key={`${a.name}-${i}`} className="flex items-center justify-between rounded-md bg-gray-50 px-3 py-1.5">
                    <span className="truncate">{a.name} <span className="text-xs text-gray-400">({(a.size / 1024 / 1024).toFixed(1)} MB)</span></span>
                    <button type="button" onClick={() => setArquivos((l) => l.filter((_, j) => j !== i))} className="ml-3 text-xs text-gray-500 hover:text-red-600">Remover</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {erro && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
        </div>

        <footer className="flex items-center justify-end gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-3">
          <button type="button" onClick={onFechar} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-white">Cancelar</button>
          <button disabled={enviando} className="rounded-lg bg-amber-600 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-60">{enviando ? "Enviando…" : "Enviar contestação"}</button>
        </footer>
      </form>
    </div>
  );
}
