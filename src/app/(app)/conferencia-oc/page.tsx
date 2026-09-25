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
};

const STATUS_CLASSE: Record<string, string> = {
  PUBLICADO: "bg-emerald-100 text-emerald-800",
  ERRO: "bg-red-100 text-red-700",
  SEM_OC: "bg-amber-100 text-amber-800",
  OC_NAO_QUITADA: "bg-sky-100 text-sky-800",
};

const ORIGEM_LABEL: Record<string, string> = {
  VIGIA_OC_QUITADA: "Vigia (OC quitada)",
  RELATORIO_201: "Relatório 201",
  MANUAL: "Manual",
  EVENTO_PAGAMENTO: "Vigia (OC quitada)",
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

type Filtro = "documentos" | "pendencias" | "todos";

const ABAS: [Filtro, string][] = [
  ["documentos", "Com documento"],
  ["pendencias", "Pendências"],
  ["todos", "Todos"],
];

export default function ConferenciaOcPage() {
  const [dossies, setDossies] = useState<Dossie[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("documentos");
  const [ultimoRecebidoEm, setUltimoRecebidoEm] = useState<string | null>(null);

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

  useEffect(() => {
    fetch("/api/dossies")
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
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  const qtdPublicados = useMemo(() => dossies.filter((d) => d.status === "PUBLICADO").length, [dossies]);
  const qtdPendentes = dossies.length - qtdPublicados;

  const filtrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return dossies
      .filter((d) => {
        if (filtro === "documentos") return d.status === "PUBLICADO";
        if (filtro === "pendencias") return d.status !== "PUBLICADO";
        return true;
      })
      .filter(
        (d) =>
          !termo ||
          d.titulos.some((t) => t.toLowerCase().includes(termo)) ||
          (d.numOcp ?? "").toLowerCase().includes(termo) ||
          (d.fornecedorNome ?? "").toLowerCase().includes(termo)
      );
  }, [dossies, busca, filtro]);

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
              {v === "documentos" ? ` (${qtdPublicados})` : v === "pendencias" ? ` (${qtdPendentes})` : ""}
            </button>
          ))}
        </div>
        <input
          type="text"
          placeholder="Buscar título, nº da OC ou fornecedor..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72 rounded-lg border border-gray-200 px-3 py-1.5 text-sm focus:border-brand focus:outline-none"
        />
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
