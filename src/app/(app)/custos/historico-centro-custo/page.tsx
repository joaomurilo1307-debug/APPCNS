"use client";

import { useEffect, useMemo, useState } from "react";

type Registro = {
  matricula: string;
  colaborador: string;
  codccu: string;
  equipe: string | null;
  competencia: string;
  atualizadoEm: string;
};

function formatMesAno(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit", timeZone: "UTC" });
}

export default function HistoricoCentroCustoPage() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState("");
  const [expandido, setExpandido] = useState<string | null>(null);
  const [totalPessoas, setTotalPessoas] = useState(0);
  const [ultimaCompetencia, setUltimaCompetencia] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/historico-ccu")
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Erro ao carregar");
        }
        return res.json();
      })
      .then((data) => {
        setRegistros(data.registros);
        setTotalPessoas(data.totalPessoas ?? 0);
        setUltimaCompetencia(data.ultimaCompetencia ?? null);
      })
      .catch((e) => setErro(e.message))
      .finally(() => setLoading(false));
  }, []);

  const pessoas = useMemo(() => {
    const porMatricula = new Map<string, { matricula: string; colaborador: string; timeline: Registro[] }>();
    for (const r of registros) {
      let p = porMatricula.get(r.matricula);
      if (!p) {
        p = { matricula: r.matricula, colaborador: r.colaborador, timeline: [] };
        porMatricula.set(r.matricula, p);
      }
      p.timeline.push(r);
    }
    for (const p of porMatricula.values()) {
      p.timeline.sort((a, b) => a.competencia.localeCompare(b.competencia));
    }
    const termo = busca.trim().toLowerCase();
    return Array.from(porMatricula.values())
      .filter((p) => !termo || p.colaborador.toLowerCase().includes(termo) || p.matricula.includes(termo))
      .sort((a, b) => a.colaborador.localeCompare(b.colaborador));
  }, [registros, busca]);

  const pessoasComMudanca = pessoas.filter((p) => new Set(p.timeline.map((t) => t.codccu)).size > 1).length;

  if (loading) return <div className="p-6 text-sm text-gray-500">Carregando...</div>;
  if (erro) return <div className="p-6 text-sm text-red-600">{erro}</div>;

  return (
    <div className="p-6">
      <h1 className="mb-1 text-xl font-semibold">Histórico de Centro de Custo por Colaborador</h1>
      <p className="mb-5 max-w-3xl text-sm text-gray-500">
        Ledger imutável: qual centro de custo cada colaborador CLT tinha em cada mês, capturado naquele mês e nunca
        reescrito depois. Resolve o problema de um contrato encerrado aparecer com margem ótima porque o custo da
        pessoa "sumiu" pro CC novo dela — a partir do mês em que começou a captura, isso não acontece mais.
      </p>

      <div className="mb-5 flex flex-wrap items-end gap-4">
        <input
          type="text"
          placeholder="Buscar por nome ou matrícula..."
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="w-72 rounded-lg border border-gray-200 px-3 py-2 text-sm focus:border-brand focus:outline-none"
        />
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Pessoas no ledger</p>
          <p className="text-2xl font-semibold">{totalPessoas}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Já mudaram de CC (dentro do capturado)</p>
          <p className="text-2xl font-semibold">{pessoasComMudanca}</p>
        </div>
        <div className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs text-gray-500">Último mês capturado</p>
          <p className="text-2xl font-semibold">{ultimaCompetencia ? formatMesAno(ultimaCompetencia) : "—"}</p>
        </div>
      </div>

      <div className="space-y-2">
        {pessoas.map((p) => {
          const mudou = new Set(p.timeline.map((t) => t.codccu)).size > 1;
          return (
            <div key={p.matricula} className="overflow-hidden rounded-xl border border-gray-100 bg-white shadow-sm">
              <button
                onClick={() => setExpandido(expandido === p.matricula ? null : p.matricula)}
                className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-gray-50"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{p.colaborador}</p>
                  <p className="text-xs text-gray-400">
                    matrícula {p.matricula} · {p.timeline.length} mês(es) capturado(s)
                    {mudou && <span className="ml-1 font-medium text-amber-600">· mudou de CC</span>}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-3">
                  <span className="text-sm text-gray-500">{p.timeline[p.timeline.length - 1]?.equipe ?? p.timeline[p.timeline.length - 1]?.codccu}</span>
                  <span className="text-gray-400">{expandido === p.matricula ? "▲" : "▼"}</span>
                </div>
              </button>

              {expandido === p.matricula && (
                <div className="border-t border-gray-50 bg-gray-50/50 px-4 py-3">
                  <p className="mb-2 text-xs font-semibold uppercase text-gray-500">Linha do tempo (mês → CC)</p>
                  <div className="flex flex-wrap gap-2">
                    {p.timeline.map((t, i) => {
                      const mudouAqui = i > 0 && p.timeline[i - 1].codccu !== t.codccu;
                      return (
                        <div
                          key={t.competencia}
                          className={`rounded-lg border px-3 py-1.5 text-xs ${
                            mudouAqui ? "border-amber-300 bg-amber-50" : "border-gray-200 bg-white"
                          }`}
                        >
                          <span className="font-medium">{formatMesAno(t.competencia)}</span>
                          <span className="mx-1 text-gray-300">·</span>
                          <span>{t.equipe ?? `CCU ${t.codccu}`}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
        {pessoas.length === 0 && (
          <div className="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-gray-400 shadow-sm">
            Nenhum registro no ledger ainda — a captura roda junto com a cascata mensal do Rito.
          </div>
        )}
      </div>
    </div>
  );
}
