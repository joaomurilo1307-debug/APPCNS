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
  // competencia sempre e dia 1 as 00:00Z -- formata em UTC pra nao "voltar"
  // um mes em fuso negativo (ex: 2026-07-01Z virava "junho" em GMT-3)
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" });
}

export default function CustoPlanoDeContasPage() {
  const [contratos, setContratos] = useState<Contrato[]>([]);
  const [meses, setMeses] = useState<string[]>([]);
  const [mesSel, setMesSel] = useState<string>("");
  const [visao, setVisao] = useState<"conta" | "cc">("cc");
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
      .then((data) => {
        setContratos(data.contratos);
        setMeses(data.meses ?? []);
        setMesSel((data.meses ?? [])[0] ?? "");
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  // aplica o mes selecionado: recalcula total de cada contrato/conta com base
  // so nos lancamentos daquele mes
  const contratosNoMes = useMemo(() => {
    if (!mesSel) return [];
    const termo = busca.trim().toLowerCase();
    return contratos
      .map((c) => {
        const contas = c.contas
          .map((conta) => {
            const m = conta.meses.find((x) => x.competencia === mesSel);
            return m ? { contaFinanceira: conta.contaFinanceira, total: m.valor } : null;
          })
          .filter((x): x is { contaFinanceira: string; total: number } => x !== null)
          .sort((a, b) => b.total - a.total);
        const totalMes = contas.reduce((s, x) => s + x.total, 0);
        return { ...c, contasMes: contas, totalMes };
      })
      .filter((c) => c.totalMes !== 0)
      .filter((c) => !termo || c.contrato.toLowerCase().includes(termo) || c.codccu.toLowerCase().includes(termo))
      .sort((a, b) => b.totalMes - a.totalMes);
  }, [contratos, mesSel, busca]);

  const totalMesGeral = contratosNoMes.reduce((s, c) => s + c.totalMes, 0);

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Custo por Centro de Custo e Plano de Contas</h1>
      <p className="mb-5 text-sm text-gray-500">
        Custo real de cada contrato/CC no mês escolhido, sincronizado do Rito de Gestão. Você vê apenas os contratos
        das equipes das quais participa.
      </p>

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Mês</label>
          <select
            value={mesSel}
            onChange={(e) => setMesSel(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
          >
            {meses.map((m) => (
              <option key={m} value={m}>
                {formatMesAno(m)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Visão</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
            <button
              onClick={() => setVisao("cc")}
              className={`px-3 py-2 ${visao === "cc" ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Resumo por centro de custo
            </button>
            <button
              onClick={() => setVisao("conta")}
              className={`px-3 py-2 ${visao === "conta" ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
            >
              Aberto por conta financeira
            </button>
          </div>
        </div>
        <input
          type="text"
          placeholder="Buscar contrato ou CCU..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-56 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Contratos com custo no mês</p>
          <p className="text-2xl font-semibold">{contratosNoMes.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Custo total no mês</p>
          <p className="text-2xl font-semibold">{formatMoeda(totalMesGeral)}</p>
        </div>
      </div>

      {visao === "cc" ? (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Centro de custo / Contrato</th>
                <th className="px-4 py-2">Equipe</th>
                <th className="px-4 py-2">Contas com lançamento</th>
                <th className="px-4 py-2 text-right">Custo no mês</th>
              </tr>
            </thead>
            <tbody>
              {contratosNoMes.map((c) => (
                <tr key={c.codccu} className="border-t border-gray-50">
                  <td className="px-4 py-2">
                    <span className="font-medium">{c.contrato}</span>
                    <span className="ml-1 text-xs text-gray-400">CCU {c.codccu}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">{c.teamName || "—"}</td>
                  <td className="px-4 py-2 text-xs text-gray-500">{c.contasMes.length}</td>
                  <td className="px-4 py-2 text-right font-medium">{formatMoeda(c.totalMes)}</td>
                </tr>
              ))}
              {contratosNoMes.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-gray-400">
                    Nenhum custo neste mês para os contratos que você acompanha.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-3">
          {contratosNoMes.map((c) => (
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
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm font-semibold">{formatMoeda(c.totalMes)}</span>
                  <span className="text-gray-400">{expandido === c.codccu ? "▲" : "▼"}</span>
                </div>
              </button>

              {expandido === c.codccu && (
                <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">
                    Custo por conta financeira — {formatMesAno(mesSel)}
                  </p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-gray-500">
                        <tr>
                          <th className="py-1 pr-4">Conta financeira</th>
                          <th className="py-1 text-right">Valor no mês</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.contasMes.map((conta) => (
                          <tr key={conta.contaFinanceira} className="border-t border-gray-100">
                            <td className="py-1.5 pr-4">{conta.contaFinanceira}</td>
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
          {contratosNoMes.length === 0 && (
            <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
              Nenhum custo neste mês para os contratos que você acompanha.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
