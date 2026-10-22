"use client";

// Gaveta com os lancamentos (titulo a titulo) por tras de UMA celula conta x mes, com a OC de cada titulo, e os dois
// modais ja existentes (dossie do titulo com rateio completo; mapa da OC). Mesmas rotas e mesma logica de antes
// (/api/custos-conta/detalhe, /detalhe/titulo, /api/senior/aprovacoes/[numOcp]) -- so' mudou o lugar onde aparece.

import { useEffect, useMemo, useState } from "react";
import MapaOC, { type Aprovacao, type TituloVinculado } from "@/components/MapaOC";
import { formatData, mesLongo, moeda } from "@/lib/custos/formato";

export type AlvoDetalhe = { codccu: string; contrato: string; conta: string; competencia: string; valor: number; reembolsavel?: boolean; base?: "pagamento" | "competencia" };

type OcRelacionada = { numOcp: string; situacao: string; situacaoLabel: string; parcela: boolean; motivo: string };
type LinhaDetalhe = {
  numTit: string;
  codFor: string;
  fornecedorNome: string;
  dataEntrada: string | null;
  dataVencimento: string | null;
  valorRateado: number;
  baixa: string | null; // PAGAMENTO | ADIANTAMENTO
  dataPagamento: string | null;
  mesPagamento: string;
  competenciaNota: string | null;
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

function badgeOc(oc: OcRelacionada | null) {
  if (!oc) return <span className="text-gray-300">—</span>;
  const cor =
    oc.situacao === "APR" ? "bg-emerald-100 text-emerald-800" : oc.situacao === "REP" || oc.situacao === "CAN" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800";
  return (
    <span title={oc.motivo} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${cor}`}>
      OC {oc.numOcp} · {oc.situacaoLabel}
    </span>
  );
}

export default function DetalheConta({ alvo, onFechar }: { alvo: AlvoDetalhe | null; onFechar: () => void }) {
  const [dados, setDados] = useState<{ itens: LinhaDetalhe[]; total: number } | "carregando" | "erro">("carregando");
  const [busca, setBusca] = useState("");
  const [ordem, setOrdem] = useState<"valor" | "data" | "fornecedor">("valor");
  const [ocAberta, setOcAberta] = useState<{ aprovacao: Aprovacao; codToNome: Record<string, string>; titulosVinculados?: TituloVinculado[]; semDadosDePagamento?: boolean } | "carregando" | null>(null);
  const [tituloAberto, setTituloAberto] = useState<DetalheTitulo | "carregando" | "erro" | null>(null);

  useEffect(() => {
    if (!alvo) return;
    setDados("carregando");
    setBusca("");
    let cancelado = false;
    const params = new URLSearchParams({ codccu: alvo.codccu, contaFinanceira: alvo.conta, competencia: alvo.competencia, base: alvo.base ?? "pagamento" });
    fetch(`/api/custos-conta/detalhe?${params.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelado && setDados(d))
      .catch(() => !cancelado && setDados("erro"));
    return () => {
      cancelado = true;
    };
  }, [alvo]);

  useEffect(() => {
    if (!alvo) return;
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !ocAberta && !tituloAberto) onFechar();
    };
    window.addEventListener("keydown", aoTeclar);
    return () => window.removeEventListener("keydown", aoTeclar);
  }, [alvo, onFechar, ocAberta, tituloAberto]);

  const itens = useMemo(() => {
    if (dados === "carregando" || dados === "erro") return [];
    const termo = busca.trim().toLowerCase();
    const lista = dados.itens.filter((l) => !termo || l.fornecedorNome.toLowerCase().includes(termo) || l.numTit.toLowerCase().includes(termo) || (l.lancadoPorNome ?? "").toLowerCase().includes(termo));
    return [...lista].sort((a, b) => {
      if (ordem === "fornecedor") return a.fornecedorNome.localeCompare(b.fornecedorNome, "pt-BR");
      if (ordem === "data") return (b.dataEntrada ?? "").localeCompare(a.dataEntrada ?? "");
      return b.valorRateado - a.valorRateado;
    });
  }, [dados, busca, ordem]);

  async function abrirOC(numOcp: string) {
    setOcAberta("carregando");
    try {
      const res = await fetch(`/api/senior/aprovacoes/${numOcp}`);
      if (!res.ok) throw new Error();
      const data = await res.json();
      setOcAberta({ aprovacao: data.aprovacao ?? data, codToNome: data.codToNome ?? {}, titulosVinculados: data.titulosVinculados, semDadosDePagamento: !!data.semDadosDePagamento });
    } catch {
      setOcAberta(null);
      alert("Não foi possível carregar o mapa dessa OC.");
    }
  }

  async function abrirTitulo(numTit: string, codFor: string) {
    if (!alvo) return;
    setTituloAberto("carregando");
    try {
      const params = new URLSearchParams({ numTit, codFor, codccuOrigem: alvo.codccu });
      const res = await fetch(`/api/custos-conta/detalhe/titulo?${params.toString()}`);
      if (!res.ok) throw new Error();
      setTituloAberto(await res.json());
    } catch {
      setTituloAberto("erro");
    }
  }

  if (!alvo) return null;
  const somaItens = dados !== "carregando" && dados !== "erro" ? dados.itens.reduce((s, l) => s + l.valorRateado, 0) : 0;
  const bate = dados !== "carregando" && dados !== "erro" ? Math.abs(somaItens - alvo.valor) < 0.02 : null;

  return (
    <>
      <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/35 backdrop-blur-[1.5px]" onClick={onFechar}>
        <aside role="dialog" aria-modal="true" aria-label="Lançamentos da conta" className="flex h-full w-full max-w-3xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
          <header className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-brand/10 to-transparent px-6 py-4">
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                Lançamentos · {alvo.base === "competencia" ? "competência" : "pagos em"} {mesLongo(alvo.competencia.slice(0, 7))}
              </p>
              <h2 className="mt-0.5 flex flex-wrap items-center gap-2 text-lg font-semibold text-gray-900">
                {alvo.conta}
                {alvo.reembolsavel && <span className="rounded-full bg-sky-100 px-2 py-0.5 text-xs font-medium text-sky-800">Reembolsável</span>}
              </h2>
              <p className="truncate text-sm text-gray-500">
                {alvo.contrato} <span className="text-gray-400">· CCU {alvo.codccu}</span>
              </p>
            </div>
            <button onClick={onFechar} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600" aria-label="Fechar">
              ✕
            </button>
          </header>

          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-gray-100 px-6 py-3">
            <div>
              <p className="text-xs text-gray-500">Valor da célula</p>
              <p className="text-xl font-semibold tabular-nums text-gray-900">{moeda(alvo.valor)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Lançamentos</p>
              <p className="text-xl font-semibold tabular-nums text-gray-900">{dados === "carregando" || dados === "erro" ? "—" : dados.itens.length}</p>
            </div>
            {bate !== null && (
              <p className={`rounded-full px-2.5 py-1 text-xs font-medium ${bate ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"}`}>
                {bate ? "✓ a soma dos lançamentos fecha com a célula" : `✗ soma dos lançamentos ${moeda(somaItens)} ≠ célula — atualize os dados`}
              </p>
            )}
            <div className="ml-auto flex items-center gap-2">
              <input
                type="text"
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar fornecedor ou título…"
                className="w-52 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
              />
              <select value={ordem} onChange={(e) => setOrdem(e.target.value as typeof ordem)} className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-brand focus:outline-none" aria-label="Ordenar">
                <option value="valor">Maior valor</option>
                <option value="data">Mais recente</option>
                <option value="fornecedor">Fornecedor (A–Z)</option>
              </select>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {dados === "carregando" && <p className="py-10 text-center text-sm text-gray-400">Carregando lançamentos…</p>}
            {dados === "erro" && <p className="py-10 text-center text-sm text-red-600">Não foi possível carregar os lançamentos. Tente atualizar a tela.</p>}
            {dados !== "carregando" && dados !== "erro" && (
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-[13px]">
                  <thead className="bg-gray-50 text-left uppercase text-gray-400">
                    <tr>
                      <th className="px-3 py-2">Título</th>
                      <th className="px-3 py-2">Lançado no Senior</th>
                      <th className="px-3 py-2">Fornecedor</th>
                      <th className="px-3 py-2">Pago em</th>
                      <th className="px-3 py-2">Competência</th>
                      <th className="px-3 py-2 text-right">Valor</th>
                      <th className="px-3 py-2">OC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {itens.map((l, i) => (
                      <tr key={`${l.numTit}-${l.codFor}-${i}`} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                        <td className="px-3 py-1.5 font-medium">
                          <button onClick={() => abrirTitulo(l.numTit, l.codFor)} className="text-brand underline decoration-dotted underline-offset-2 hover:text-brand/80" title="Dossiê completo do título: quem lançou, rateio e OC">
                            {l.numTit}
                          </button>
                        </td>
                        <td className="max-w-[150px] px-3 py-1.5 text-gray-500">
                          <button onClick={() => abrirTitulo(l.numTit, l.codFor)} className="underline decoration-dotted underline-offset-2 hover:text-brand" title="Dossiê completo do título">
                            {l.lancadoPorNome || "—"}
                          </button>
                          {l.entradaManual !== null && (
                            <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs font-medium ${l.entradaManual ? "bg-gray-100 text-gray-500" : "bg-sky-100 text-sky-700"}`}>{l.entradaManual ? "manual" : "NF"}</span>
                          )}
                        </td>
                        <td className="max-w-[220px] truncate px-3 py-1.5" title={l.fornecedorNome}>
                          {l.fornecedorNome}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-600">
                          {l.dataPagamento ? formatData(l.dataPagamento) : mesLongo(l.mesPagamento.slice(0, 7)).replace(" de ", " ")}
                          {l.baixa === "ADIANTAMENTO" && (
                            <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800" title="Nota quitada com um adiantamento já dado ao fornecedor (transação 90558)">
                              adiantamento
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-1.5 text-gray-600">{l.competenciaNota ? mesLongo(l.competenciaNota.slice(0, 7)).replace(" de ", " ") : "—"}</td>
                        <td className="px-3 py-1.5 text-right font-medium tabular-nums">{moeda(l.valorRateado)}</td>
                        <td className="px-3 py-1.5">
                          {l.ocRelacionada ? (
                            <button onClick={() => abrirOC(l.ocRelacionada!.numOcp)} className="hover:underline">
                              {badgeOc(l.ocRelacionada)}
                            </button>
                          ) : (
                            <span title={l.motivoSemOC ?? "Sem motivo de vínculo informado."} className="cursor-help rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500 underline decoration-dotted underline-offset-2">
                              Sem OC
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {itens.length === 0 && (
                      <tr>
                        <td colSpan={7} className="px-3 py-6 text-center text-gray-400">
                          Nenhum lançamento encontrado.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </aside>
      </div>

      {ocAberta === "carregando" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="rounded-lg bg-white px-4 py-3 text-sm text-gray-600 shadow-lg">Carregando OC...</div>
        </div>
      )}
      {ocAberta && ocAberta !== "carregando" && (
        <MapaOC aprovacao={ocAberta.aprovacao} codToNome={ocAberta.codToNome} titulosVinculados={ocAberta.titulosVinculados} semDadosDePagamento={ocAberta.semDadosDePagamento} onClose={() => setOcAberta(null)} onAtualizado={() => abrirOC(ocAberta.aprovacao.numOcp)} />
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
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]" onClick={() => setTituloAberto(null)}>
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
                  <p className="text-xl font-semibold">{tituloAberto.valorOriginalSenior !== null ? moeda(tituloAberto.valorOriginalSenior) : "—"}</p>
                </div>
                <div className="rounded-xl bg-gray-50 p-3">
                  <p className="text-xs text-gray-500">Soma do rateio ({tituloAberto.rateio.length} centro(s) de custo)</p>
                  <p className="text-xl font-semibold">{moeda(tituloAberto.somaRateio)}</p>
                  {tituloAberto.bateComSenior !== null && (
                    <p className={`mt-0.5 text-xs font-medium ${tituloAberto.bateComSenior ? "text-emerald-600" : "text-rose-600"}`}>{tituloAberto.bateComSenior ? "✓ bate com o Senior" : "✗ NÃO bate com o Senior"}</p>
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
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${tituloAberto.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
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
                        (tituloAberto.ocEsperada ? "Não encontramos nenhuma OC que referencie este título — vale investigar no Senior." : "Por natureza deste tipo de lançamento, não se espera uma OC por trás.")}
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
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Rateio entre centros de custo (pagamentos já baixados no Senior)</p>
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
                          <td className="px-3 py-1.5 text-right font-medium tabular-nums">{moeda(r.valorRateado)}</td>
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
    </>
  );
}
