"use client";

import { useState } from "react";

export type FichaContrato = {
  codccu: string; nome: string; tipo: string; status: string; acompanharResultados: boolean; cliente: string | null; numero: string | null; objeto: string | null;
  vigenciaInicio: string | null; vigenciaFim: string | null; valor: number | null; observacoes: string | null;
};

const dia = (iso: string | null) => (iso ? iso.slice(0, 10) : "");

export default function FichaEditor({ ficha, onSalvo, onFechar }: { ficha: FichaContrato; onSalvo: (f: FichaContrato) => void; onFechar: () => void }) {
  const [f, setF] = useState({
    nome: ficha.nome, tipo: ficha.tipo, status: ficha.status, cliente: ficha.cliente ?? "", numero: ficha.numero ?? "", objeto: ficha.objeto ?? "",
    vigenciaInicio: dia(ficha.vigenciaInicio), vigenciaFim: dia(ficha.vigenciaFim), valor: ficha.valor === null ? "" : String(ficha.valor).replace(".", ","), observacoes: ficha.observacoes ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const set = (k: string, v: string) => setF((x) => ({ ...x, [k]: v }));

  async function salvar(e: React.FormEvent) {
    e.preventDefault();
    setSalvando(true); setErro("");
    const valorNum = f.valor.trim() === "" ? null : Number(f.valor.replace(/\./g, "").replace(",", "."));
    if (valorNum !== null && !Number.isFinite(valorNum)) { setErro("Valor do contrato inválido."); setSalvando(false); return; }
    const r = await fetch(`/api/contratos/${ficha.codccu}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nome: f.nome, tipo: f.tipo, status: f.status, cliente: f.cliente || null, numero: f.numero || null, objeto: f.objeto || null, vigenciaInicio: f.vigenciaInicio || null, vigenciaFim: f.vigenciaFim || null, valor: valorNum, observacoes: f.observacoes || null }),
    });
    setSalvando(false);
    if (!r.ok) { setErro((await r.json().catch(() => ({}))).error?.toString?.() || "Não foi possível salvar."); return; }
    onSalvo((await r.json()).contrato);
  }

  const campo = "w-full rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none";
  const rot = "mb-1 block text-xs font-medium uppercase tracking-wide text-gray-500";
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4" onClick={onFechar}>
      <form onSubmit={salvar} onClick={(e) => e.stopPropagation()} className="my-8 w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold">Ficha do contrato · CCU {ficha.codccu}</h2>
        <p className="mb-4 text-[13px] text-gray-500">Os custos vêm do Senior. Aqui ficam os dados cadastrais do contrato.</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><label className={rot}>Nome</label><input className={campo} value={f.nome} onChange={(e) => set("nome", e.target.value)} required /></div>
          <div><label className={rot}>Cliente</label><input className={campo} value={f.cliente} onChange={(e) => set("cliente", e.target.value)} /></div>
          <div><label className={rot}>Número do contrato</label><input className={campo} value={f.numero} onChange={(e) => set("numero", e.target.value)} /></div>
          <div><label className={rot}>Tipo</label><select className={campo} value={f.tipo} onChange={(e) => set("tipo", e.target.value)}><option value="CONTRATO">Contrato</option><option value="ADMINISTRATIVO">Administrativo</option></select></div>
          <div><label className={rot}>Situação</label><select className={campo} value={f.status} onChange={(e) => set("status", e.target.value)}><option value="ATIVO">Ativo</option><option value="ENCERRADO">Encerrado</option></select></div>
          <div><label className={rot}>Início da vigência</label><input type="date" className={campo} value={f.vigenciaInicio} onChange={(e) => set("vigenciaInicio", e.target.value)} /></div>
          <div><label className={rot}>Fim da vigência</label><input type="date" className={campo} value={f.vigenciaFim} onChange={(e) => set("vigenciaFim", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={rot}>Valor do contrato (R$)</label><input className={campo} inputMode="decimal" placeholder="0,00" value={f.valor} onChange={(e) => set("valor", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={rot}>Objeto</label><textarea className={campo} rows={2} value={f.objeto} onChange={(e) => set("objeto", e.target.value)} /></div>
          <div className="sm:col-span-2"><label className={rot}>Observações</label><textarea className={campo} rows={2} value={f.observacoes} onChange={(e) => set("observacoes", e.target.value)} /></div>
        </div>
        {erro && <p className="mt-3 text-sm text-red-600">{erro}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onFechar} className="rounded-lg border border-gray-200 px-4 py-2 text-sm">Cancelar</button>
          <button disabled={salvando} className="rounded-lg bg-brand px-5 py-2 text-sm font-medium text-white hover:bg-brand-dark disabled:opacity-60">{salvando ? "Salvando…" : "Salvar"}</button>
        </div>
      </form>
    </div>
  );
}
