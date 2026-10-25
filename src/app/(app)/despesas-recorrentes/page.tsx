"use client";

import { useEffect, useMemo, useState } from "react";
import BotaoExcel from "@/components/BotaoExcel";
import type { AbaExcel } from "@/lib/exportarExcel";

type Mes = { mes: string; previsto: number; realizado: number };
type Grupo = {
  chave: string;
  fornecedor: string;
  tipoValor: "FIXO" | "VARIAVEL" | "INDEFINIDO";
  baseTipoValor: "realizado" | "previsto";
  periodicidade: string;
  regraDia: string;
  meses: Mes[];
  proxima: { numTit: string; vencimento: string; valor: number } | null;
  previsoesAbertas: number;
  vencidasSemRealizado: number;
  vencidasComRealizado: number;
};

const moeda = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const data = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");
const nomeMes = (m: string) => `${m.slice(5)}/${m.slice(2, 4)}`;
const TIPO: Record<Grupo["tipoValor"], { rotulo: string; cor: string }> = {
  FIXO: { rotulo: "Fixo", cor: "bg-emerald-100 text-emerald-800" },
  VARIAVEL: { rotulo: "Variável", cor: "bg-sky-100 text-sky-800" },
  INDEFINIDO: { rotulo: "Indefinido", cor: "bg-gray-100 text-gray-500" },
};

