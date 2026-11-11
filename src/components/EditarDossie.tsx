"use client";

// Botao "editar dossie" + janela de anexos (Conferencia de OC e Programacao de Pagamento). Os documentos anexados (PDF, JPG,
// PNG) entram no fim do PDF do dossie, depois de uma pagina com a lista, e continuam la' quando o dossie e' gerado de novo.

import { useCallback, useEffect, useState } from "react";

type Anexo = { id: string; nome: string; tipo: string; bytes: number; paginas: number; criadoPorNome: string | null; criadoEm: string };
type Limites = { bytesPorArquivo: number; bytesPorDossie: number; arquivosPorDossie: number };

const mb = (n: number) => (n / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
const tamanho = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${mb(n)} MB`);
const quando = (d: string) => new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

function JanelaEditarDossie({ dossieId, rotulo, onFechar }: { dossieId: string; rotulo: string; onFechar: () => void }) {
  const [anexos, setAnexos] = useState<Anexo[] | null>(null);
  const [limites, setLimites] = useState<Limites | null>(null);
  const [selecionados, setSelecionados] = useState<File[]>([]);
  const [enviando, setEnviando] = useState(false);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [erros, setErros] = useState<string[]>([]);
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(async () => {
    const r = await fetch(`/api/dossies/${dossieId}/anexos`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return setErros([typeof j.error === "string" ? j.error : "Não foi possível carregar os anexos."]);
    setAnexos(j.anexos);
    setLimites(j.limites);
  }, [dossieId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onFechar]);

  async function anexar() {
    if (!selecionados.length) return;
    setEnviando(true);
    setErros([]);
    setAviso("");
    const f = new FormData();
    for (const a of selecionados) f.append("arquivos", a);
    const r = await fetch(`/api/dossies/${dossieId}/anexos`, { method: "POST", body: f });
    const j = await r.json().catch(() => ({}));
    setEnviando(false);
    if (Array.isArray(j.anexos)) setAnexos(j.anexos);
    const falhas: { nome: string; erro?: string }[] = Array.isArray(j.resultado) ? j.resultado.filter((x: any) => !x.ok) : [];
    if (!r.ok && !falhas.length) return setErros([typeof j.error === "string" ? j.error : "Não foi possível anexar."]);
    setErros(falhas.map((x) => `${x.nome}: ${x.erro ?? "não anexado"}`));
    const ok = (j.resultado ?? []).length - falhas.length;
    if (ok > 0) setAviso(ok === 1 ? "1 documento anexado ao fim do dossiê." : `${ok} documentos anexados ao fim do dossiê.`);
    setSelecionados([]);
  }

  async function remover(a: Anexo) {
    if (!window.confirm(`Tirar "${a.nome}" do dossiê? O arquivo é apagado do sistema.`)) return;
    setRemovendo(a.id);
    setErros([]);
    setAviso("");
    const r = await fetch(`/api/dossies/${dossieId}/anexos/${a.id}`, { method: "DELETE" });
    setRemovendo(null);
    if (!r.ok) {
      const j = await r.json().catch(() => ({}));
      return setErros([typeof j.error === "string" ? j.error : "Não foi possível remover."]);
    }
    setAnexos((l) => (l ?? []).filter((x) => x.id !== a.id));
    setAviso(`"${a.nome}" retirado do dossiê.`);
  }

  const total = (anexos ?? []).reduce((s, a) => s + a.bytes, 0);

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true" aria-label="Editar dossiê" onClick={onFechar}>
      <div onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-xl rounded-2xl bg-white text-left shadow-2xl">
        <header className="rounded-t-2xl border-b border-gray-100 px-6 py-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-brand">Editar dossiê</p>
          <h2 className="text-lg font-semibold text-gray-900">{rotulo}</h2>
          <p className="mt-1 text-[13px] text-gray-500">
            Anexe documentos (PDF, JPG ou PNG). Eles entram no fim do PDF do dossiê, depois de uma página com a lista dos anexos, e continuam lá quando o dossiê é gerado de novo.
          </p>
        </header>

        <div className="grid gap-4 px-6 py-5">
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Anexos {anexos && <span className="font-normal normal-case text-gray-400">({anexos.length}{limites ? ` de ${limites.arquivosPorDossie}` : ""} · {tamanho(total)})</span>}
            </p>
            {anexos === null ? (
              <p className="text-sm text-gray-400">Carregando…</p>
            ) : anexos.length === 0 ? (
              <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">Nenhum documento anexado.</p>
            ) : (
              <ol className="space-y-1 text-sm">
                {anexos.map((a, i) => (
                  <li key={a.id} className="flex items-start justify-between gap-3 rounded-md bg-gray-50 px-3 py-1.5">
                    <span className="min-w-0">
                      <a href={`/api/dossies/${dossieId}/anexos/${a.id}`} target="_blank" rel="noreferrer" className="block truncate font-medium text-brand underline decoration-dotted underline-offset-2">
                        {i + 1}. {a.nome}
                      </a>
                      <span className="block text-[11px] text-gray-500">
                        {a.tipo === "application/pdf" ? `PDF, ${a.paginas} pág.` : "imagem"} · {tamanho(a.bytes)} · {a.criadoPorNome ?? "—"} em {quando(a.criadoEm)}
                      </span>
                    </span>
                    <button type="button" onClick={() => remover(a)} disabled={removendo === a.id} className="shrink-0 text-xs text-gray-500 hover:text-red-600 disabled:opacity-50">
                      {removendo === a.id ? "Removendo…" : "Remover"}
                    </button>
                  </li>
                ))}
              </ol>
            )}
          </div>

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
              Anexar documentos {limites && <span className="font-normal normal-case text-gray-400">(até {mb(limites.bytesPorArquivo)} MB cada)</span>}
            </p>
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
              onChange={(e) => {
                setSelecionados(Array.from(e.target.files ?? []));
                e.target.value = "";
              }}
              className="block w-full text-sm text-gray-600 file:mr-3 file:rounded-lg file:border-0 file:bg-gray-100 file:px-3 file:py-2 file:text-sm file:font-medium hover:file:bg-gray-200"
            />
            {selecionados.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm">
                {selecionados.map((a, i) => (
                  <li key={`${a.name}-${i}`} className="flex items-center justify-between rounded-md border border-dashed border-gray-300 px-3 py-1.5">
                    <span className="truncate">
                      {a.name} <span className="text-xs text-gray-400">({tamanho(a.size)})</span>
                    </span>
                    <button type="button" onClick={() => setSelecionados((l) => l.filter((_, j) => j !== i))} className="ml-3 text-xs text-gray-500 hover:text-red-600">
                      Tirar
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {aviso && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{aviso}</p>}
          {erros.length > 0 && (
            <ul role="alert" className="space-y-1 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {erros.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50 px-6 py-3">
          <a href={`/api/dossies/${dossieId}/arquivo`} target="_blank" rel="noreferrer" className="text-sm text-brand underline decoration-dotted underline-offset-2">
            Abrir PDF do dossiê
          </a>
          <div className="flex gap-3">
            <button type="button" onClick={onFechar} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-white">
              Fechar
            </button>
            <button type="button" onClick={anexar} disabled={enviando || !selecionados.length} className="rounded-lg bg-brand px-5 py-2 text-sm font-semibold text-white hover:brightness-95 disabled:opacity-50">
              {enviando ? "Anexando…" : `Anexar${selecionados.length ? ` (${selecionados.length})` : ""}`}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Link "editar dossie" que abre a janela de anexos. */
export default function EditarDossie({ dossieId, rotulo, className }: { dossieId: string; rotulo: string; className?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setAberto(true)} title="Anexar documentos ao fim do dossiê" className={className ?? "text-[11px] text-gray-500 underline decoration-dotted underline-offset-2 hover:text-gray-700"}>
        editar dossiê
      </button>
      {aberto && <JanelaEditarDossie dossieId={dossieId} rotulo={rotulo} onFechar={() => setAberto(false)} />}
    </>
  );
}
