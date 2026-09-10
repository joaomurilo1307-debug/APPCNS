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

type NivelRateio = {
  nivel: number;
  grupo: string;
  status: "aprovado" | "pendente";
  aprovadoresCod: string[];
  aprovadores: string[];
};

type RateioItem = {
  seq?: number;
  codccu: string;
  ccuNome?: string;
  contaFinanceira?: string;
  perc?: number;
  valor?: number;
  nome?: string; // compat com formato antigo
  niveis?: NivelRateio[];
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
  niveisExigidos: string | null;
  niveisAprovados: string | null;
  nivelAtual: number;
  temRateio: boolean;
  rateioDetalhe: string | null;
  mapaCotacao: string | null;
  historicoNiveis: string | null;
  aprovadoresPendentes: string | null;
  aprovadoresPendentesCod: string | null;
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

// nível da alçada de OC do Senior (E068CNA.CODNAP) -> grupo aprovador
const GRUPO_LABEL: Record<number, string> = { 1: "Coordenação", 2: "Gerência", 3: "Diretoria" };

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

function parseNiveis(csv: string | null): number[] {
  if (!csv) return [];
  return csv
    .split(",")
    .map((n) => Number(n.trim()))
    .filter((n) => Number.isFinite(n));
}

function niveisLabel(a: Aprovacao) {
  const exig = parseNiveis(a.niveisExigidos);
  const aprv = parseNiveis(a.niveisAprovados);
  if (!exig.length) return `nível ${a.nivelAtual}`;
  return `nível ${aprv.length} de ${exig.length}`;
}

function contratoDe(a: Aprovacao) {
  // centro de custo REAL da OC vem da aba Rateios (E420RAT) -> nome pelo
  // cadastro mestre E044CCU; com rateio, cada linha tem o seu (ver mapa)
  const rateio = parseJSON<RateioItem[]>(a.rateioDetalhe) ?? [];
  if (a.temRateio) {
    const ccs = Array.from(new Set(rateio.map((r) => r.ccuNome || `CC ${r.codccu}`)));
    if (ccs.length === 1) return `${ccs[0]} · rateio ${rateio.length} linhas`;
    return `Rateio · ${ccs.length} centros de custo`;
  }
  return a.contratoNome || rateio[0]?.ccuNome || (a.codccu ? `CC ${a.codccu}` : a.contratoTexto || "—");
}

function aprovadorDe(a: Aprovacao) {
  return a.aprovadoresPendentes || a.proximoAprovador?.name || a.proximoAprovadorNome || `Aguardando · ${niveisLabel(a)}`;
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
                    {situacaoLabel[a.situacaoAtual] || a.situacaoAtual} · {niveisLabel(a)}
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

  const niveisExig = parseNiveis(a.niveisExigidos);
  const niveisAprv = parseNiveis(a.niveisAprovados);
  // {nivApr -> {usuAprSenior, data}} do historico E614USU, pra anotar quem aprovou
  const aprovadoPor = new Map<number, NivelHist>();
  for (const n of niveis) {
    const lvl = Number(n.NIVAPR);
    if ((n.SITAPR || "").toUpperCase() === "APR" && Number.isFinite(lvl)) aprovadoPor.set(lvl, n);
  }
  // aprovadores por nivel (agregado das linhas de rateio): nivel -> Set<nome>
  const aprovadoresNivel = new Map<number, Set<string>>();
  for (const r of rateio) {
    for (const nv of r.niveis ?? []) {
      const s = aprovadoresNivel.get(nv.nivel) ?? new Set<string>();
      (nv.aprovadores ?? []).forEach((x) => s.add(x));
      aprovadoresNivel.set(nv.nivel, s);
    }
  }
  const nivelLista = niveisExig.length ? niveisExig : [a.nivelAtual];

  // a alcada e por centro de custo, entao agrupo as linhas de rateio por CC
  // (uma OC pode ter N linhas no mesmo CC) -- soma valor, lista as contas
  type GrupoCC = {
    codccu: string;
    ccuNome?: string;
    linhas: number;
    valor: number;
    contas: Set<string>;
    niveis: NivelRateio[];
  };
  const mapaCC = new Map<string, GrupoCC>();
  for (const r of rateio) {
    let g = mapaCC.get(r.codccu);
    if (!g) {
      g = { codccu: r.codccu, ccuNome: r.ccuNome, linhas: 0, valor: 0, contas: new Set<string>(), niveis: r.niveis ?? [] };
      mapaCC.set(r.codccu, g);
    }
    g.linhas += 1;
    g.valor += r.valor ?? 0;
    const conta = r.contaFinanceira || r.nome;
    if (conta) g.contas.add(conta);
  }
  const rateioPorCC = Array.from(mapaCC.values());

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
                {situacaoLabel[a.situacaoAtual] || a.situacaoAtual} · {niveisLabel(a)}
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
              <p className="text-sm font-semibold">{a.aprovadoresPendentes || aprovadorDe(a)}</p>
              <p className="mt-0.5 text-[11px] text-gray-400">
                {niveisLabel(a)} · alçada multinível do Senior (E068CNA)
              </p>
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
              {a.temRateio ? (
                <>
                  <dd className="font-medium">Rateio — {rateio.length} linhas</dd>
                  <dd className="text-xs text-gray-400">detalhe por centro de custo abaixo</dd>
                </>
              ) : (
                <>
                  <dd className="font-medium">
                    {a.contratoNome || rateio[0]?.ccuNome || (a.codccu ? `CC ${a.codccu}` : "—")}
                  </dd>
                  {a.codccu && <dd className="text-xs text-gray-400">CC {a.codccu} · cadastro Senior (E044CCU)</dd>}
                </>
              )}
              {a.contratoTexto && a.contratoTexto !== a.contratoNome && (
                <dd className="mt-0.5 text-xs text-gray-400">texto do comprador: “{a.contratoTexto}”</dd>
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

          {/* rateio (aba Rateios da OC no Senior), agrupado por centro de custo —
              cada CC com a sua pendência por nível (a alçada é por CC) */}
          {rateio.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Rateio — {rateio.length} {rateio.length === 1 ? "linha" : "linhas"}
                {rateioPorCC.length > 1 ? ` em ${rateioPorCC.length} centros de custo` : ""} · pendência por nível
              </p>
              <div className="space-y-2">
                {rateioPorCC.map((g) => (
                  <div key={g.codccu} className="rounded-xl border border-gray-100 p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                      <p className="text-sm font-medium">
                        {g.ccuNome || `CC ${g.codccu}`}{" "}
                        <span className="text-xs font-normal text-gray-400">
                          CC {g.codccu}
                          {g.linhas > 1 ? ` · ${g.linhas} linhas` : ""}
                        </span>
                      </p>
                      <p className="text-xs text-gray-500">
                        {Array.from(g.contas).join(", ") || "—"} ·{" "}
                        <span className="tabular-nums font-medium text-gray-700">{formatMoeda(g.valor)}</span>
                      </p>
                    </div>
                    {g.niveis.length > 0 ? (
                      <ul className="mt-2 space-y-1">
                        {g.niveis.map((nv) => (
                          <li key={nv.nivel} className="flex items-start gap-2 text-xs">
                            <span
                              className={`mt-px flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                                nv.status === "aprovado"
                                  ? "bg-emerald-100 text-emerald-700"
                                  : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {nv.status === "aprovado" ? "✓" : nv.nivel}
                            </span>
                            <span className={nv.status === "aprovado" ? "text-gray-400 line-through" : "text-gray-700"}>
                              <span className="font-medium">{nv.grupo}</span>
                              {": "}
                              {nv.aprovadores.length ? nv.aprovadores.join(" · ") : "sem aprovador na alçada"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-xs text-gray-400">alçada não cadastrada para este centro de custo</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* cadeia de aprovacao — todos os niveis exigidos, aprovado x pendente */}
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Cadeia de aprovação</p>
            <ol className="space-y-1.5">
              {nivelLista.map((lvl) => {
                const feito = niveisAprv.includes(lvl);
                const hist = aprovadoPor.get(lvl);
                const quem = Array.from(aprovadoresNivel.get(lvl) ?? []);
                return (
                  <li key={lvl} className="flex items-start gap-2 text-sm">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                        feito ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                      }`}
                    >
                      {feito ? "✓" : lvl}
                    </span>
                    {feito ? (
                      <span className="text-gray-700">
                        <span className="font-medium">{GRUPO_LABEL[lvl] || `Nível ${lvl}`}</span> — aprovado
                        {hist?.USUAPR ? ` por ${nomeUsuSenior(hist.USUAPR, codToNome)}` : ""}
                        {hist?.DATAPR ? ` em ${hist.DATAPR}` : ""}
                      </span>
                    ) : (
                      <span className="font-medium text-amber-700">
                        {GRUPO_LABEL[lvl] || `Nível ${lvl}`} — aguardando
                        {quem.length ? `: ${quem.join(" · ")}` : " (alçada do Senior)"}
                      </span>
                    )}
                  </li>
                );
              })}
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
