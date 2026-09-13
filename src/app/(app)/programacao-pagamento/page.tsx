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
  numOcp: string | null;
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
        const da = (filtro === "pagos" ? a.dataPagamento : a.vencimentoProgramado) || "";
        const db = (filtro === "pagos" ? b.dataPagamento : b.vencimentoProgramado) || "";
        return filtro === "pagos" ? db.localeCompare(da) : da.localeCompare(db); // pagos: mais recente primeiro
      });
  }, [titulos, busca, filtro, inicioSemana, fimSemana]);

  // "Pagos"/"Todos" podem ter dezenas de milhares de linhas (histórico completo) --
  // renderiza só as N mais relevantes de cada vez (a busca ainda filtra sobre tudo).
  const LIMITE_LINHAS = 500;
  const totalFiltrado = filtrados.length;
  const filtradosMostrados = filtrados.slice(0, LIMITE_LINHAS);

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Programação de Pagamento</h1>
      <p className="mb-1 max-w-3xl text-sm text-gray-500">
        Contas a pagar por título, sincronizado do Senior (E501TCP): o que vence esta semana, tudo que ainda está em
        aberto (qualquer data) e o histórico do que já foi pago.
      </p>
      <p className="mb-5 max-w-3xl text-xs text-amber-700">
        O Senior não guarda o vínculo de qual Ordem de Compra originou cada título nesta base (campo sempre vazio,
        conferido) — não dá pra cruzar automaticamente com Aprovações OC; a comparação hoje é manual, por fornecedor e
        valor.
      </p>

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-500">Ver</label>
          <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-sm">
            {(
              [
                ["semana", `Semana atual (${qtdSemana})`],
                ["aberto", "Em aberto"],
                ["pagos", "Histórico (pagos)"],
                ["todos", "Todos"],
              ] as [Filtro, string][]
            ).map(([v, label]) => (
              <button
                key={v}
                onClick={() => setFiltro(v)}
                className={`px-3 py-2 whitespace-nowrap ${filtro === v ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <input
          type="text"
          placeholder="Buscar por título ou fornecedor..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
        {filtro === "semana" && (
          <span className="pb-2 text-xs text-gray-400">
            {formatData(inicioSemana.toISOString())} a {formatData(fimSemana.toISOString())}
          </span>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Vence esta semana</p>
          <p className="text-2xl font-semibold">{qtdSemana}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Em aberto (todas as datas)</p>
          <p className="text-2xl font-semibold">
            {qtdAberto} · {formatMoeda(totalAberto)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pagos no histórico</p>
          <p className="text-2xl font-semibold">
            {qtdPagos} · {formatMoeda(totalPago)}
          </p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Mostrando</p>
          <p className="text-2xl font-semibold">
            {filtradosMostrados.length}
            {totalFiltrado > LIMITE_LINHAS ? ` de ${totalFiltrado}` : ""}
          </p>
        </div>
      </div>

      {totalFiltrado > LIMITE_LINHAS && (
        <p className="mb-3 text-xs text-gray-400">
          Mostrando as {LIMITE_LINHAS} linhas mais {filtro === "pagos" ? "recentes" : "próximas do vencimento"} de{" "}
          {totalFiltrado} — use a busca pra achar um título específico.
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-2">Título</th>
              <th className="px-4 py-2">Fornecedor</th>
              <th className="px-4 py-2">Centro de custo</th>
              <th className="px-4 py-2">Vencto programado</th>
              {filtro === "pagos" || filtro === "todos" ? <th className="px-4 py-2">Pago em</th> : null}
              <th className="px-4 py-2 text-right">Valor original</th>
              <th className="px-4 py-2 text-right">Valor em aberto</th>
              <th className="px-4 py-2">Pago?</th>
            </tr>
          </thead>
          <tbody>
            {filtradosMostrados.map((t) => (
              <tr key={`${t.numTit}-${t.codFil}-${t.dataEmissao}`} className="border-t border-gray-50">
                <td className="px-4 py-2 font-medium">{t.numTit}</td>
                <td className="px-4 py-2 max-w-[220px] truncate" title={t.fornecedorNome}>
                  {t.fornecedorNome}
                </td>
                <td className="px-4 py-2 text-xs text-gray-500">{t.ccuNome || "—"}</td>
                <td className="px-4 py-2 text-xs text-gray-500">{formatData(t.vencimentoProgramado)}</td>
                {filtro === "pagos" || filtro === "todos" ? (
                  <td className="px-4 py-2 text-xs text-gray-500">{formatData(t.dataPagamento)}</td>
                ) : null}
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
