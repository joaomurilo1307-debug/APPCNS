"use client";

// Modal com o descritivo completo de uma Ordem de Compra do Senior
// (fornecedor, valor, rateio por centro de custo, alçada/níveis de
// aprovação, mapa de cotação, histórico). Compartilhado entre a tela de
// Aprovações OC (que já tem a OC carregada na lista) e qualquer outra tela
// que só tenha o numOcp e precise buscar sob demanda (ver
// /api/senior/aprovacoes/[numOcp]).

export type Evento = {
  id: string;
  situacao: string;
  nivel: number | null;
  observacao: string | null;
  detectadoEm: string;
};

export type NivelHist = {
  SEQAPR?: string;
  NIVAPR?: string;
  USUAPR?: string;
  SITAPR?: string;
  CCUAPR?: string;
  DATAPR?: string;
};

export type NivelRateio = {
  nivel: number;
  grupo: string;
  status: "aprovado" | "pendente";
  aprovadoresCod: string[];
  aprovadores: string[];
  aprovadoPor?: string | null;
  aprovadoPorCod?: string | null;
  aprovadoEm?: string | null;
};

export type RateioItem = {
  seq?: number;
  codccu: string;
  ccuNome?: string;
  contaFinanceira?: string;
  perc?: number;
  valor?: number;
  nome?: string;
  niveis?: NivelRateio[];
};

export type TituloVinculado = {
  numTit: string;
  tipo: string;
  pago: boolean;
  valorOriginal: number;
  valorAberto: number;
  dataEmissao: string;
  vencimentoProgramado: string | null;
  dataPagamento: string | null;
};

