"use client";

import { useState } from "react";
import type { FichaContrato } from "./FichaEditor";

export default function ControleAcompanhamentoContrato({ ficha, onSalvo }: { ficha: FichaContrato; onSalvo: (f: FichaContrato) => void }) {
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const incluido = ficha.acompanharResultados !== false;

  async function alternar() {
    setSalvando(true); setErro("");
    try {
      const r = await fetch(`/api/contratos/${encodeURIComponent(ficha.codccu)}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ acompanharResultados: !incluido }),
      });
      const j = await r.json().catch(() => null);
      if (!r.ok) throw new Error(typeof j?.error === "string" ? j.error : "Não foi possível atualizar o acompanhamento.");
      onSalvo(j.contrato);
    } catch (e) { setErro(e instanceof Error ? e.message : "Não foi possível atualizar o acompanhamento."); }
    finally { setSalvando(false); }
  }

  return <div className="rounded-xl border border-gray-200 bg-white/80 px-4 py-3">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div><p className="text-sm font-medium text-gray-800">Incluir nos resultados</p><p className="mt-0.5 max-w-xl text-xs text-gray-500">Controla os consolidados e as seleções de novas iniciativas. A situação do contrato e seu histórico são preservados.</p></div>
      <button type="button" role="switch" aria-label="Incluir contrato nos resultados" aria-checked={incluido} disabled={salvando} onClick={() => void alternar()}
        className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium disabled:opacity-50 ${incluido ? "border-teal-200 bg-teal-50 text-teal-800" : "border-gray-200 bg-gray-100 text-gray-600"}`}>
        <span className={`h-2 w-2 rounded-full ${incluido ? "bg-brand" : "bg-gray-400"}`} />{salvando ? "Salvando…" : incluido ? "Incluído" : "Fora dos resultados"}
      </button>
    </div>
    {erro && <p role="alert" className="mt-2 text-xs text-red-600">{erro}</p>}
  </div>;
}
