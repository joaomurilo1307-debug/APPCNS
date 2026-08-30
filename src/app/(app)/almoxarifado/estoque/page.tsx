"use client";

import { useEffect, useMemo, useState } from "react";
import EpiMovimentacaoForm from "@/components/EpiMovimentacaoForm";

type Contrato = { id: string; codigo: string; nome: string | null };
type Colaborador = { id: string; nomeCompleto: string; contratoId: string };
type EstoqueRow = {
  id: string;
  produto: { id: string; nome: string; tipo: string; ca: string | null; unidade: string; valorUnitario: number | null };
  contrato: Contrato | null;
  estoqueInicial: number;
  entradas: number;
  saidas: number;
  estoqueAtual: number;
  estoqueMinimo: number;
  necessidade: number;
  status: "OK" | "COMPRAR";
  valorEmEstoque: number | null;
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

function fmtMoney(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function EstoquePage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [produtos, setProdutos] = useState<{ id: string; nome: string }[]>([]);
  const [rows, setRows] = useState<EstoqueRow[]>([]);
  const [contratoFiltro, setContratoFiltro] = useState<string>("");
  const [busca, setBusca] = useState("");
  const [modalRow, setModalRow] = useState<EstoqueRow | null>(null);
  const [editandoMinimo, setEditandoMinimo] = useState<string | null>(null);
  const [minimoRascunho, setMinimoRascunho] = useState("");

  function reload() {
    const qs = contratoFiltro ? `?contratoId=${contratoFiltro}` : "";
    fetch(`/api/epi/estoque${qs}`).then((r) => r.json()).then(setRows).catch(() => {});
  }

  useEffect(() => {
    fetch("/api/epi/contratos").then((r) => r.json()).then(setContratos).catch(() => {});
    fetch("/api/epi/colaboradores").then((r) => r.json()).then(setColaboradores).catch(() => {});
    fetch("/api/epi/produtos").then((r) => r.json()).then(setProdutos).catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const id = setInterval(reload, 20000); // ao vivo
    return () => clearInterval(id);
  }, [contratoFiltro]);

  const filtered = useMemo(
    () => rows.filter((r) => !busca || r.produto.nome.toLowerCase().includes(busca.toLowerCase())),
    [rows, busca]
  );

  async function salvarMinimo(id: string) {
    const valor = parseFloat(minimoRascunho.replace(",", "."));
    if (Number.isNaN(valor) || valor < 0) {
      setEditandoMinimo(null);
      return;
    }
    await fetch(`/api/epi/estoque/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estoqueMinimo: valor }),
    });
    setEditandoMinimo(null);
    reload();
  }

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
        <span className="text-xs text-gray-400">{filtered.length} itens · mínimo é editável, clique no número</span>
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
              <th className="px-4 py-3 text-right">Valor em estoque</th>
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
                <td className="px-4 py-2.5 text-right">
                  {editandoMinimo === r.id ? (
                    <input
                      autoFocus
                      value={minimoRascunho}
                      onChange={(e) => setMinimoRascunho(e.target.value)}
                      onBlur={() => salvarMinimo(r.id)}
                      onKeyDown={(e) => e.key === "Enter" && salvarMinimo(r.id)}
                      className="w-16 rounded border border-brand px-1 py-0.5 text-right text-sm"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setEditandoMinimo(r.id);
                        setMinimoRascunho(String(r.estoqueMinimo));
                      }}
                      className="rounded px-1 text-gray-500 underline decoration-dotted hover:text-brand-dark"
                      title="Clique para editar o mínimo"
                    >
                      {r.estoqueMinimo}
                    </button>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right text-gray-400">{r.valorEmEstoque !== null ? fmtMoney(r.valorEmEstoque) : "—"}</td>
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
                <td colSpan={10} className="px-4 py-8 text-center text-sm text-gray-400">
                  Nenhum item encontrado. Importe uma planilha em "Importar planilha".
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {modalRow && (
        <EpiMovimentacaoForm
          contratos={contratos}
          produtos={produtos}
          colaboradores={colaboradores.filter((c) => !modalRow.contrato || c.contratoId === modalRow.contrato.id)}
          produtoFixo={modalRow.produto}
          contratoFixo={modalRow.contrato ?? undefined}
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
