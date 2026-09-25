"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import MapaOC, { type Aprovacao, type TituloVinculado } from "@/components/MapaOC";

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

type OcRelacionada = { numOcp: string; situacao: string; situacaoLabel: string; parcela: boolean; motivo: string };
type LinhaDetalhe = {
  numTit: string;
  codFor: string;
  fornecedorNome: string;
  dataEntrada: string | null;
  dataVencimento: string | null;
  valorRateado: number;
  ocRelacionada: OcRelacionada | null;
  motivoSemOC: string | null;
  descricao: string | null;
  dataLancamento: string | null;
  lancadoPorNome: string | null;
  entradaManual: boolean | null;
};

type DetalheTitulo = {
  numTit: string;
  codFor: string;
  fornecedorNome: string;
  tipo: string | null;
  situacao: string | null;
  pago: boolean | null;
  dataPagamento: string | null;
  valorOriginalSenior: number | null;
  somaRateio: number;
  bateComSenior: boolean | null;
  descricao: string | null;
  dataLancamento: string | null;
  lancadoPorNome: string | null;
  entradaManual: boolean | null;
  ocRelacionada: OcRelacionada | null;
  motivoSemOC: string | null;
  ocEsperada: boolean;
  rateio: { codccu: string; contrato: string; contaFinanceira: string; competencia: string; valorRateado: number }[];
};

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function badgeOc(oc: OcRelacionada | null) {
  if (!oc) return <span className="text-gray-300">—</span>;
  const cor =
    oc.situacao === "APR"
      ? "bg-emerald-100 text-emerald-800"
      : oc.situacao === "REP" || oc.situacao === "CAN"
        ? "bg-red-100 text-red-700"
        : "bg-amber-100 text-amber-800";
  return (
    <span title={oc.motivo} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${cor}`}>
      OC {oc.numOcp} · {oc.situacaoLabel}
    </span>
  );
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

  // segundo nivel: qual conta financeira esta "explodida" mostrando o
  // detalhe titulo-a-titulo, e o cache do que ja foi buscado (chave
  // "codccu|contaFinanceira|competencia" -- pedido do Joao 15/09/2026)
  const [contaAberta, setContaAberta] = useState<string | null>(null);
  const [detalhes, setDetalhes] = useState<Record<string, { itens: LinhaDetalhe[]; total: number } | "carregando" | "erro">>({});

  // modal da OC (busca sob demanda, mesmo padrao da tela Aprovações OC)
  const [ocAberta, setOcAberta] = useState<{ aprovacao: Aprovacao; codToNome: Record<string, string>; titulosVinculados?: TituloVinculado[] } | "carregando" | null>(null);

  // modal do título: rateio completo entre todos os CCUs -- pedido do João
  // 15/09/2026 a partir de um caso real (título aparecia R$8,66 aqui mas
  // R$78,00 no Senior -- confirmado que é rateio entre 9 centros de custo).
  const [tituloAberto, setTituloAberto] = useState<DetalheTitulo | "carregando" | "erro" | null>(null);

  async function abrirTitulo(numTit: string, codFor: string, codccuOrigem: string) {
    setTituloAberto("carregando");
    try {
      const params = new URLSearchParams({ numTit, codFor, codccuOrigem });
      const res = await fetch(`/api/custos-conta/detalhe/titulo?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setTituloAberto(data);
    } catch {
      setTituloAberto("erro");
    }
  }

  async function toggleConta(codccu: string, contaFinanceira: string, competencia: string) {
    const chave = `${codccu}|${contaFinanceira}|${competencia}`;
    if (contaAberta === chave) {
      setContaAberta(null);
      return;
    }
    setContaAberta(chave);
    if (detalhes[chave]) return; // ja em cache
    setDetalhes((d) => ({ ...d, [chave]: "carregando" }));
    try {
      const params = new URLSearchParams({ codccu, contaFinanceira, competencia });
      const res = await fetch(`/api/custos-conta/detalhe?${params.toString()}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setDetalhes((d) => ({ ...d, [chave]: data }));
    } catch {
      setDetalhes((d) => ({ ...d, [chave]: "erro" }));
    }
  }

  async function abrirOC(numOcp: string) {
    setOcAberta("carregando");
    try {
      const res = await fetch(`/api/senior/aprovacoes/${numOcp}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOcAberta({ aprovacao: data.aprovacao ?? data, codToNome: data.codToNome ?? {}, titulosVinculados: data.titulosVinculados });
    } catch {
      setOcAberta(null);
      alert("Não foi possível carregar o mapa dessa OC.");
    }
  }

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
                  <p className="mb-2 text-[11px] text-gray-400">Clique numa conta pra ver os lançamentos e a OC de cada um.</p>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="text-left text-xs text-gray-500">
                        <tr>
                          <th className="py-1 pr-4">Conta financeira</th>
                          <th className="py-1 text-right">Valor no mês</th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.contasMes.map((conta) => {
                          const chave = `${c.codccu}|${conta.contaFinanceira}|${mesSel}`;
                          const aberta = contaAberta === chave;
                          const det = detalhes[chave];
                          return (
                            <Fragment key={conta.contaFinanceira}>
                              <tr
                                onClick={() => toggleConta(c.codccu, conta.contaFinanceira, mesSel)}
                                className="cursor-pointer border-t border-gray-100 hover:bg-gray-100/60"
                              >
                                <td className="py-1.5 pr-4">
                                  <span className="mr-1 inline-block w-3 text-gray-400">{aberta ? "▾" : "▸"}</span>
                                  {conta.contaFinanceira}
                                </td>
                                <td className="py-1.5 text-right font-medium">{formatMoeda(conta.total)}</td>
                              </tr>
                              {aberta && (
                                <tr className="border-t border-gray-100">
                                  <td colSpan={2} className="bg-white px-2 py-2">
                                    {det === "carregando" && <p className="text-xs text-gray-400">Carregando lançamentos...</p>}
                                    {det === "erro" && <p className="text-xs text-red-600">Não foi possível carregar os lançamentos.</p>}
                                    {det && det !== "carregando" && det !== "erro" && (
                                      <div className="overflow-x-auto rounded-lg border border-gray-100">
                                        <table className="w-full text-xs">
                                          <thead className="bg-gray-50 text-left uppercase text-gray-400">
                                            <tr>
                                              <th className="px-2 py-1.5">Título</th>
                                              <th className="px-2 py-1.5">Lançado no Senior</th>
                                              <th className="px-2 py-1.5">Fornecedor</th>
                                              <th className="px-2 py-1.5">Entrada</th>
                                              <th className="px-2 py-1.5 text-right">Valor</th>
                                              <th className="px-2 py-1.5">OC</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {det.itens.map((l, i) => (
                                              <tr key={`${l.numTit}-${l.codFor}-${i}`} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                                                <td className="px-2 py-1 font-medium">
                                                  <button
                                                    onClick={() => abrirTitulo(l.numTit, l.codFor, c.codccu)}
                                                    className="text-brand underline decoration-dotted underline-offset-2 hover:text-brand/80"
                                                    title="Clique pra ver o dossiê completo desse título: quem lançou, rateio e OC"
                                                  >
                                                    {l.numTit}
                                                  </button>
                                                </td>
                                                <td className="max-w-[150px] px-2 py-1 text-gray-500">
                                                  <button
                                                    onClick={() => abrirTitulo(l.numTit, l.codFor, c.codccu)}
                                                    className="underline decoration-dotted underline-offset-2 hover:text-brand"
                                                    title="Clique pra ver o dossiê completo desse título"
                                                  >
                                                    {l.lancadoPorNome || "—"}
                                                  </button>
                                                  {l.entradaManual !== null && (
                                                    <span
                                                      className={`ml-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                                                        l.entradaManual ? "bg-gray-100 text-gray-500" : "bg-sky-100 text-sky-700"
                                                      }`}
                                                    >
                                                      {l.entradaManual ? "manual" : "NF"}
                                                    </span>
                                                  )}
                                                </td>
                                                <td className="max-w-[220px] truncate px-2 py-1" title={l.fornecedorNome}>
                                                  {l.fornecedorNome}
                                                </td>
                                                <td className="px-2 py-1 tabular-nums text-gray-500">{formatData(l.dataEntrada)}</td>
                                                <td className="px-2 py-1 text-right tabular-nums">{formatMoeda(l.valorRateado)}</td>
                                                <td className="px-2 py-1">
                                                  {l.ocRelacionada ? (
                                                    <button onClick={() => abrirOC(l.ocRelacionada!.numOcp)} className="hover:underline">
                                                      {badgeOc(l.ocRelacionada)}
                                                    </button>
                                                  ) : (
                                                    <span
                                                      title={l.motivoSemOC ?? "Sem motivo de vínculo informado."}
                                                      className="cursor-help rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500 underline decoration-dotted underline-offset-2"
                                                    >
                                                      Sem OC
                                                    </span>
                                                  )}
                                                </td>
                                              </tr>
                                            ))}
                                            {det.itens.length === 0 && (
                                              <tr>
                                                <td colSpan={6} className="px-2 py-3 text-center text-gray-400">
                                                  Nenhum lançamento encontrado.
                                                </td>
                                              </tr>
                                            )}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          ))}
          {ocAberta === "carregando" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
              <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-600 shadow-lg">Carregando OC...</div>
            </div>
          )}
          {ocAberta && ocAberta !== "carregando" && (
            <MapaOC
              aprovacao={ocAberta.aprovacao}
              codToNome={ocAberta.codToNome}
              titulosVinculados={ocAberta.titulosVinculados}
              onClose={() => setOcAberta(null)}
              onAtualizado={() => abrirOC(ocAberta.aprovacao.numOcp)}
            />
          )}
          {tituloAberto === "carregando" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
              <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-600 shadow-lg">Carregando título...</div>
            </div>
          )}
          {tituloAberto === "erro" && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setTituloAberto(null)}>
              <div className="rounded-lg bg-white px-4 py-3 text-sm text-red-600 shadow-lg">Não foi possível carregar o rateio desse título.</div>
            </div>
          )}
          {tituloAberto && tituloAberto !== "carregando" && tituloAberto !== "erro" && (
            <div
              className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]"
              onClick={() => setTituloAberto(null)}
            >
              <div className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-brand/10 to-transparent px-6 py-4">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Título</p>
                    <p className="text-lg font-semibold">
                      {tituloAberto.numTit} <span className="text-sm font-normal text-gray-400">({tituloAberto.tipo ?? "—"})</span>
                    </p>
                  </div>
                  <button onClick={() => setTituloAberto(null)} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
                    ✕
                  </button>
                </div>

                <div className="space-y-5 px-6 py-5">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Valor original no Senior (E501TCP.VLRORI)</p>
                      <p className="text-xl font-semibold">
                        {tituloAberto.valorOriginalSenior !== null ? formatMoeda(tituloAberto.valorOriginalSenior) : "—"}
                      </p>
                    </div>
                    <div className="rounded-xl bg-gray-50 p-3">
                      <p className="text-xs text-gray-500">Soma do rateio ({tituloAberto.rateio.length} centro(s) de custo)</p>
                      <p className="text-xl font-semibold">{formatMoeda(tituloAberto.somaRateio)}</p>
                      {tituloAberto.bateComSenior !== null && (
                        <p className={`mt-0.5 text-xs font-medium ${tituloAberto.bateComSenior ? "text-emerald-600" : "text-rose-600"}`}>
                          {tituloAberto.bateComSenior ? "✓ bate com o Senior" : "✗ NÃO bate com o Senior"}
                        </p>
                      )}
                    </div>
                  </div>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <div>
                      <dt className="text-xs text-gray-500">Fornecedor</dt>
                      <dd className="font-medium">{tituloAberto.fornecedorNome}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-gray-500">Pagamento</dt>
                      <dd>
                        {tituloAberto.pago === null ? (
                          "—"
                        ) : (
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                              tituloAberto.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {tituloAberto.pago ? `Pago em ${formatData(tituloAberto.dataPagamento)}` : "Não pago"}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div className="col-span-2">
                      <dt className="text-xs text-gray-500">Lançado no Senior</dt>
                      <dd className="font-medium">
                        {tituloAberto.lancadoPorNome || "usuário não identificado"}
                        {tituloAberto.dataLancamento ? ` em ${formatData(tituloAberto.dataLancamento)}` : ""}
                        {" · "}
                        {tituloAberto.entradaManual === null ? "origem não verificada" : tituloAberto.entradaManual ? "lançamento manual" : "gerado automaticamente (NF vinculada)"}
                      </dd>
                    </div>
                  </dl>

                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Ordem de compra</p>
                    {tituloAberto.ocRelacionada ? (
                      <button
                        onClick={() => {
                          const numOcp = tituloAberto.ocRelacionada!.numOcp;
                          setTituloAberto(null);
                          abrirOC(numOcp);
                        }}
                        className="hover:underline"
                      >
                        {badgeOc(tituloAberto.ocRelacionada)}
                      </button>
                    ) : (
                      <div className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                        <p className="font-medium">Sem OC vinculada</p>
                        <p className="mt-0.5 text-amber-800">
                          {tituloAberto.motivoSemOC ||
                            (tituloAberto.ocEsperada
                              ? "Não encontramos nenhuma OC que referencie este título — vale investigar no Senior."
                              : "Por natureza deste tipo de lançamento, não se espera uma OC por trás.")}
                        </p>
                      </div>
                    )}
                  </div>

                  {tituloAberto.descricao && (
                    <div>
                      <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Descrição (E501TCP.OBSTCP)</p>
                      <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{tituloAberto.descricao}</p>
                    </div>
                  )}

                  <div>
                    <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Rateio entre centros de custo (rito_financeiro.composicao_custo_financeiro)
                    </p>
                    <div className="overflow-hidden rounded-xl border border-gray-100">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 text-left text-xs uppercase text-gray-400">
                          <tr>
                            <th className="px-3 py-1.5">Centro de custo</th>
                            <th className="px-3 py-1.5">Conta financeira</th>
                            <th className="px-3 py-1.5 text-right">Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tituloAberto.rateio.map((r, i) => (
                            <tr key={`${r.codccu}-${i}`} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                              <td className="px-3 py-1.5">
                                {r.contrato} <span className="text-xs text-gray-400">CCU {r.codccu}</span>
                              </td>
                              <td className="px-3 py-1.5 text-gray-500">{r.contaFinanceira}</td>
                              <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatMoeda(r.valorRateado)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
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
