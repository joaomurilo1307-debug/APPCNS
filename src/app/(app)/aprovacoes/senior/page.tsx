"use client";

import { useEffect, useState } from "react";

type Evento = {
  id: string;
  situacao: string;
  nivel: number | null;
  observacao: string | null;
  detectadoEm: string;
};

type NivelHist = {
  SEQAPR?: string;
  NIVAPR?: string;
  USUAPR?: string;
  SITAPR?: string;
  CCUAPR?: string;
  DATAPR?: string;
};

type RateioItem = {
  codccu: string;
  ccuNome?: string;
  contaFinanceira?: string;
  perc?: number;
  valor?: number;
  nome?: string; // compat com formato antigo
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
  contratoNome: string | null;
  criadorCod: string | null;
  criadorNome: string | null;
  previsaoPagamento: string | null;
  pago: boolean;
  situacaoAtual: string;
  nivelAtual: number;
  temRateio: boolean;
  rateioDetalhe: string | null;
  mapaCotacao: string | null;
  historicoNiveis: string | null;
  proximoAprovadorCod: string | null;
  proximoAprovadorNome: string | null;
  proximoAprovador: { id: string; name: string } | null;
  primeiraDeteccaoEm: string;
  resolvidoEm: string | null;
  resolvidoComo: string | null;
  eventos: Evento[];
};

const situacaoLabel: Record<string, string> = {
  ANA: "Em análise",
  PRE: "Pré-aprovado",
  APR: "Aprovado",
  REP: "Reprovado",
  CAN: "Cancelado",
};

const situacaoStyle: Record<string, string> = {
  ANA: "bg-amber-100 text-amber-800",
  PRE: "bg-sky-100 text-sky-800",
  APR: "bg-emerald-100 text-emerald-800",
  REP: "bg-rose-100 text-rose-800",
  CAN: "bg-gray-100 text-gray-500",
};

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diasParado(dataEmissao: string) {
  return Math.floor((Date.now() - new Date(dataEmissao).getTime()) / 86400000);
}

