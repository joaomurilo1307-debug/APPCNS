"use client";

// A escolha de resultados e independente da situacao ATIVO/ENCERRADO.
import { useMemo, useState } from "react";

export type ContratoDaLista = { codccu: string; nome: string; tipo: string; status: string; acompanharResultados: boolean; cliente: string | null };

export default function GerenciarContratosAtivos({ contratos, aoFechar, aoSalvar }: { contratos: ContratoDaLista[]; aoFechar: () => void; aoSalvar: () => void }) {
  const [ativos, setAtivos] = useState<Set<string>>(() => new Set(contratos.filter((c) => c.acompanharResultados !== false).map((c) => c.codccu)));
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState<"todos" | "CONTRATO" | "ADMINISTRATIVO">("todos");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return contratos
      .filter((c) => (tipo === "todos" || c.tipo === tipo) && (!t || `${c.codccu} ${c.nome} ${c.cliente ?? ""}`.toLowerCase().includes(t)))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR", { numeric: true }));
  }, [contratos, busca, tipo]);
  const mudancas = useMemo(() => contratos.filter((c) => (c.acompanharResultados !== false) !== ativos.has(c.codccu)), [contratos, ativos]);

  const alternar = (ccu: string) => setAtivos((s) => { const n = new Set(s); if (n.has(ccu)) n.delete(ccu); else n.add(ccu); return n; });
  const marcarVisiveis = (valor: boolean) => setAtivos((s) => { const n = new Set(s); for (const c of visiveis) { if (valor) n.add(c.codccu); else n.delete(c.codccu); } return n; });

  async function salvar() {
    setSalvando(true);
    setErro("");
    try {
    const r = await fetch("/api/contratos/ativos", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ itens: mudancas.map((c) => ({ codccu: c.codccu, acompanharResultados: ativos.has(c.codccu) })) }),
    });
    setSalvando(false);
    if (!r.ok) {
      const j = await r.json().catch(() => null);
      return setErro(typeof j?.error === "string" ? j.error : "Não foi possível salvar.");
    }
    aoSalvar();
    } catch { setErro("Não foi possível salvar. Tente novamente."); }
    finally { setSalvando(false); }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div role="dialog" aria-modal="true" aria-label="Contratos nos resultados" className="my-6 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">Contratos nos resultados</h2>
            <p className="mt-0.5 text-[13px] text-gray-500">Marque os contratos que entram nos consolidados e nas seleções de novas iniciativas. A situação Ativo/Encerrado é independente. O histórico e as obrigações financeiras são preservados, e você pode incluir novamente quando quiser.</p>
          </div>
          <button onClick={aoFechar} aria-label="Fechar" className="rounded p-1 text-gray-400 hover:text-gray-700">✕</button>
        </div>

        <div className="mb-2 flex flex-wrap items-center gap-2">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contrato, número do centro de custo ou cliente…" aria-label="Buscar contrato" className="min-w-[14rem] flex-1 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none" />
          <select value={tipo} onChange={(e) => setTipo(e.target.value as typeof tipo)} aria-label="Tipo" className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-sm">
            <option value="todos">Todos os tipos</option>
            <option value="CONTRATO">Contratos</option>
            <option value="ADMINISTRATIVO">Administrativos</option>
          </select>
        </div>
        <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-gray-500">
          <button onClick={() => marcarVisiveis(true)} className="underline hover:text-gray-800">incluir os que aparecem na lista</button>
          <button onClick={() => marcarVisiveis(false)} className="underline hover:text-gray-800">retirar os que aparecem na lista</button>
          <span className="ml-auto">{ativos.size} incluído(s) de {contratos.length}</span>
        </div>

        <ul className="max-h-[50vh] divide-y divide-gray-100 overflow-y-auto rounded-xl border border-gray-200">
          {visiveis.map((c) => {
            const ligado = ativos.has(c.codccu);
            const mudou = (c.acompanharResultados !== false) !== ligado;
            return (
              <li key={c.codccu}>
                <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                  <input type="checkbox" checked={ligado} onChange={() => alternar(c.codccu)} className="h-4 w-4 accent-[#00A99D]" />
                  <span className="flex-1">
                    <span className={ligado ? "text-gray-800" : "text-gray-400 line-through"}>{c.nome}</span>
                    <span className="ml-2 text-xs text-gray-400">CCU {c.codccu} · {c.status === "ENCERRADO" ? "Encerrado" : "Ativo"}{c.cliente ? ` · ${c.cliente}` : ""}</span>
                  </span>
                  {mudou && <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${ligado ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>{ligado ? "vai incluir" : "vai retirar"}</span>}
                </label>
              </li>
            );
          })}
          {visiveis.length === 0 && <li className="px-3 py-6 text-center text-sm text-gray-400">Nenhum contrato encontrado.</li>}
        </ul>

        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-gray-400">{mudancas.length === 0 ? "Nenhuma mudança" : `${mudancas.length} mudança(s) para salvar`}</span>
          <button onClick={aoFechar} className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-600 hover:bg-gray-50">Cancelar</button>
          <button onClick={salvar} disabled={salvando || mudancas.length === 0} className="rounded-md bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-50">{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </div>
    </div>
  );
}