export default function DespesasRecorrentesPage() {
  const [grupos, setGrupos] = useState<Grupo[]>([]);
  const [hoje, setHoje] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [busca, setBusca] = useState("");
  const [tipo, setTipo] = useState("");
  const [periodo, setPeriodo] = useState("");
  const [soAtencao, setSoAtencao] = useState(false);

  useEffect(() => {
    fetch("/api/financeiro/despesas-recorrentes")
      .then(async (r) => {
        const d = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(d.error || "Erro ao carregar");
        return d;
      })
      .then((d) => { setGrupos(d.grupos); setHoje(d.hoje); })
      .catch((e) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  const periodos = useMemo(() => [...new Set(grupos.map((g) => g.periodicidade))].sort(), [grupos]);
  const filtrados = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return grupos.filter(
      (g) => (!t || g.fornecedor.toLowerCase().includes(t)) && (!tipo || g.tipoValor === tipo) && (!periodo || g.periodicidade === periodo) &&
        (!soAtencao || g.vencidasSemRealizado > 0 || g.vencidasComRealizado > 0)
    );
  }, [grupos, busca, tipo, periodo, soAtencao]);
  const comAtencao = grupos.filter((g) => g.vencidasSemRealizado > 0).length;
  // planilha: as despesas da tela, com realizado e previsto de cada mes lado a lado
  function abasExcel(): AbaExcel[] {
    const meses = filtrados[0]?.meses ?? [];
    return [{
      nome: "Despesas recorrentes",
      observacao: `Previsões (PRV) lançadas no Senior x o que foi lançado do mesmo fornecedor · gerado em ${new Date().toLocaleString("pt-BR")} · ${filtrados.length} de ${grupos.length} despesas`,
      colunas: [
        { titulo: "Despesa", largura: 44 }, { titulo: "Valor", largura: 11 }, { titulo: "Periodicidade", largura: 16 }, { titulo: "Vencimento", largura: 16 },
        { titulo: "Próxima previsão", tipo: "data" }, { titulo: "Valor da próxima", tipo: "moeda" },
        ...meses.flatMap((m) => [{ titulo: `Realizado ${nomeMes(m.mes)}`, tipo: "moeda" as const }, { titulo: `Previsto ${nomeMes(m.mes)}`, tipo: "moeda" as const }]),
        { titulo: "Vencidas sem lançamento", tipo: "inteiro" as const }, { titulo: "Previsões antigas", tipo: "inteiro" as const },
      ],
      linhas: filtrados.map((g) => [
        g.fornecedor, TIPO[g.tipoValor].rotulo, g.periodicidade, g.regraDia, g.proxima?.vencimento ?? "", g.proxima?.valor ?? null,
        ...g.meses.flatMap((m) => [m.realizado || null, m.previsto || null]), g.vencidasSemRealizado, g.vencidasComRealizado,
      ]),
    }];
  }
  const mesAtual = hoje.slice(0, 7);

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-semibold">Despesas recorrentes</h1>
        <p className="mt-0.5 text-sm text-gray-500">
          Relatório (somente leitura) das despesas que a Consominas lança no Senior como <strong>previsão</strong> (tipo PRV), comparadas com o que
          foi de fato lançado do mesmo fornecedor. Nada é gravado aqui: para criar, mudar ou encerrar uma recorrência, use o Senior.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-3.5 shadow-sm">
        <input type="text" placeholder="Fornecedor ou despesa…" value={busca} onChange={(e) => setBusca(e.target.value)} className="w-56 rounded-lg border border-gray-200 px-3 py-1.5 text-sm" />
        <select value={tipo} onChange={(e) => setTipo(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
          <option value="">Fixo e variável</option>
          <option value="FIXO">Só fixas</option>
          <option value="VARIAVEL">Só variáveis</option>
          <option value="INDEFINIDO">Indefinidas</option>
        </select>
        <select value={periodo} onChange={(e) => setPeriodo(e.target.value)} className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm">
          <option value="">Todas as periodicidades</option>
          {periodos.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-sm text-gray-600">
          <input type="checkbox" checked={soAtencao} onChange={(e) => setSoAtencao(e.target.checked)} /> Só com previsão vencida
        </label>
        <BotaoExcel arquivo="despesas-recorrentes" gerar={abasExcel} desabilitado={carregando || filtrados.length === 0} />
        <span className="ml-auto text-sm text-gray-500">{filtrados.length} de {grupos.length} · <span className="text-red-700">{comAtencao} com previsão vencida sem lançamento</span></span>
      </div>

      {erro && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{erro}</p>}
      {carregando && <p className="py-8 text-center text-sm text-gray-400">Carregando…</p>}

      {!carregando && (
        <div className="overflow-x-auto rounded-xl border border-gray-100 bg-white shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-400">
              <tr>
                <th className="px-3 py-2">Despesa</th>
                <th className="px-3 py-2">Valor</th>
                <th className="px-3 py-2">Periodicidade</th>
                <th className="px-3 py-2">Vencimento</th>
                <th className="px-3 py-2">Próxima previsão</th>
                {filtrados[0]?.meses.map((m) => (
                  <th key={m.mes} className={`px-2 py-2 text-right ${m.mes === mesAtual ? "text-brand" : ""}`}>{nomeMes(m.mes)}</th>
                ))}
                <th className="px-3 py-2">Atenção</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.map((g, i) => (
                <tr key={g.chave} className={i % 2 === 1 ? "bg-gray-50/60" : undefined}>
                  <td className="max-w-[260px] px-3 py-1.5 font-medium text-gray-800" title={g.fornecedor}><span className="block truncate">{g.fornecedor}</span></td>
                  <td className="px-3 py-1.5">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${TIPO[g.tipoValor].cor}`} title={`Classificado pelo ${g.baseTipoValor === "realizado" ? "realizado dos últimos 6 meses" : "valor previsto (ainda sem histórico real suficiente)"}`}>
                      {TIPO[g.tipoValor].rotulo}
                    </span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-600">{g.periodicidade}</td>
                  <td className="px-3 py-1.5 text-gray-600">{g.regraDia}</td>
                  <td className="px-3 py-1.5 tabular-nums text-gray-600">{g.proxima ? <>{data(g.proxima.vencimento)} · {moeda(g.proxima.valor)}</> : "—"}</td>
                  {g.meses.map((m) => (
                    <td key={m.mes} className={`px-2 py-1.5 text-right text-[11px] tabular-nums ${m.mes === mesAtual ? "bg-brand/5" : ""}`}>
                      {m.previsto > 0 && <div className="text-gray-400" title="Previsto (títulos PRV em aberto)">{moeda(m.previsto)}</div>}
                      {m.realizado > 0 && <div className="font-medium text-gray-800" title="Realizado (títulos lançados no mês)">{moeda(m.realizado)}</div>}
                      {m.previsto === 0 && m.realizado === 0 && <span className="text-gray-300">—</span>}
                    </td>
                  ))}
                  <td className="px-3 py-1.5 text-[11px]">
                    {g.vencidasSemRealizado > 0 && <div className="text-red-700" title="Previsões vencidas em aberto sem nenhum lançamento do fornecedor no mês: a conta pode não ter chegado ou não ter sido lançada.">{g.vencidasSemRealizado} vencida(s) sem lançamento</div>}
                    {g.vencidasComRealizado > 0 && <div className="text-amber-700" title="Previsões vencidas ainda em aberto, mas o mês já teve lançamento real: previsão antiga que pode ser baixada no Senior.">{g.vencidasComRealizado} previsão(ões) antiga(s)</div>}
                  </td>
                </tr>
              ))}
              {filtrados.length === 0 && <tr><td colSpan={13} className="px-3 py-6 text-center text-gray-400">Nada encontrado.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-gray-400">
        Cinza = previsto (PRV em aberto no mês); preto = realizado (títulos do fornecedor com vencimento no mês). Fixo = soma mensal variando até 2%.
        “Dia útil” considera sábado/domingo, não feriados. Fonte: títulos sincronizados do Senior (E501TCP).
      </p>
    </div>
  );
}
