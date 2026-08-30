"use client";

import { useEffect, useState } from "react";
import EpiMovimentacaoForm from "@/components/EpiMovimentacaoForm";

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
        <EpiMovimentacaoForm
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
