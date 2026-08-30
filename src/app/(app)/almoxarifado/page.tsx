"use client";

import { useEffect, useState } from "react";

type DashboardData = {
  totalContratos: number;
  colaboradoresAtivos: number;
  totalItensMonitorados: number;
  itensAbaixoMinimo: number;
  necessidadeTotalCompra: number;
  porContrato: { contrato: { id: string; codigo: string; nome: string | null }; totalItens: number; abaixoMinimo: number }[];
  porTipo: Record<string, { total: number; abaixoMinimo: number }>;
  criticos: { produto: string; contrato: string; estoqueAtual: number; estoqueMinimo: number; necessidade: number }[];
  ultimasMovimentacoes: {
    id: string;
    tipo: "ENTRADA" | "SAIDA";
    quantidade: number;
    data: string;
    produto: { nome: string; unidade: string };
    contrato: { codigo: string } | null;
    colaborador: { nomeCompleto: string } | null;
  }[];
};

function KpiCard({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className={`absolute inset-x-0 top-0 h-1 ${accent}`} />
      <p className="text-3xl font-bold text-ink">{value}</p>
      <p className="mt-1 text-xs text-gray-500">{label}</p>
    </div>
  );
}

export default function AlmoxarifadoDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch("/api/epi/dashboard").then((r) => r.json()).then(setData).catch(() => {});
  }, []);

  if (!data) return <p className="text-sm text-gray-400">Carregando...</p>;

  const maxContratoItens = Math.max(1, ...data.porContrato.map((c) => c.totalItens));

  return (
    <div>
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Contratos monitorados" value={data.totalContratos} accent="bg-brand" />
        <KpiCard label="Colaboradores ativos" value={data.colaboradoresAtivos} accent="bg-brand-dark" />
        <KpiCard label="Itens abaixo do mínimo" value={data.itensAbaixoMinimo} accent="bg-accent" />
        <KpiCard label="Unidades a comprar (total)" value={data.necessidadeTotalCompra} accent="bg-accent-dark" />
      </div>

      <div className="mb-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Itens monitorados por contrato</h2>
          <div className="space-y-3">
            {data.porContrato.map((c) => (
              <div key={c.contrato.id}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="font-medium text-gray-700">
                    {c.contrato.codigo} {c.contrato.nome ? `— ${c.contrato.nome}` : ""}
                  </span>
                  <span className="text-gray-400">
                    {c.totalItens} itens{c.abaixoMinimo > 0 && <span className="ml-1 text-accent">· {c.abaixoMinimo} abaixo do mínimo</span>}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-brand to-brand-dark"
                    style={{ width: `${Math.max(4, (c.totalItens / maxContratoItens) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {data.porContrato.length === 0 && <p className="text-sm text-gray-400">Nenhum contrato importado ainda.</p>}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Distribuição por tipo</h2>
          <div className="space-y-3">
            {Object.entries(data.porTipo).map(([tipo, v]) => (
              <div key={tipo} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-3">
                <span className="text-sm font-medium text-gray-700">{tipo}</span>
                <span className="text-xs text-gray-400">
                  {v.total} itens {v.abaixoMinimo > 0 && <span className="text-accent">· {v.abaixoMinimo} abaixo do mínimo</span>}
                </span>
              </div>
            ))}
            {Object.keys(data.porTipo).length === 0 && <p className="text-sm text-gray-400">Sem dados ainda.</p>}
          </div>
        </div>
      </div>

      <div className="mb-6 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">🔴 Itens críticos — o que comprar agora</h2>
        {data.criticos.length === 0 ? (
          <p className="text-sm text-gray-400">Nenhum item abaixo do mínimo. 🎉</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="pb-2">Produto</th>
                  <th className="pb-2">Contrato</th>
                  <th className="pb-2 text-right">Atual</th>
                  <th className="pb-2 text-right">Mínimo</th>
                  <th className="pb-2 text-right">Comprar</th>
                </tr>
              </thead>
              <tbody>
                {data.criticos.map((c, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="py-2 font-medium text-gray-700">{c.produto}</td>
                    <td className="py-2 text-gray-500">{c.contrato}</td>
                    <td className="py-2 text-right text-gray-500">{c.estoqueAtual}</td>
                    <td className="py-2 text-right text-gray-500">{c.estoqueMinimo}</td>
                    <td className="py-2 text-right font-semibold text-accent">{c.necessidade}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 text-sm font-semibold text-gray-700">Últimas movimentações</h2>
        <div className="space-y-2">
          {data.ultimasMovimentacoes.map((m) => (
            <div key={m.id} className="flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    m.tipo === "ENTRADA" ? "bg-brand-light text-brand-dark" : "bg-rose-50 text-rose-600"
                  }`}
                >
                  {m.tipo === "ENTRADA" ? "Entrada" : "Saída"}
                </span>
                <span className="font-medium text-gray-700">{m.produto.nome}</span>
                <span className="text-gray-400">× {m.quantidade}</span>
              </div>
              <div className="text-xs text-gray-400">
                {m.contrato?.codigo ?? "Geral"}
                {m.colaborador && ` · ${m.colaborador.nomeCompleto}`} · {new Date(m.data).toLocaleDateString("pt-BR")}
              </div>
            </div>
          ))}
          {data.ultimasMovimentacoes.length === 0 && <p className="text-sm text-gray-400">Nenhuma movimentação registrada ainda.</p>}
        </div>
      </div>
    </div>
  );
}
