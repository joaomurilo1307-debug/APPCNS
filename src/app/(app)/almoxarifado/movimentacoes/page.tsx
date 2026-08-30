"use client";

import { useEffect, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null };
type Produto = { id: string; nome: string; unidade: string };
type Colaborador = { id: string; nomeCompleto: string; contratoId: string };
type Movimentacao = {
  id: string;
  tipo: "ENTRADA" | "SAIDA";
  quantidade: number;
  data: string;
  observacao: string | null;
  produto: { nome: string; unidade: string };
  contrato: { codigo: string } | null;
  colaborador: { nomeCompleto: string } | null;
  registradoPor: { name: string } | null;
};

export default function MovimentacoesPage() {
  const [movs, setMovs] = useState<Movimentacao[]>([]);
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [produtos, setProdutos] = useState<Produto[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [showForm, setShowForm] = useState(false);

  function reload() {
    fetch("/api/epi/movimentacoes").then((r) => r.json()).then(setMovs).catch(() => {});
  }

  useEffect(() => {
    reload();
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
    fetch("/api/epi/colaboradores").then((r) => r.json()).then(setColaboradores).catch(() => {});
  }, []);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <p className="text-xs text-gray-400">{movs.length} movimentações recentes</p>
        <button
          onClick={() => setShowForm(true)}
          className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark"
        >
          + Nova movimentação
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Data</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Contrato</th>
              <th className="px-4 py-3">Colaborador</th>
              <th className="px-4 py-3 text-right">Qtd.</th>
              <th className="px-4 py-3">Registrado por</th>
            </tr>
          </thead>
          <tbody>
            {movs.map((m) => (
              <tr key={m.id} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2.5 text-gray-500">{new Date(m.data).toLocaleDateString("pt-BR")}</td>
                <td className="px-4 py-2.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                      m.tipo === "ENTRADA" ? "bg-brand-light text-brand-dark" : "bg-rose-50 text-rose-600"
                    }`}
                  >
                    {m.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-medium text-gray-700">{m.produto.nome}</td>
                <td className="px-4 py-2.5 text-gray-500">{m.contrato?.codigo ?? "Geral"}</td>
                <td className="px-4 py-2.5 text-gray-500">{m.colaborador?.nomeCompleto ?? "—"}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-700">{m.quantidade}</td>
                <td className="px-4 py-2.5 text-gray-400">{m.registradoPor?.name ?? "—"}</td>
              </tr>
            ))}
            {movs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhuma movimentação registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <NovaMovimentacaoForm
          contratos={contratos}
          produtos={produtos}
          colaboradores={colaboradores}
          onClose={() => setShowForm(false)}
          onSaved={() => {
            setShowForm(false);
            reload();
          }}
        />
      )}
    </div>
  );
}

function NovaMovimentacaoForm({
  contratos,
  produtos,
  colaboradores,
  onClose,
  onSaved,
}: {
  contratos: Contrato[];
  produtos: Produto[];
  colaboradores: Colaborador[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("SAIDA");
  const [produtoId, setProdutoId] = useState("");
  const [contratoId, setContratoId] = useState("");
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
        <h3 className="mb-4 text-lg font-semibold text-ink">Nova movimentação</h3>

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setTipo("SAIDA")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tipo === "SAIDA" ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-500"}`}
          >
            Saída
          </button>
          <button
            onClick={() => setTipo("ENTRADA")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${tipo === "ENTRADA" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"}`}
          >
            Entrada
          </button>
        </div>

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
