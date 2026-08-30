"use client";

import { useEffect, useMemo, useState } from "react";

type Contrato = { id: string; codigo: string; nome: string | null };
type Colaborador = { id: string; nomeCompleto: string; contratoId: string };
type EstoqueRow = {
  id: string;
  produto: { id: string; nome: string; tipo: string; ca: string | null; unidade: string };
  contrato: Contrato | null;
  estoqueInicial: number;
  entradas: number;
  saidas: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  necessidade: number;
  status: "OK" | "COMPRAR";
};

function StatusBadge({ status }: { status: "OK" | "COMPRAR" }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
        status === "COMPRAR" ? "bg-rose-50 text-rose-600" : "bg-brand-light text-brand-dark"
      }`}
    >
      {status === "COMPRAR" ? "Comprar" : "OK"}
    </span>
  );
}

export default function EstoquePage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [rows, setRows] = useState<EstoqueRow[]>([]);
  const [contratoFiltro, setContratoFiltro] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [modalRow, setModalRow] = useState<EstoqueRow | null>(null);

  function reload() {
    const qs = contratoFiltro ? `?contratoId=${contratoFiltro}` : "";
    fetch(`/api/epi/estoque${qs}`).then((r) => r.json()).then(setRows).catch(() => {});
  }

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
    fetch("/api/epi/colaboradores").then((r) => r.json()).then(setColaboradores).catch(() => {});
  }, []);

  useEffect(reload, [contratoFiltro]);

  const filtered = useMemo(
    () => rows.filter((r) => !busca || r.produto.nome.toLowerCase().includes(busca.toLowerCase())),
    [rows, busca]
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select
          value={contratoFiltro}
          onChange={(e) => setContratoFiltro(e.target.value)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Todos os contratos</option>
          <option value="geral">Geral (depósito central)</option>
          {contratos.map((c) => (
            <option key={c.id} value={c.id}>
              {c.codigo} {c.nome ? `— ${c.nome}` : ""}
            </option>
          ))}
        </select>
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar produto..."
          className="w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <span className="text-xs text-gray-400">{filtered.length} itens</span>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-400">
              <th className="px-4 py-3">Produto</th>
              <th className="px-4 py-3">Contrato</th>
              <th className="px-4 py-3 text-right">Inicial</th>
              <th className="px-4 py-3 text-right">Entradas</th>
              <th className="px-4 py-3 text-right">Saídas</th>
              <th className="px-4 py-3 text-right">Atual</th>
              <th className="px-4 py-3 text-right">Mínimo</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id} className="border-b border-gray-50 last:border-0 hover:bg-gray-50/60">
                <td className="px-4 py-2.5">
                  <p className="font-medium text-gray-700">{r.produto.nome}</p>
                  {r.produto.ca && <p className="text-xs text-gray-400">CA {r.produto.ca}</p>}
                </td>
                <td className="px-4 py-2.5 text-gray-500">{r.contrato?.codigo ?? "Geral"}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{r.estoqueInicial}</td>
                <td className="px-4 py-2.5 text-right text-brand-dark">{r.entradas}</td>
                <td className="px-4 py-2.5 text-right text-rose-500">{r.saidas}</td>
                <td className="px-4 py-2.5 text-right font-semibold text-gray-800">{r.estoqueAtual}</td>
                <td className="px-4 py-2.5 text-right text-gray-500">{r.estoqueMinimo}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-4 py-2.5 text-right">
                  <button
                    onClick={() => setModalRow(r)}
                    className="rounded-lg bg-brand px-3 py-1.5 text-xs font-semibold text-white hover:bg-brand-dark"
                  >
                    + Movimentação
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum item encontrado. Importe uma planilha em "Importar planilha".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalRow && (
        <MovimentacaoModal
          row={modalRow}
          colaboradores={colaboradores.filter((c) => !modalRow.contrato || c.contratoId === modalRow.contrato.id)}
          onClose={() => setModalRow(null)}
          onSaved={() => {
            setModalRow(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

function MovimentacaoModal({
  row,
  colaboradores,
  onClose,
  onSaved,
}: {
  row: EstoqueRow;
  colaboradores: Colaborador[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<"ENTRADA" | "SAIDA">("SAIDA");
  const [quantidade, setQuantidade] = useState(1);
  const [colaboradorId, setColaboradorId] = useState("");
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!row.contrato) {
      setErro("Este item é do depósito geral — associe um contrato a ele antes de movimentar (edite em Estoque).");
      return;
    }
    setSaving(true);
    setErro(null);
    const res = await fetch("/api/epi/movimentacoes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tipo,
        produtoId: row.produto.id,
        contratoId: row.contrato.id,
        colaboradorId: colaboradorId || null,
        quantidade,
        observacao: observacao || null,
      }),
    });
    setSaving(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setErro(data.error ? JSON.stringify(data.error) : "Erro ao salvar movimentação.");
      return;
    }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-elevated" onClick={(e) => e.stopPropagation()}>
        <h3 className="mb-1 text-lg font-semibold text-ink">{row.produto.nome}</h3>
        <p className="mb-4 text-xs text-gray-400">{row.contrato?.codigo ?? "Geral"} · Estoque atual: {row.estoqueAtual}</p>

        <div className="mb-3 flex gap-2">
          <button
            onClick={() => setTipo("SAIDA")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              tipo === "SAIDA" ? "bg-rose-500 text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            Saída (retirada)
          </button>
          <button
            onClick={() => setTipo("ENTRADA")}
            className={`flex-1 rounded-lg py-2 text-sm font-semibold ${
              tipo === "ENTRADA" ? "bg-brand text-white" : "bg-gray-100 text-gray-500"
            }`}
          >
            Entrada
          </button>
        </div>

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
            <select
              value={colaboradorId}
              onChange={(e) => setColaboradorId(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="">— não associar —</option>
              {colaboradores.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nomeCompleto}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="mb-4 block text-sm">
          <span className="mb-1 block text-xs font-medium text-gray-500">Observação (opcional)</span>
          <input
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>

        {erro && <p className="mb-3 text-xs text-rose-600">{erro}</p>}

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-600">
            Cancelar
          </button>
          <button
            onClick={salvar}
            disabled={saving}
            className="rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-dark disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Registrar"}
          </button>
        </div>
      </div>
    </div>
  );
}
