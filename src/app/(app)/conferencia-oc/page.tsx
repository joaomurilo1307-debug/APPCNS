"use client";

import { useEffect, useMemo, useState } from "react";
import MapaOC, { type Aprovacao } from "@/components/MapaOC";

type Dossie = {
  id: string;
  numOcp: string | null;
  codFil: string;
  titulos: string[];
  fornecedorNome: string | null;
  vencimento: string | null;
  valorTotal: number | null;
  status: string;
  motivo: string | null;
  origem: string | null;
  gedDocumentId: string | null;
  temArquivo: boolean;
  arquivoNome: string | null;
  geradoEm: string;
};

const STATUS_LABEL: Record<string, string> = {
  PUBLICADO: "Publicado",
  ERRO: "Falha na geração",
  SEM_OC: "OC não localizada",
  OC_NAO_QUITADA: "OC ainda não quitada",
  AGUARDANDO_GERACAO: "Aguardando geração (n8n)",
};

const STATUS_CLASSE: Record<string, string> = {
  PUBLICADO: "bg-emerald-100 text-emerald-800",
  ERRO: "bg-red-100 text-red-700",
  SEM_OC: "bg-amber-100 text-amber-800",
  OC_NAO_QUITADA: "bg-sky-100 text-sky-800",
  AGUARDANDO_GERACAO: "bg-purple-100 text-purple-800",
};

const ORIGEM_LABEL: Record<string, string> = {
  VIGIA_OC_QUITADA: "Vigia (OC quitada)",
  RELATORIO_201: "Relatório 201",
  MANUAL: "Manual",
  EVENTO_PAGAMENTO: "Vigia (OC quitada)",
  DETECCAO_INTERNA: "Detecção interna (sem retorno do n8n)",
};

