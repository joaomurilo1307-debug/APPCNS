"use client";

import { useEffect, useMemo, useState } from "react";

type Titulo = {
  numTit: string;
  codFil: string;
  fornecedorNome: string;
  tipo: string;
  situacao: string;
  pago: boolean;
  dataEmissao: string | null;
  vencimentoOriginal: string | null;
  vencimentoProgramado: string | null;
  valorOriginal: number;
  valorAberto: number;
  ccuNome: string | null;
  numOcp: string | null;
};

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

export default function ProgramacaoPagamentoPage() {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<"todos" | "aberto" | "comOcp">("aberto");
  const [totalAberto, setTotalAberto] = useState(0);
  const [qtdAberto, setQtdAberto] = useState(0);
  const [qtdComOcp, setQtdComOcp] = useState(0);

  useEffect(() => {
    fetch("/api/titulos-pagar")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar");
        }
        return res.json();
      })
      .then((data) => {
        setTitulos(data.titulos);
        setTotalAberto(data.totalAberto ?? 0);
        setQtdAberto(data.qtdAberto ?? 0);
        setQtdComOcp(data.qtdComOcp ?? 0);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return titulos
      .filter((t) => {
        if (filtro === "aberto") return !t.pago;
        if (filtro === "comOcp") return !!t.numOcp;
        return true;
      })
      .filter(
        (t) =>
          !termo ||
          t.numTit.toLowerCase().includes(termo) ||
          t.fornecedorNome.toLowerCase().includes(termo) ||
          (t.numOcp || "").toLowerCase().includes(termo)
      );
  }, [titulos, busca, filtro]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Programação de Pagamento</h1>
      <p className="mb-5 max-w-3xl text-sm text-gray-500">
        Contas a pagar por título, sincronizado do Senior (E501TCP). Traz o número da OC de origem quando existe, pra
        cruzar com Aprovações — Ordens de Compra: uma OC aprovada aqui aparece com o título correspondente, pago ou
        ainda em aberto.
      </p>

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Ver</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
            {(
              [
                ["aberto", "Em aberto"],
                ["comOcp", "Ligados a uma OC"],
                ["todos", "Todos"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFiltro(v)}
                className={`px-3 py-2 ${filtro === v ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          placeholder="Buscar por título, fornecedor ou nº da OC..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Títulos em aberto</p>
          <p className="text-2xl font-semibold">{qtdAberto}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Valor em aberto</p>
          <p className="text-2xl font-semibold">{formatMoeda(totalAberto)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Ligados a uma OC</p>
          <p className="text-2xl font-semibold">{qtdComOcp}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Mostrando</p>
          <p className="text-2xl font-semibold">{filtrados.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Fornecedor</th>
              <th className="px-4 py-2">Centro de custo</th>
              <th className="px-4 py-2">OC de origem</th>
              <th className="px-4 py-2">Vencto programado</th>
              <th className="px-4 py-2 text-right">Valor original</th>
              <th className="px-4 py-2 text-right">Valor em aberto</th>
              <th className="px-4 py-2">Pago?</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((t) => (
              <tr key={`${t.numTit}-${t.codFil}`} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium">{t.numTit}</td>
                <td className="px-4 py-2 max-w-[220px] truncate" title={t.fornecedorNome}>
                  {t.fornecedorNome}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{t.ccuNome || "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{t.numOcp ? `OC ${t.numOcp}` : "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{formatData(t.vencimentoProgramado)}</td>
                <td className="px-4 py-2 text-right">{formatMoeda(t.valorOriginal)}</td>
                <td className="px-4 py-2 text-right font-medium">{formatMoeda(t.valorAberto)}</td>
                <td className="px-4 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      t.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t.pago ? "Pago" : "Não pago"}
                  </span>
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  Nenhum título encontrado com esse filtro.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