export type Aprovacao = {
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
  usuNumTit?: string | null;
  usuNumNfc?: string | null;
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

export const situacaoLabel: Record<string, string> = {
  ANA: "Em análise",
  PRE: "Pré-aprovado",
  APR: "Aprovado",
  REP: "Reprovado",
  CAN: "Cancelado",
};

const GRUPO_LABEL: Record<number, string> = { 1: "Coordenação", 2: "Gerência", 3: "Diretoria" };

export const situacaoStyle: Record<string, string> = {
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

export function niveisLabel(a: Aprovacao) {
  const exig = parseNiveis(a.niveisExigidos);
  const aprv = new Set(parseNiveis(a.niveisAprovados));
  if (exig.length) {
    const pendentes = exig.filter((n) => !aprv.has(n));
    if (!pendentes.length) return `${exig.length}/${exig.length} níveis`;
    return `nível ${pendentes[0]}/${exig.length}`;
  }

  // Algumas OCs antigas não têm NIVEXI/NIVAPR preenchidos. Não inventar
  // "nível 1" nesses casos: usa o histórico registrado ou informa que a
  // alçada não veio no sincronismo.
  const historico = parseJSON<NivelHist[]>(a.historicoNiveis) ?? [];
  const niveisHistorico = Array.from(
    new Set(historico.map((n) => Number(n.NIVAPR)).filter((n) => Number.isFinite(n)))
  );
  if (niveisHistorico.length) {
    return a.situacaoAtual === "APR"
      ? `${niveisHistorico.length}/${niveisHistorico.length} níveis registrados`
      : `nível ${a.nivelAtual} · ${niveisHistorico.length} registrados`;
  }

  const rateio = parseJSON<RateioItem[]>(a.rateioDetalhe) ?? [];
  const niveisRateio = Array.from(new Set(rateio.flatMap((r) => (r.niveis ?? []).map((n) => n.nivel))));
  if (niveisRateio.length) {
    return a.situacaoAtual === "APR"
      ? `${niveisRateio.length}/${niveisRateio.length} níveis registrados`
      : `nível ${a.nivelAtual} · ${niveisRateio.length} registrados`;
  }

  return a.situacaoAtual === "APR" ? "aprovada · alçada não informada" : "alçada não informada";
}

export function contratoDe(a: Aprovacao) {
  const rateio = parseJSON<RateioItem[]>(a.rateioDetalhe) ?? [];
  if (a.temRateio) {
    const ccs = Array.from(new Set(rateio.map((r) => r.ccuNome || `CC ${r.codccu}`)));
    if (ccs.length === 1) return `${ccs[0]} · rateio ${rateio.length} linhas`;
    return `Rateio · ${ccs.length} centros de custo`;
  }
  return a.contratoNome || rateio[0]?.ccuNome || (a.codccu ? `CC ${a.codccu}` : a.contratoTexto || "—");
}

export function resolvida(a: Aprovacao) {
  return !!a.resolvidoEm || ["APR", "REP", "CAN"].includes(a.situacaoAtual);
}

export function aprovadorDe(a: Aprovacao) {
  if (resolvida(a)) return situacaoLabel[a.resolvidoComo || a.situacaoAtual] || "Resolvido";
  return a.aprovadoresPendentes || a.proximoAprovador?.name || a.proximoAprovadorNome || `Aguardando · ${niveisLabel(a)}`;
}

function nomeUsuSenior(cod: string | undefined, codToNome: Record<string, string>) {
  if (!cod || cod === "0") return null;
  return codToNome[cod] || `Usuário Senior #${cod}`;
}

export default function MapaOC({
  aprovacao: a,
  codToNome,
  titulosVinculados,
  onClose,
}: {
  aprovacao: Aprovacao;
  codToNome: Record<string, string>;
  titulosVinculados?: TituloVinculado[];
  onClose: () => void;
}) {
  const niveis = parseJSON<NivelHist[]>(a.historicoNiveis) ?? [];
  const rateio = parseJSON<RateioItem[]>(a.rateioDetalhe) ?? [];
  const cotacao = parseJSON<any>(a.mapaCotacao);

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
        <div className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-brand/10 to-transparent px-6 py-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Ordem de compra</p>
            <p className="text-lg font-semibold">
              OC {a.numOcp}
              <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle[a.situacaoAtual]}`}>
                {situacaoLabel[a.situacaoAtual] || a.situacaoAtual} · {niveisLabel(a)}
              </span>
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600">
            ✕
          </button>
        </div>

        <div className="space-y-5 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">Valor</p>
              <p className="text-xl font-semibold">{formatMoeda(a.valor)}</p>
            </div>
            <div className="rounded-xl bg-gray-50 p-3">
              <p className="text-xs text-gray-500">{resolvida(a) ? "Resultado" : "Quem falta aprovar"}</p>
              <p className="text-sm font-semibold">
                {resolvida(a)
                  ? `${situacaoLabel[a.resolvidoComo || a.situacaoAtual] || a.situacaoAtual}${
                      a.resolvidoEm ? ` em ${new Date(a.resolvidoEm).toLocaleDateString("pt-BR")}` : ""
                    }`
                  : a.aprovadoresPendentes || aprovadorDe(a)}
              </p>
              <p className="mt-0.5 text-[11px] text-gray-400">{niveisLabel(a)} · alçada multinível do Senior (E068CNA)</p>
            </div>
          </div>

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
                  <dd className="font-medium">{a.contratoNome || rateio[0]?.ccuNome || (a.codccu ? `CC ${a.codccu}` : "—")}</dd>
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
              <dd className={diasParado(a.dataEmissao) > 7 ? "font-semibold text-rose-600" : ""}>{diasParado(a.dataEmissao)} dias</dd>
            </div>
            {a.usuNumTit && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">Título(s) vinculado(s) (digitado na OC)</dt>
                <dd className="font-medium">{a.usuNumTit}</dd>
              </div>
            )}
            {a.usuNumNfc && (
              <div className="col-span-2">
                <dt className="text-xs text-gray-500">NF(s) de compra vinculada(s) (digitada na OC)</dt>
                <dd className="font-medium">{a.usuNumNfc}</dd>
              </div>
            )}
          </dl>

          {titulosVinculados && titulosVinculados.length > 0 && (
            <div className="mb-4">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Título(s) gerado(s) por esta OC ({titulosVinculados.length})
              </p>
              <ul className="space-y-1 rounded-xl bg-gray-50 p-3">
                {titulosVinculados.map((t) => (
                  <li key={`${t.numTit}-${t.dataEmissao}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium text-gray-800">
                      {t.numTit} <span className="font-normal text-gray-400">({t.tipo})</span>
                    </span>
                    <span className="text-gray-600">{formatMoeda(t.valorOriginal)}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        t.pago ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"
                      }`}
                    >
                      {t.pago ? `Pago em ${t.dataPagamento ? new Date(t.dataPagamento).toLocaleDateString("pt-BR") : "—"}` : "Não pago"}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {a.descricao && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Descrição</p>
              <p className="whitespace-pre-wrap rounded-xl bg-gray-50 p-3 text-sm text-gray-700">{a.descricao}</p>
            </div>
          )}

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
                                nv.status === "aprovado" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                              }`}
                            >
                              {nv.status === "aprovado" ? "✓" : nv.nivel}
                            </span>
                            {nv.status === "aprovado" ? (
                              <span className="text-gray-500">
                                <span className="font-medium text-gray-600">{nv.grupo}</span> — aprovado
                                {nv.aprovadoPor ? ` por ${nv.aprovadoPor}` : ""}
                                {nv.aprovadoEm ? ` em ${nv.aprovadoEm}` : ""}
                              </span>
                            ) : (
                              <span className="text-gray-700">
                                <span className="font-medium">{nv.grupo}</span> — aguardando:{" "}
                                {nv.aprovadores.length ? nv.aprovadores.join(" · ") : "sem aprovador na alçada"}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1.5 text-xs text-gray-400">alçada não cadastrada para este centro de custo</p>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] text-gray-400">
                cada centro de custo é aprovado pela sua própria alçada (Senior E068CNA); assinaturas vêm do E614USU
              </p>
            </div>
          )}

          {rateio.length === 0 && niveis.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Cadeia de aprovação</p>
              <ol className="space-y-1.5">
                {niveis.map((n, i) => {
                  const situacaoNivel = (n.SITAPR || "").toUpperCase();
                  const aprovado = situacaoNivel === "APR";
                  const reprovado = ["REP", "CAN"].includes(situacaoNivel);
                  return (
                    <li key={i} className="flex items-start gap-2 text-sm text-gray-700">
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                          aprovado
                            ? "bg-emerald-100 text-emerald-700"
                            : reprovado
                              ? "bg-rose-100 text-rose-700"
                              : "bg-amber-100 text-amber-700"
                        }`}
                      >
                        {aprovado ? "✓" : reprovado ? "!" : n.NIVAPR || "?"}
                      </span>
                      <span>
                        {GRUPO_LABEL[Number(n.NIVAPR)] || `Nível ${n.NIVAPR || "não informado"}`} —{" "}
                        {aprovado
                          ? `aprovado por ${nomeUsuSenior(n.USUAPR, codToNome)}`
                          : reprovado
                            ? `${situacaoLabel[situacaoNivel] || situacaoNivel.toLowerCase()}`
                            : "pendente ou sem situação registrada"}
                        {n.DATAPR ? ` em ${n.DATAPR}` : ""}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">Mapa de cotação</p>
            {cotacao ? (
              <pre className="overflow-x-auto rounded-xl bg-gray-50 p-3 text-xs text-gray-700">{JSON.stringify(cotacao, null, 2)}</pre>
            ) : (
              <p className="text-sm text-gray-500">Esta OC não tem cotação vinculada no Senior.</p>
            )}
          </div>

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
