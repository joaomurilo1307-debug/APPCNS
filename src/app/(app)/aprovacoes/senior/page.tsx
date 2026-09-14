"use client";

import { useEffect, useMemo, useState } from "react";
import MapaOC, {
  type TituloVinculado,
  type Aprovacao,
  situacaoLabel,
  situacaoStyle,
  niveisLabel,
  contratoDe,
  aprovadorDe,
} from "@/components/MapaOC";

function formatMoeda(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function diasParado(dataEmissao: string) {
  return Math.floor((Date.now() - new Date(dataEmissao).getTime()) / 86400000);
}

const SITUACOES_FILTRO = ["ANA", "PRE", "APR", "REP", "CAN"] as const;
const LIMITE_LINHAS = 500;

// Lista de resolvidas: só campos escalares (leve, dá pra trazer todas de
// uma vez). O detalhe completo (rateio/níveis/eventos) é buscado sob
// demanda quando o usuário clica numa linha -- ver abrirResolvida().
type ResolvidaResumo = {
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
  usuNumTit?: string | null;
  situacaoAtual: string;
  temRateio: boolean;
  primeiraDeteccaoEm: string;
  resolvidoEm: string | null;
  resolvidoComo: string | null;
};

const LEGENDA_SITUACAO: { sit: (typeof SITUACOES_FILTRO)[number]; desc: string }[] = [
  { sit: "ANA", desc: "Em análise — ainda não passou por nenhum nível de aprovação da alçada." },
  { sit: "PRE", desc: "Pré-aprovado — passou por uma etapa inicial (ex. empenho/orçamento), mas ainda não é a aprovação final da alçada." },
  { sit: "APR", desc: "Aprovado — todos os níveis exigidos pela alçada (Coordenação/Gerência/Diretoria, conforme o valor) já assinaram." },
  { sit: "REP", desc: "Reprovado — algum nível da alçada recusou a OC." },
  { sit: "CAN", desc: "Cancelado — a OC foi cancelada no Senior antes de concluir o fluxo de aprovação." },
];

export default function AprovacoesSeniorPage() {
  const [pendentes, setPendentes] = useState<Aprovacao[]>([]);
  const [resolvidas, setResolvidas] = useState<ResolvidaResumo[]>([]);
  const [codToNome, setCodToNome] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberta, setAberta] = useState<Aprovacao | null>(null);
  const [titulosDaAberta, setTitulosDaAberta] = useState<TituloVinculado[]>([]);
  const [busca, setBusca] = useState("");
  const [situacoesAtivas, setSituacoesAtivas] = useState<Set<string>>(new Set());
  const [somenteRateio, setSomenteRateio] = useState(false);
  const [carregandoResolvida, setCarregandoResolvida] = useState<string | null>(null);
  const [erroResolvida, setErroResolvida] = useState<string | null>(null);

  function abrirResolvida(numOcp: string) {
    setCarregandoResolvida(numOcp);
    setErroResolvida(null);
    fetch(`/api/senior/aprovacoes/${numOcp}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar a OC");
        }
        return res.json();
      })
      .then((data) => {
        setAberta(data.aprovacao);
        setCodToNome((prev) => ({ ...prev, ...(data.codToNome ?? {}) }));
        setTitulosDaAberta(data.titulosVinculados ?? []);
      })
      .catch((e) => setErroResolvida(e.message))
      .finally(() => setCarregandoResolvida(null));
  }

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

  function toggleSituacao(s: string) {
    setSituacoesAtivas((prev) => {
      const novo = new Set(prev);
      if (novo.has(s)) novo.delete(s);
      else novo.add(s);
      return novo;
    });
  }

  // Aceita Aprovacao (pendentes, já tem o rateio completo) ou ResolvidaResumo
  // (lista leve) -- contratoDe() precisa de rateioDetalhe, que a lista leve
  // não tem, então usa os campos escalares (contratoNome/codccu/
  // contratoTexto) direto pra busca nesse caso, sem o detalhe do rateio.
  function passaFiltro(a: Aprovacao | ResolvidaResumo) {
    const termo = busca.trim().toLowerCase();
    if (termo) {
      const contrato = "rateioDetalhe" in a ? contratoDe(a) : a.contratoNome || a.contratoTexto || (a.codccu ? `CC ${a.codccu}` : "");
      const alvo = `${a.numOcp} ${a.fornecedorNome ?? ""} ${a.fornecedorCodigo} ${a.descricao ?? ""} ${contrato} ${a.usuNumTit ?? ""}`.toLowerCase();
      if (!alvo.includes(termo)) return false;
    }
    if (situacoesAtivas.size > 0 && !situacoesAtivas.has(a.situacaoAtual)) return false;
    if (somenteRateio && !a.temRateio) return false;
    return true;
  }

  const [mostrarLegenda, setMostrarLegenda] = useState(false);

  const pendentesFiltradas = useMemo(() => pendentes.filter(passaFiltro), [pendentes, busca, situacoesAtivas, somenteRateio]);
  const resolvidasFiltradas = useMemo(() => resolvidas.filter(passaFiltro), [resolvidas, busca, situacoesAtivas, somenteRateio]);
  const resolvidasMostradas = resolvidasFiltradas.slice(0, LIMITE_LINHAS);

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  const valorTotalPendente = pendentesFiltradas.reduce((s, a) => s + a.valor, 0);
  const filtrosAtivos = busca.trim() || situacoesAtivas.size > 0 || somenteRateio;

  return (
    <div className="p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="mb-1 text-xl font-semibold">Aprovações — Ordens de Compra (Senior)</h1>
          <p className="max-w-3xl text-sm text-gray-500">
            Ordens de compra aguardando aprovação, sincronizadas do Senior. A lista mostra quem precisa aprovar e se há
            rateio; clique numa linha para ver o mapa completo da OC (fornecedor, valor, descrição, contratos do rateio,
            histórico de níveis e cotação).
          </p>
        </div>
        <button
          onClick={() => setMostrarLegenda((v) => !v)}
          className="shrink-0 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          {mostrarLegenda ? "Ocultar" : "O que significa cada situação?"}
        </button>
      </div>

      {mostrarLegenda && (
        <div className="mb-5 rounded-xl border border-gray-100 bg-white p-4 text-sm shadow-sm">
          <p className="mb-2 font-semibold text-gray-700">Situação da OC</p>
          <ul className="mb-4 space-y-1.5">
            {LEGENDA_SITUACAO.map(({ sit, desc }) => (
              <li key={sit} className="flex items-start gap-2">
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle[sit]}`}>
                  {situacaoLabel[sit]}
                </span>
                <span className="text-gray-600">{desc}</span>
              </li>
            ))}
          </ul>
          <p className="mb-1 font-semibold text-gray-700">Outros termos</p>
          <ul className="space-y-1 text-gray-600">
            <li><span className="font-medium text-gray-700">Nível X/Y:</span> a alçada exige Y níveis pra essa OC (pelo valor); X é o próximo nível ainda pendente. Os níveis são sempre Coordenação → Gerência → Diretoria, na ordem.</li>
            <li><span className="font-medium text-gray-700">Rateio: Sim:</span> a OC tem despesa dividida entre mais de um centro de custo — o mapa da OC mostra o detalhe por CC.</li>
            <li><span className="font-medium text-gray-700">"(desligado)":</span> a pessoa configurada como aprovador na alçada do Senior não está mais na folha ativa — mostrado só quando ninguém mais daquele nível está ativo (senão a pessoa desligada é omitida e some da lista, já que há quem aprovar).</li>
            <li><span className="font-medium text-gray-700">"alçada não informada":</span> o Senior não trouxe os níveis exigidos (E614APR.NIVEXI) nem histórico de aprovação pra essa OC no sincronismo — não inventamos um nível, mostramos que falta o dado.</li>
          </ul>
        </div>
      )}

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input
          type="text"
          placeholder="Buscar OC, fornecedor, título, descrição..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
        <div className="inline-flex flex-wrap gap-1.5">
          {SITUACOES_FILTRO.map((s) => (
            <button
              key={s}
              onClick={() => toggleSituacao(s)}
              className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                situacoesAtivas.has(s) ? situacaoStyle[s] : "bg-gray-50 text-gray-400 hover:bg-gray-100"
              }`}
            >
              {situacaoLabel[s]}
            </button>
          ))}
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-600">
          <input type="checkbox" checked={somenteRateio} onChange={(e) => setSomenteRateio(e.target.checked)} />
          só com rateio
        </label>
        {filtrosAtivos && (
          <button
            onClick={() => {
              setBusca("");
              setSituacoesAtivas(new Set());
              setSomenteRateio(false);
            }}
            className="text-xs text-gray-400 underline hover:text-gray-600"
          >
            limpar filtros
          </button>
        )}
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pendentes {filtrosAtivos ? "(filtro)" : "agora"}</p>
          <p className="text-2xl font-semibold">{pendentesFiltradas.length}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Valor total parado</p>
          <p className="text-2xl font-semibold">{formatMoeda(valorTotalPendente)}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Resolvidas {filtrosAtivos ? "(filtro)" : "recentemente"}</p>
          <p className="text-2xl font-semibold">{resolvidasFiltradas.length}</p>
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
            {pendentesFiltradas.map((a) => (
              <tr
                key={a.id}
                className="cursor-pointer border-t border-gray-100 align-middle hover:bg-brand/[0.04] [&>td]:px-4 [&>td]:py-3"
                onClick={() => {
                  setAberta(a);
                  setTitulosDaAberta([]); // pendente: só busca título vinculado ao abrir de fato (sem fetch aqui)
                }}
              >
                <td className="whitespace-nowrap font-medium">{a.numOcp}</td>
                <td className="whitespace-nowrap">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle[a.situacaoAtual]}`}>
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
                <td className="max-w-[220px] truncate" title={aprovadorDe(a)}>
                  <span className={a.aprovadoresPendentes || a.proximoAprovador || a.proximoAprovadorNome ? "" : "text-gray-400"}>
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
            {pendentesFiltradas.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-gray-400">
                  {filtrosAtivos ? "Nenhuma OC pendente bate com esse filtro." : "Nenhuma OC pendente de aprovação no momento."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2 className="mb-2 text-sm font-semibold text-gray-700">
        Histórico de OCs resolvidas
        {resolvidasFiltradas.length > LIMITE_LINHAS && (
          <span className="ml-2 font-normal text-gray-400">
            mostrando {LIMITE_LINHAS} de {resolvidasFiltradas.length} — use a busca pra achar uma OC específica
          </span>
        )}
      </h2>
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
            {resolvidasMostradas.map((a) => {
              const dias = a.resolvidoEm
                ? Math.floor((new Date(a.resolvidoEm).getTime() - new Date(a.primeiraDeteccaoEm).getTime()) / 86400000)
                : null;
              return (
                <tr
                  key={a.id}
                  className="cursor-pointer border-t border-gray-100 hover:bg-brand/[0.04] [&>td]:px-4 [&>td]:py-3"
                  onClick={() => abrirResolvida(a.numOcp)}
                >
                  <td className="whitespace-nowrap font-medium">
                    {a.numOcp}
                    {carregandoResolvida === a.numOcp && "…"}
                  </td>
                  <td className="max-w-[240px] truncate" title={a.fornecedorNome || a.fornecedorCodigo}>
                    {a.fornecedorNome || a.fornecedorCodigo}
                  </td>
                  <td className="whitespace-nowrap text-right font-medium tabular-nums">{formatMoeda(a.valor)}</td>
                  <td className="whitespace-nowrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${situacaoStyle[a.resolvidoComo || ""]}`}>
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
            {resolvidasFiltradas.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-6 text-center text-gray-400">
                  {filtrosAtivos ? "Nenhuma OC resolvida bate com esse filtro." : "Nenhuma resolução registrada ainda."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {erroResolvida && (
        <div className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg">
          {erroResolvida}
        </div>
      )}

      {aberta && (
        <MapaOC aprovacao={aberta} codToNome={codToNome} titulosVinculados={titulosDaAberta} onClose={() => setAberta(null)} />
      )}
    </div>
  );
}