function parseJSON<T>(s: string | null): T | null {
  if (!s) return null;
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

function contratoDe(a: Aprovacao) {
  // o texto "C/C:" que o comprador escreveu na OC e o que bate com a aba
  // Rateios do Senior; o nome do centros_custo entra so como apoio
  if (a.temRateio) return "Rateio (vários CC)";
  return a.contratoTexto || a.contratoNome || (a.codccu ? `CCU ${a.codccu}` : "—");
}

function aprovadorDe(a: Aprovacao) {
  return a.proximoAprovador?.name || a.proximoAprovadorNome || `Aguardando · nível ${a.nivelAtual}`;
}

function nomeUsuSenior(cod: string | undefined, codToNome: Record<string, string>) {
  if (!cod || cod === "0") return null;
  return codToNome[cod] || `Usuário Senior #${cod}`;
}

export default function AprovacoesSeniorPage() {
  const [pendentes, setPendentes] = useState<Aprovacao[]>([]);
  const [resolvidas, setResolvidas] = useState<Aprovacao[]>([]);
  const [codToNome, setCodToNome] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Aprovacao | null>(null);

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
        setCodToNome(data.codToNome ?? {});
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
      <p className="mb-6 max-w-3xl text-sm text-gray-500">
        Ordens de compra aguardando aprovação, sincronizadas do Senior. A lista mostra quem precisa aprovar e se há
        rateio; clique numa linha para ver o mapa completo da OC (fornecedor, valor, descrição, contratos do rateio,
        histórico de níveis e cotação).
      </p>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
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
        <table className="w-full min-w-[960px] border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <tr className="[&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
              <th>OC</th>
              <th>Situação</th>
              <th>Fornecedor</th>
              <th>Contrato / Centro de custo</th>
              <th className="text-right">Valor</th>
              <th>Quem falta aprovar</th>
              <th className="text-center">Rateio</th>
              <th className="text-center">Dias parada</th>
            </tr>
          </thead>
          <tbody>
            {pendentes.map((a) => (
              <tr
                key={a.id}
                className="cursor-pointer border-t border-gray-100 align-middle hover:bg-brand/[0.04] [&>td]:px-4 [&>td]:py-3"
                onClick={() => setAberta(a)}
              >
                <td className="whitespace-nowrap font-medium">{a.numOcp}</td>
                <td className="whitespace-nowrap">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle[a.situacaoAtual]}`}
                  >
                    {situacaoLabel[a.situacaoAtual] || a.situacaoAtual} · nível {a.nivelAtual}
                  </span>
                </td>
                <td className="max-w-[240px] truncate" title={a.fornecedorNome || a.fornecedorCodigo}>
                  {a.fornecedorNome || a.fornecedorCodigo}
                </td>
                <td className="max-w-[240px] truncate text-gray-600" title={contratoDe(a)}>
                  {contratoDe(a)}
                </td>
                <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatMoeda(a.valor)}</td>
                <td className="whitespace-nowrap">
                  <span className={a.proximoAprovador || a.proximoAprovadorNome ? "" : "text-gray-400"}>
                    {aprovadorDe(a)}
                  </span>
                </td>
                <td className="whitespace-nowrap text-center">
                  {a.temRateio ? (
                    <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-700">Sim</span>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap text-center">
                  <span className={diasParado(a.dataEmissao) > 7 ? "font-semibold text-rose-600" : "text-gray-500"}>
                    {diasParado(a.dataEmissao)} dias
                  </span>
                </td>
              </tr>
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
        <table className="w-full min-w-[880px] border-collapse text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold text-gray-500">
            <tr className="[&>th]:whitespace-nowrap [&>th]:px-4 [&>th]:py-3">
              <th>OC</th>
              <th>Fornecedor</th>
              <th className="text-right">Valor</th>
              <th>Resultado</th>
              <th>Detectada em</th>
              <th>Resolvida em</th>
              <th className="text-center">Tempo até decisão</th>
            </tr>
          </thead>
          <tbody>
            {resolvidas.map((a) => {
              const dias = a.resolvidoEm
                ? Math.floor((new Date(a.resolvidoEm).getTime() - new Date(a.primeiraDeteccaoEm).getTime()) / 86400000)
                : null;
              return (
                <tr
                  key={a.id}
                  className="cursor-pointer border-t border-gray-100 hover:bg-brand/[0.04] [&>td]:px-4 [&>td]:py-3"
                  onClick={() => setAberta(a)}
                >
                  <td className="whitespace-nowrap font-medium">{a.numOcp}</td>
                  <td className="max-w-[240px] truncate" title={a.fornecedorNome || a.fornecedorCodigo}>
                    {a.fornecedorNome || a.fornecedorCodigo}
                  </td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatMoeda(a.valor)}</td>
                  <td className="whitespace-nowrap">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle[a.resolvidoComo || ""]}`}
                    >
                      {situacaoLabel[a.resolvidoComo || ""] || a.resolvidoComo}
                    </span>
                  </td>
                  <td className="whitespace-nowrap text-xs text-gray-500">
                    {new Date(a.primeiraDeteccaoEm).toLocaleDateString("pt-BR")}
                  </td>
                  <td className="whitespace-nowrap text-xs text-gray-500">
                    {a.resolvidoEm ? new Date(a.resolvidoEm).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td className="whitespace-nowrap text-center">{dias !== null ? `${dias} dias` : "—"}</td>
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

      {aberta && <MapaOC aprovacao={aberta} codToNome={codToNome} onClose={() => setAberta(null)} />}
    </div>
  );
}

function MapaOC({
  aprovacao: a,
  codToNome,
  onClose,
}: {
  aprovacao: Aprovacao;
  codToNome: Record<string, string>;
  onClose: () => void;
}) {
  const niveis = parseJSON<NivelHist[]>(a.historicoNiveis) ?? [];
  const rateio = parseJSON<RateioItem[]>(a.rateioDetalhe) ?? [];
  const cotacao = parseJSON<any>(a.mapaCotacao);
  const nivelMax = niveis.reduce((m, n) => Math.max(m, Number(n.NIVAPR) || 0), 0);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-brand/10 to-transparent px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Ordem de compra</p>
            <p className="text-lg font-semibold">
              OC {a.numOcp}
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle[a.situacaoAtual]}`}
              >
                {situacaoLabel[a.situacaoAtual] || a.situacaoAtual} · nível {a.nivelAtual}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          {/* linha de topo: valor + quem falta */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Valor</p>
              <p className="text-xl font-semibold">{formatMoeda(a.valor)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Quem falta aprovar</p>
              <p className="text-sm font-semibold">{aprovadorDe(a)}</p>
              {!a.proximoAprovador && !a.proximoAprovadorNome && (
                <p className="mt-0.5 text-[11px] text-gray-400">
                  próximo aprovador definido pela alçada multinível do Senior
                </p>
              )}
            </div>
          </div>

          {/* fornecedor + contrato */}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">Fornecedor</dt>
              <dd className="font-medium">{a.fornecedorNome || "—"}</dd>
              <dd className="text-xs text-gray-400">código {a.fornecedorCodigo}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Centro de custo (da OC)</dt>
              <dd className="font-medium">{a.contratoTexto || a.contratoNome || "—"}</dd>
              {a.codccu && (
                <dd className="text-xs text-gray-400">
                  CC {a.codccu}
                  {a.contratoNome && a.contratoNome !== a.contratoTexto ? ` · ${a.contratoNome}` : ""}
                </dd>
              )}
            </div>
            <div>
              <dt className="text-xs text-gray-500">Criada por</dt>
              <dd className="font-medium">{a.criadorNome || (a.criadorCod ? `Usuário Senior #${a.criadorCod}` : "—")}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Pagamento</dt>
              <dd>
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                    a.pago ? "bg-emerald-100 text-emerald-800" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {a.pago ? "Pago" : "Não pago"}
                </span>
                {a.previsaoPagamento && (
                  <span className="ml-2 text-xs text-gray-500">
                    previsão {new Date(a.previsaoPagamento).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Emissão</dt>
              <dd>{new Date(a.dataEmissao).toLocaleDateString("pt-BR")}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">Parada há</dt>
              <dd className={diasParado(a.dataEmissao) > 7 ? "font-semibold text-rose-600" : ""}>
                {diasParado(a.dataEmissao)} dias
              </dd>
            </div>
          </dl>

          {/* descricao */}
          {a.descricao && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Descrição</p>
              <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{a.descricao}</p>
            </div>
          )}

          {/* rateio (aba Rateios da OC no Senior) */}
          {rateio.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Rateio {rateio.length > 1 ? `— ${rateio.length} linhas` : ""}
              </p>
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-xs text-gray-500">
                    <tr className="[&>th]:px-3 [&>th]:py-1.5">
                      <th>Conta financeira</th>
                      <th>Centro de custo</th>
                      <th className="text-right">%</th>
                      <th className="text-right">Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateio.map((r, i) => (
                      <tr key={i} className="border-t border-gray-100 [&>td]:px-3 [&>td]:py-1.5">
                        <td>{r.contaFinanceira || r.nome || "—"}</td>
                        <td>
                          {r.ccuNome ? (
                            <>
                              {r.ccuNome} <span className="text-xs text-gray-400">({r.codccu})</span>
                            </>
                          ) : (
                            `CC ${r.codccu}`
                          )}
                        </td>
                        <td className="text-right tabular-nums">{r.perc != null ? `${r.perc}%` : "—"}</td>
                        <td className="text-right tabular-nums">{r.valor != null ? formatMoeda(r.valor) : "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* cadeia de aprovacao */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Cadeia de aprovação</p>
            <ol className="space-y-1.5">
              {niveis.map((n, i) => (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-[11px] font-semibold text-emerald-700">
                    {n.NIVAPR}
                  </span>
                  <span className="text-gray-700">
                    Aprovado por <span className="font-medium">{nomeUsuSenior(n.USUAPR, codToNome)}</span>
                    {n.DATAPR ? ` em ${n.DATAPR}` : ""}
                  </span>
                </li>
              ))}
              <li className="flex items-start gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-amber-100 text-[11px] font-semibold text-amber-700">
                  {nivelMax + 1}
                </span>
                <span className="font-medium text-amber-700">
                  {a.proximoAprovador || a.proximoAprovadorNome
                    ? `Aguardando aprovação de ${aprovadorDe(a)}`
                    : `Aguardando aprovação — nível ${nivelMax + 1} (alçada do Senior)`}
                </span>
              </li>
            </ol>
          </div>

          {/* mapa de cotacao */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Mapa de cotação</p>
            {cotacao ? (
              <pre className="overflow-x-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-700">
                {JSON.stringify(cotacao, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-500">Esta OC não tem cotação vinculada no Senior.</p>
            )}
          </div>

          {/* eventos (auditoria) */}
          {a.eventos.length > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-gray-500">
                Histórico de mudanças ({a.eventos.length})
              </summary>
              <ul className="mt-2 space-y-1 text-xs text-gray-600">
                {a.eventos.map((e) => (
                  <li key={e.id}>
                    {new Date(e.detectadoEm).toLocaleString("pt-BR")} — {situacaoLabel[e.situacao] || e.situacao}
                    {e.nivel ? ` (nível ${e.nivel})` : ""}
                    {e.observacao ? ` — ${e.observacao}` : ""}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
