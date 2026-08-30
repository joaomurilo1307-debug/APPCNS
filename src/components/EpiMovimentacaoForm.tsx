"use client";

import { useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null };
type Produto = { id: string; nome: string; unidade?: string };
type Colaborador = { id: string; nomeCompleto: string; contratoId: string };

export default function EpiMovimentacaoForm({
  contratos,
  produtos,
  colaboradores,
  produtoFixo,
  contratoFixo,
  onClose,
  onSaved,
}: {
  contratos: Contrato[];
  produtos: Produto[];
  colaboradores: Colaborador[];
  produtoFixo?: Produto;
  contratoFixo?: Contrato;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("SAIDA");
  const [produtoId, setProdutoId] = useState(produtoFixo?.id ?? "");
  const [contratoId, setContratoId] = useState(contratoFixo?.id ?? "");
  const [colaboradorId, setColaboradorId] = useState("");
  const [quantidade, setQuantidade] = useState(1);
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const colaboradoresDoContrato = colaboradores.filter((c) => !contratoId || c.contratoId === contratoId);

  async function salvar() {
    if (!produtoId || !contratoId) {
      setErro("Escolha produto e contrato.");
      return;
    }
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tipo, produtoId, contratoId, colaboradorId: colaboradorId || null, quantidade, observacao: observacao || null }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">{produtoFixo ? produtoFixo.nome : "Nova movimentação"}</h3>
        {contratoFixo && <p className="mb-4 text-xs text-gray-400">{contratoFixo.codigo}</p>}
        {!contratoFixo && <div className="mb-4" />}

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setTipo("SAIDA")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tipo === "SAIDA" ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-500"}`}
          >
            Saída (retirada)
          </button>
          <button
            onClick={() => setTipo("ENTRADA")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tipo === "ENTRADA" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
          >
            Entrada
          </button>
        </div>

        {!contratoFixo && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Contrato</span>
            <select value={contratoId} onChange={(e) => setContratoId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Selecione...</option>
              {contratos.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.codigo} {c.nome ? `— ${c.nome}` : ""}
                </option>
              ))}
            </select>
          </label>
        )}

        {!produtoFixo && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Produto</span>
            <select value={produtoId} onChange={(e) => setProdutoId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">Selecione...</option>
              {produtos.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mb-3 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Quantidade</span>
          <input
            type="number"
            min={1}
            value={quantidade}
            onChange={(e) => setQuantidade(parseInt(e.target.value, 10) || 1)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        {tipo === "SAIDA" && (
          <label className="mb-3 block text-sm">
            <span className="mb-1 block text-xs font-medium text-gray-500">Colaborador (opcional)</span>
            <select value={colaboradorId} onChange={(e) => setColaboradorId(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2">
              <option value="">— não associar —</option>
              {colaboradoresDoContrato.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Observação (opcional)</span>
          <input value={observacao} onChange={(e) => setObservacao(e.target.value)} className="w-full rounded-lg border border-gray-300 px-3 py-2" />
        </label>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button onClick={salvar} disabled={saving} className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50">
            {saving ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
