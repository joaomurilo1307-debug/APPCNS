"use client";

import { useEffect, useMemo, useState } from "react";

type Mes = { competencia: string; valor: number };
type Conta = { contaFinanceira: string; total: number; meses: Mes[] };
type Contrato = {
  codccu: string;
  contrato: string;
  teamId: string | null;
  teamName: string | null;
  projectName: string | null;
  totalGeral: number;
  ultimaCompetencia: string | null;
  contas: Conta[];
};

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatMesAno(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

export default function CustoPlanoDeContasPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  const [busca, setBusca] = useState("");

  useEffect(() => {
    fetch("/api/custos-conta")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar");
        }
        return res.json();
      })
      .then((data) => setContratos(data.contratos))
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contratos;
    return contratos.filter(
      (c) => c.contrato.toLowerCase().includes(termo) || c.codccu.toLowerCase().includes(termo)
    );
  }, [contratos, busca]);

  const totalGeral = contratos.reduce((s, c) => s + c.totalGeral, 0);

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Custo por Plano de Contas</h1>
      <p className="mb-6 text-sm text-gray-500">
        Custo real de cada contrato, aberto por conta financeira (plano de contas) e mês, sincronizado do Rito de
        Gestão. Você vê aqui apenas os contratos das equipes das quais participa.
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Contratos visíveis</p>
          <p className="text-2xl font-semibold">{contratos.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Custo total (todo o período)</p>
          <p className="text-2xl font-semibold">{formatMoeda(totalGeral)}</p>
        </div>
      </div>

      <input
        type="text"
        placeholder="Buscar por contrato ou CCU..."
        value={busca}
        onChange={(e) => setBusca(e.target.value)}
        className="mb-4 w-full max-w-sm rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
      />

      <div className="space-y-3">
        {filtrados.map((c) => (
          <div key={c.codccu} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
            <button
              onClick={() => setExpandido(expandido === c.codccu ? null : c.codccu)}
              className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{c.contrato}</p>
                <p className="text-xs text-gray-400">
                  CCU {c.codccu}
                  {c.teamName ? ` · ${c.teamName}` : " · sem equipe vinculada"}
                  {c.ultimaCompetencia ? ` · última competência ${formatMesAno(c.ultimaCompetencia)}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3">
                <span className="text-sm font-semibold">{formatMoeda(c.totalGeral)}</span>
                <span className="text-gray-400">{expandido === c.codccu ? "▲" : "▼"}</span>
              </div>
            </button>

            {expandido === c.codccu && (
              <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-3">
                <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Custo por conta financeira</p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-gray-500">
                      <tr>
                        <th className="py-1 pr-4">Conta financeira</th>
                        <th className="py-1 pr-4">Meses com lançamento</th>
                        <th className="py-1 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.contas.map((conta) => (
                        <tr key={conta.contaFinanceira} className="border-t border-gray-100">
                          <td className="py-1.5 pr-4">{conta.contaFinanceira}</td>
                          <td className="py-1.5 pr-4 text-xs text-gray-500">{conta.meses.length}</td>
                          <td className="py-1.5 text-right font-medium">{formatMoeda(conta.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        ))}
        {filtrados.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
            {contratos.length === 0
              ? "Nenhum dado de custo por plano de contas disponível para você ainda."
              : "Nenhum contrato encontrado com esse filtro."}
          </div>
        )}
      </div>
    </div>
  );
}
