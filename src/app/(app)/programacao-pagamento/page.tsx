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
  dataPagamento: string | null;
  ccuNome: string | null;
};

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

// Semana atual (segunda a domingo), no fuso do navegador -- usada só pro
// filtro "Semana atual", comparando com o dia (sem hora) de cada título.
function semanaAtual() {
  const hoje = new Date();
  const diaSemana = hoje.getDay(); // 0=domingo
  const deltaSegunda = diaSemana === 0 ? -6 : 1 - diaSemana;
  const segunda = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + deltaSegunda);
  const domingo = new Date(segunda.getFullYear(), segunda.getMonth(), segunda.getDate() + 6);
  return { inicio: segunda, fim: domingo };
}

function dentroDaSemana(iso: string | null, inicio: Date, fim: Date) {
  if (!iso) return false;
  const d = new Date(iso);
  const dUTC = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return dUTC >= inicio && dUTC <= fim;
}

type Filtro = "semana" | "aberto" | "pagos" | "todos";

const ABAS: [Filtro, string][] = [
  ["semana", "Semana atual"],
  ["aberto", "Em aberto"],
  ["pagos", "Histórico (pagos)"],
  ["todos", "Todos"],
];

export default function ProgramacaoPagamentoPage() {
  const [titulos, setTitulos] = useState<Titulo[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("semana");
  const [totalAberto, setTotalAberto] = useState(0);
  const [qtdAberto, setQtdAberto] = useState(0);
  const [qtdPagos, setQtdPagos] = useState(0);
  const [totalPago, setTotalPago] = useState(0);

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
        setQtdPagos(data.qtdPagos ?? 0);
        setTotalPago(data.totalPago ?? 0);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  const { inicio: inicioSemana, fim: fimSemana } = useMemo(() => semanaAtual(), []);

  const qtdSemana = useMemo(
    () => titulos.filter((t) => !t.pago && dentroDaSemana(t.vencimentoProgramado, inicioSemana, fimSemana)).length,
    [titulos, inicioSemana, fimSemana]
  );

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return titulos
      .filter((t) => {
        if (filtro === "semana") return !t.pago && dentroDaSemana(t.vencimentoProgramado, inicioSemana, fimSemana);
        if (filtro === "aberto") return !t.pago;
        if (filtro === "pagos") return t.pago;
        return true;
      })
      .filter((t) => !termo || t.numTit.toLowerCase().includes(termo) || t.fornecedorNome.toLowerCase().includes(termo))
      .sort((a, b) => {
        if (filtro === "semana") return (a.vencimentoProgramado || "").localeCompare(b.vencimentoProgramado || "");
        if (filtro === "pagos") return (b.dataPagamento || "").localeCompare(a.dataPagamento || ""); // pago mais recente primeiro
        return (b.dataEmissao || "").localeCompare(a.dataEmissao || ""); // aberto/todos: criado mais recente primeiro
      });
  }, [titulos, busca, filtro, inicioSemana, fimSemana]);

  // "Pagos"/"Todos" podem ter milhares de linhas -- renderiza só as N mais
  // relevantes por vez (a busca ainda filtra sobre o conjunto inteiro).
  const LIMITE_LINHAS = 500;
  const totalFiltrado = filtrados.length;
  const filtradosMostrados = filtrados.slice(0, LIMITE_LINHAS);
  const mostrarColunaPagamento = filtro === "pagos" || filtro === "todos";

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Programação de Pagamento</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Contas a pagar por título (2026), sincronizado do Senior — o que vence esta semana, o que segue em aberto
            e o histórico de pagos.
          </p>
        </div>
        <span className="mt-1 shrink-0 text-right text-[11px] leading-tight text-gray-400">
          Sem vínculo de OC no Senior nesta base
          <br />— comparação com Aprovações OC é manual, por fornecedor/valor.
        </span>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
          {ABAS.map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFiltro(v)}
              className={`px-3 py-1.5 whitespace-nowrap transition-colors ${
                filtro === v ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {label}
              {v === "semana" ? ` (${qtdSemana})` : ""}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          {filtro === "semana" && (
            <span className="text-xs text-gray-400">
              {formatData(inicioSemana.toISOString())} – {formatData(fimSemana.toISOString())}
            </span>
          )}
          <input
            type="text"
            placeholder="Buscar título ou fornecedor..."
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            className="w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Vence esta semana</p>
          <p className="text-xl font-semibold tabular-nums">{qtdSemana}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Em aberto</p>
          <p className="text-xl font-semibold tabular-nums">
            {qtdAberto} <span className="text-sm font-normal text-gray-400">· {formatMoeda(totalAberto)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Pagos (histórico 2026)</p>
          <p className="text-xl font-semibold tabular-nums">
            {qtdPagos} <span className="text-sm font-normal text-gray-400">· {formatMoeda(totalPago)}</span>
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Mostrando</p>
          <p className="text-xl font-semibold tabular-nums">
            {filtradosMostrados.length}
            {totalFiltrado > LIMITE_LINHAS && <span className="text-sm font-normal text-gray-400"> de {totalFiltrado}</span>}
          </p>
        </div>
      </div>

      {totalFiltrado > LIMITE_LINHAS && (
        <p className="mb-2 text-xs text-gray-400">
          {LIMITE_LINHAS} de {totalFiltrado} linhas — use a busca pra achar um título específico.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Título</th>
              <th className="px-3 py-2 font-medium">Criação</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Centro de custo</th>
              <th className="px-3 py-2 font-medium">Vencto programado</th>
              {mostrarColunaPagamento && <th className="px-3 py-2 font-medium">Pago em</th>}
              <th className="px-3 py-2 text-right font-medium">Valor original</th>
              <th className="px-3 py-2 text-right font-medium">Valor em aberto</th>
              <th className="px-3 py-2 font-medium">Situação</th>
            </tr>
          </thead>
          <tbody>
            {filtradosMostrados.map((t, i) => (
              <tr key={`${t.numTit}-${t.codFil}-${t.dataEmissao}`} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                <td className="px-3 py-1.5 font-medium text-gray-800">{t.numTit}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(t.dataEmissao)}</td>
                <td className="max-w-[200px] truncate px-3 py-1.5" title={t.fornecedorNome}>
                  {t.fornecedorNome}
                </td>
                <td className="px-3 py-1.5 text-gray-500">{t.ccuNome || "—"}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(t.vencimentoProgramado)}</td>
                {mostrarColunaPagamento && (
                  <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(t.dataPagamento)}</td>
                )}
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoeda(t.valorOriginal)}</td>
                <td className="px-3 py-1.5 text-right font-medium tabular-nums">{formatMoeda(t.valorAberto)}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      t.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                    }`}
                  >
                    {t.pago ? "Pago" : "Não pago"}
                  </span>
                </td>
              </tr>
            ))}
            {filtradosMostrados.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
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
