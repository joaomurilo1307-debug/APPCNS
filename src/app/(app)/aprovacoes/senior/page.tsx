"use client";

import { useEffect, useState } from "react";

type Evento = {
  id: string;
  situacao: string;
  nivel: number | null;
  observacao: string | null;
  detectadoEm: string;
};

type Aprovacao = {
  id: string;
  numOcp: string;
  dataEmissao: string;
  fornecedorCodigo: string;
  fornecedorNome: string | null;
  valor: number;
  descricao: string | null;
  contratoTexto: string | null;
  codccu: string | null;
  situacaoAtual: string;
  nivelAtual: number;
  temRateio: boolean;
  primeiraDeteccaoEm: string;
  resolvidoEm: string | null;
  resolvidoComo: string | null;
  eventos: Evento[];
};

const situacaoLabel: Record<string, string> = {
  ANA: "Em Análise",
  PRE: "Pré-aprovado",
  APR: "Aprovado",
  REP: "Reprovado",
  CAN: "Cancelado",
};

const situacaoStyle: Record<string, string> = {
  ANA: "bg-yellow-100 text-yellow-700",
  PRE: "bg-blue-100 text-blue-700",
  APR: "bg-green-100 text-green-700",
  REP: "bg-red-100 text-red-700",
  CAN: "bg-gray-100 text-gray-500",
};

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diasParado(dataEmissao: string) {
  const dias = Math.floor((Date.now() - new Date(dataEmissao).getTime()) / (1000 * 60 * 60 * 24));
  return dias;
}

export default function AprovacoesSeniorPage() {
  const [pendentes, setPendentes] = useState<Aprovacao[]>([]);
  const [resolvidas, setResolvidas] = useState<Aprovacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/senior/aprovacoes")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar");
        }
        return res.json();
      })
      .then((data) => {
        setPendentes(data.pendentes);
        setResolvidas(data.resolvidasRecentes);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  const valorTotalPendente = pendentes.reduce((s, a) => s + a.valor, 0);

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Aprovações — Ordens de Compra (Senior)</h1>
      <p className="mb-6 text-sm text-gray-500">
        Sincronizado automaticamente do Senior. Mostra ordens de compra aguardando aprovação (multinível) e o
        histórico de decisões, para alimentar o relatório de eficiência dos aprovadores.
      </p>

      <div className="mb-6 grid grid-cols-3 gap-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pendentes agora</p>
          <p className="text-2xl font-semibold">{pendentes.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Valor total parado</p>
          <p className="text-2xl font-semibold">{formatMoeda(valorTotalPendente)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Resolvidas recentemente</p>
          <p className="text-2xl font-semibold">{resolvidas.length}</p>
        </div>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Pendentes</h2>
      <div className="mb-8 overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">OC</th>
              <th className="px-4 py-2">Emissão</th>
              <th className="px-4 py-2">Fornecedor</th>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2">Contrato / CC</th>
              <th className="px-4 py-2">Situação</th>
              <th className="px-4 py-2">Dias parado</th>
              <th className="px-4 py-2">Rateio</th>
            </tr>
          </thead>
          <tbody>
            {pendentes.map((a) => (
              <>
                <tr
                  key={a.id}
                  className="cursor-pointer border-t border-gray-50 hover:bg-gray-50"
                  onClick={() => setExpandido(expandido === a.id ? null : a.id)}
                >
                  <td className="px-4 py-2 font-medium">{a.numOcp}</td>
                  <td className="px-4 py-2">{new Date(a.dataEmissao).toLocaleDateString("pt-BR")}</td>
                  <td className="px-4 py-2">{a.fornecedorNome || a.fornecedorCodigo}</td>
                  <td className="px-4 py-2">{formatMoeda(a.valor)}</td>
                  <td className="px-4 py-2 text-xs text-gray-600">{a.contratoTexto || a.codccu || "—"}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${situacaoStyle[a.situacaoAtual]}`}>
                      {situacaoLabel[a.situacaoAtual] || a.situacaoAtual} · nível {a.nivelAtual}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={diasParado(a.dataEmissao) > 7 ? "font-semibold text-red-600" : ""}>
                      {diasParado(a.dataEmissao)}d
                    </span>
                  </td>
                  <td className="px-4 py-2">{a.temRateio ? "Sim" : "—"}</td>
                </tr>
                {expandido === a.id && (
                  <tr className="border-t border-gray-50 bg-gray-50/50">
                    <td colSpan={8} className="px-4 py-3">
                      <p className="mb-2 text-xs text-gray-600">{a.descricao}</p>
                      <p className="mb-1 text-xs font-semibold text-gray-500">Histórico de níveis:</p>
                      <ul className="space-y-1 text-xs text-gray-600">
                        {a.eventos.map((e) => (
                          <li key={e.id}>
                            {new Date(e.detectadoEm).toLocaleString("pt-BR")} — nível {e.nivel ?? "?"} —{" "}
                            <span className={situacaoStyle[e.situacao]}>{situacaoLabel[e.situacao] || e.situacao}</span>
                            {e.observacao ? ` (${e.observacao})` : ""}
                          </li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                )}
              </>
            ))}
            {pendentes.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma OC pendente de aprovação no momento.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">Resolvidas recentemente</h2>
      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">OC</th>
              <th className="px-4 py-2">Fornecedor</th>
              <th className="px-4 py-2">Valor</th>
              <th className="px-4 py-2">Resultado</th>
              <th className="px-4 py-2">Detectada em</th>
              <th className="px-4 py-2">Resolvida em</th>
              <th className="px-4 py-2">Tempo até decisão</th>
            </tr>
          </thead>
          <tbody>
            {resolvidas.map((a) => {
              const dias = a.resolvidoEm
                ? Math.floor((new Date(a.resolvidoEm).getTime() - new Date(a.primeiraDeteccaoEm).getTime()) / 86400000)
                : null;
              return (
                <tr key={a.id} className="border-t border-gray-50">
                  <td className="px-4 py-2 font-medium">{a.numOcp}</td>
                  <td className="px-4 py-2">{a.fornecedorNome || a.fornecedorCodigo}</td>
                  <td className="px-4 py-2">{formatMoeda(a.valor)}</td>
                  <td className="px-4 py-2">
                    <span className={`rounded-full px-2 py-1 text-xs font-medium ${situacaoStyle[a.resolvidoComo || ""]}`}>
                      {situacaoLabel[a.resolvidoComo || ""] || a.resolvidoComo}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {new Date(a.primeiraDeteccaoEm).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {a.resolvidoEm ? new Date(a.resolvidoEm).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="px-4 py-2">{dias !== null ? `${dias}d` : "—"}</td>
                </tr>
              );
            })}
            {resolvidas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  Nenhuma resolução registrada ainda.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