function formatMoeda(v: number | null) {
  if (v === null || v === undefined) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatData(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("pt-BR", { timeZone: "UTC" });
}

function formatDataHora(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

type StatusDossie = "PUBLICADO" | "ERRO" | "SEM_OC" | "OC_NAO_QUITADA" | "AGUARDANDO_GERACAO";

const STATUS_OPCOES: StatusDossie[] = ["PUBLICADO", "ERRO", "SEM_OC", "OC_NAO_QUITADA", "AGUARDANDO_GERACAO"];

const ORIGEM_OPCOES: [string, string][] = [
  ["todas", "Todas as origens"],
  ["VIGIA_OC_QUITADA", "Vigia (OC quitada)"],
  ["RELATORIO_201", "Relatório 201"],
  ["MANUAL", "Manual"],
  ["DETECCAO_INTERNA", "Detecção interna (sem retorno do n8n)"],
];

const INTERVALO_ATUALIZACAO_MS = 20_000;

export default function ConferenciaOcPage() {
  const [dossies, setDossies] = useState<Dossie[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ultimoRecebidoEm, setUltimoRecebidoEm] = useState<string | null>(null);

  const [statusSelecionados, setStatusSelecionados] = useState<StatusDossie[]>(STATUS_OPCOES);
  const [buscaTitulo, setBuscaTitulo] = useState("");
  const [buscaOc, setBuscaOc] = useState("");
  const [buscaFornecedor, setBuscaFornecedor] = useState("");
  const [origemFiltro, setOrigemFiltro] = useState("todas");
  const [vencDe, setVencDe] = useState("");
  const [vencAte, setVencAte] = useState("");

  function alternarStatus(s: StatusDossie) {
    setStatusSelecionados((atual) =>
      atual.includes(s) ? atual.filter((x) => x !== s) : [...atual, s]
    );
  }

  function limparFiltros() {
    setStatusSelecionados(STATUS_OPCOES);
    setBuscaTitulo("");
    setBuscaOc("");
    setBuscaFornecedor("");
    setOrigemFiltro("todas");
    setVencDe("");
    setVencAte("");
  }

  const [ocAberta, setOcAberta] = useState<Aprovacao | null>(null);
  const [codToNomeOC, setCodToNomeOC] = useState<Record<string, string>>({});
  const [carregandoOC, setCarregandoOC] = useState<string | null>(null);
  const [erroOC, setErroOC] = useState<string | null>(null);

  function abrirOC(numOcp: string) {
    setCarregandoOC(numOcp);
    setErroOC(null);
    fetch(`/api/senior/aprovacoes/${numOcp}`)
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar a OC");
        }
        return res.json();
      })
      .then((data) => {
        setOcAberta(data.aprovacao);
        setCodToNomeOC(data.codToNome ?? {});
      })
      .catch((e) => setErroOC(e.message))
      .finally(() => setCarregandoOC(null));
  }

  const [atualizadoEm, setAtualizadoEm] = useState<Date | null>(null);

  function carregarDossies(silencioso = false) {
    if (!silencioso) setLoading(true);
    return fetch("/api/dossies")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar");
        }
        return res.json();
      })
      .then((data) => {
        setDossies(data.dossies ?? []);
        setUltimoRecebidoEm(data.ultimoRecebidoEm ?? null);
        setErro(null);
        setAtualizadoEm(new Date());
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    carregarDossies();
    const id = setInterval(() => carregarDossies(true), INTERVALO_ATUALIZACAO_MS);
    return () => clearInterval(id);
  }, []);

  const qtdPublicados = useMemo(() => dossies.filter((d) => d.status === "PUBLICADO").length, [dossies]);
  const qtdPendentes = dossies.length - qtdPublicados;
  const qtdSemGeracao = useMemo(
    () => dossies.filter((d) => d.status === "AGUARDANDO_GERACAO").length,
    [dossies]
  );

  const qtdPorStatus = useMemo(() => {
    const m: Record<string, number> = {};
    for (const d of dossies) m[d.status] = (m[d.status] ?? 0) + 1;
    return m;
  }, [dossies]);

  const filtrados = useMemo(() => {
    const termoTitulo = buscaTitulo.trim().toLowerCase();
    const termoOc = buscaOc.trim().toLowerCase();
    const termoFornecedor = buscaFornecedor.trim().toLowerCase();
    return dossies
      .filter((d) => statusSelecionados.includes(d.status as StatusDossie))
      .filter((d) => !termoTitulo || d.titulos.some((t) => t.toLowerCase().includes(termoTitulo)))
      .filter((d) => !termoOc || (d.numOcp ?? "").toLowerCase().includes(termoOc))
      .filter((d) => !termoFornecedor || (d.fornecedorNome ?? "").toLowerCase().includes(termoFornecedor))
      .filter((d) => origemFiltro === "todas" || (d.origem ?? "") === origemFiltro)
      .filter((d) => !vencDe || (d.vencimento ?? "").slice(0, 10) >= vencDe)
      .filter((d) => !vencAte || (d.vencimento ?? "").slice(0, 10) <= vencAte);
  }, [dossies, statusSelecionados, buscaTitulo, buscaOc, buscaFornecedor, origemFiltro, vencDe, vencAte]);

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold">Conferência de OC</h1>
          <p className="mt-0.5 text-sm text-gray-500">
            Dossiês gerados automaticamente a partir do Senior — Ordem de Compra, notas, títulos, rateios e
            validações num documento só. O número do título na Programação de Pagamento abre o dossiê daqui.
          </p>
        </div>
        <span className="mt-1 shrink-0 text-right text-[11px] leading-tight text-gray-400">
          {ultimoRecebidoEm ? <>Último dossiê recebido em {formatDataHora(ultimoRecebidoEm)}</> : "Nenhum dossiê recebido ainda"}
          <br />
          {atualizadoEm && <>Tela atualizada às {atualizadoEm.toLocaleTimeString("pt-BR")} (auto a cada 20s)</>}
        </span>
      </div>

      {qtdSemGeracao > 0 && (
        <div className="mb-4 rounded-xl border border-purple-200 bg-purple-50 px-4 py-2.5 text-sm text-purple-800">
          <strong>{qtdSemGeracao}</strong> OC{qtdSemGeracao > 1 ? "s" : ""} já paga{qtdSemGeracao > 1 ? "s" : ""} na
          Senior mas sem dossiê recebido do n8n — listada{qtdSemGeracao > 1 ? "s" : ""} abaixo como
          &quot;{STATUS_LABEL.AGUARDANDO_GERACAO}&quot;.
        </div>
      )}

      <div className="mb-4 space-y-2.5 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-[11px] font-medium uppercase tracking-wide text-gray-400">Situação</span>
          {STATUS_OPCOES.map((s) => (
            <button
              key={s}
              onClick={() => alternarStatus(s)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                statusSelecionados.includes(s)
                  ? "border-brand bg-brand text-white"
                  : "border-gray-200 bg-white text-gray-500 hover:bg-gray-50"
              }`}
            >
              {STATUS_LABEL[s]} ({qtdPorStatus[s] ?? 0})
            </button>
          ))}
          <button
            onClick={limparFiltros}
            className="ml-auto text-[11px] font-medium text-gray-400 underline decoration-dotted underline-offset-2 hover:text-gray-600"
          >
            Limpar filtros
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            placeholder="Filtrar por título..."
            value={buscaTitulo}
            onChange={(e) => setBuscaTitulo(e.target.value)}
            className="w-44 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <input
            type="text"
            placeholder="Filtrar por nº da OC..."
            value={buscaOc}
            onChange={(e) => setBuscaOc(e.target.value)}
            className="w-44 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <input
            type="text"
            placeholder="Filtrar por fornecedor..."
            value={buscaFornecedor}
            onChange={(e) => setBuscaFornecedor(e.target.value)}
            className="w-52 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          />
          <select
            value={origemFiltro}
            onChange={(e) => setOrigemFiltro(e.target.value)}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
          >
            {ORIGEM_OPCOES.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
          <div className="flex items-center gap-1.5 text-sm text-gray-500">
            <span className="text-[11px] uppercase tracking-wide text-gray-400">Vencimento</span>
            <input
              type="date"
              value={vencDe}
              onChange={(e) => setVencDe(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
            <span>até</span>
            <input
              type="date"
              value={vencAte}
              onChange={(e) => setVencAte(e.target.value)}
              className="rounded-lg border border-gray-200 px-2 py-1.5 text-sm focus:border-brand focus:outline-none"
            />
          </div>
        </div>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Dossiês publicados</p>
          <p className="text-xl font-semibold tabular-nums">{qtdPublicados}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Pendências registradas</p>
          <p className="text-xl font-semibold tabular-nums">{qtdPendentes}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
          <p className="text-xs text-gray-500">Mostrando</p>
          <p className="text-xl font-semibold tabular-nums">{filtrados.length}</p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
        <table className="w-full text-[13px]">
          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-3 py-2 font-medium">Título(s)</th>
              <th className="px-3 py-2 font-medium">OC</th>
              <th className="px-3 py-2 font-medium">Fornecedor</th>
              <th className="px-3 py-2 font-medium">Vencimento</th>
              <th className="px-3 py-2 text-right font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Origem</th>
              <th className="px-3 py-2 font-medium">Gerado em</th>
              <th className="px-3 py-2 font-medium">Situação</th>
              <th className="px-3 py-2 font-medium">Documento</th>
            </tr>
          </thead>
          <tbody>
            {filtrados.map((d, i) => (
              <tr key={d.id} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                <td className="px-3 py-1.5 font-medium text-gray-800">
                  {d.titulos.length ? d.titulos.join(" · ") : "—"}
                </td>
                <td className="px-3 py-1.5">
                  {d.numOcp ? (
                    <button
                      onClick={() => abrirOC(d.numOcp!)}
                      disabled={carregandoOC === d.numOcp}
                      title="Abrir o descritivo da OC no Senior"
                      className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700 underline decoration-dotted underline-offset-2 hover:brightness-95 disabled:opacity-50"
                    >
                      OC {d.numOcp}
                      {carregandoOC === d.numOcp && "…"}
                    </button>
                  ) : (
                    <span className="text-gray-300">—</span>
                  )}
                </td>
                <td className="max-w-[220px] truncate px-3 py-1.5" title={d.fornecedorNome ?? ""}>
                  {d.fornecedorNome || "—"}
                </td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatData(d.vencimento)}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{formatMoeda(d.valorTotal)}</td>
                <td className="px-3 py-1.5 text-gray-500">{ORIGEM_LABEL[d.origem ?? ""] ?? d.origem ?? "—"}</td>
                <td className="px-3 py-1.5 tabular-nums text-gray-500">{formatDataHora(d.geradoEm)}</td>
                <td className="px-3 py-1.5">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                      STATUS_CLASSE[d.status] ?? "bg-gray-100 text-gray-700"
                    }`}
                    title={d.motivo ?? undefined}
                  >
                    {STATUS_LABEL[d.status] ?? d.status}
                  </span>
                </td>
                <td className="px-3 py-1.5">
                  {d.temArquivo ? (
                    <a
                      href={`/api/dossies/${d.id}/arquivo`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-brand underline decoration-dotted underline-offset-2 hover:brightness-95"
                    >
                      abrir PDF
                    </a>
                  ) : (
                    <span className="text-gray-400" title={d.motivo ?? undefined}>
                      {d.motivo ? "sem documento — ver motivo" : "sem documento"}
                    </span>
                  )}
                </td>
              </tr>
            ))}
            {filtrados.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-6 text-center text-gray-400">
                  {dossies.length === 0
                    ? "Nenhum dossiê recebido ainda. A automação do n8n envia para cá assim que publica um documento."
                    : "Nenhum dossiê encontrado com esse filtro."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {erroOC && (
        <div
          className="fixed inset-x-0 bottom-4 z-50 mx-auto w-fit rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700 shadow-lg"
          onClick={() => setErroOC(null)}
        >
          {erroOC} (clique pra fechar)
        </div>
      )}
      {ocAberta && <MapaOC aprovacao={ocAberta} codToNome={codToNomeOC} onClose={() => setOcAberta(null)} />}
    </div>
  );
}
