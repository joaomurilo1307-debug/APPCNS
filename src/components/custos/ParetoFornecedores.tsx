"use client";

// Pareto de FORNECEDORES de um centro de custo: quem concentra o custo do periodo, com % e % acumulado. So' dado do Senior (os mesmos
// lancamentos da gaveta, via /api/custos-conta/lancamentos). Clicar num fornecedor mostra os titulos dele no periodo.

import { useEffect, useMemo, useState } from "react";
import type { BaseMes, Filtros } from "@/lib/custos/agregacao";
import { moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { eReembolsavel, grupoDaConta } from "@/lib/custos/planoContas";
import { Cartao } from "./ui";

type Lanc = { contaCodigo: number | null; contaFinanceira: string; numTit: string; codFor: string; fornecedor: string | null; valorRateado: number; competencia: string; dataPagamento?: string | null; formaBaixa?: string | null };

export default function ParetoFornecedores({ codccu, filtros, base, busca }: { codccu: string; filtros: Filtros; base: BaseMes; busca: string }) {
  const [dados, setDados] = useState<Lanc[] | "carregando" | "erro">("carregando");
  const [aberto, setAberto] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);

  useEffect(() => {
    let cancelado = false;
    setDados("carregando");
    setAberto(null);
    const qs = new URLSearchParams({ codccu, de: filtros.de, ate: filtros.ate, base });
    fetch(`/api/custos-conta/lancamentos?${qs.toString()}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelado && setDados(d.linhas as Lanc[]))
      .catch(() => !cancelado && setDados("erro"));
    return () => {
      cancelado = true;
    };
  }, [codccu, filtros.de, filtros.ate, base]);

  const termo = busca.trim().toLowerCase();
  const linhas = useMemo(() => {
    if (dados === "carregando" || dados === "erro") return [];
    return dados.filter((l) => {
      const reemb = l.contaCodigo !== null && eReembolsavel(l.contaCodigo);
      if (filtros.tipo === "reembolsavel" && !reemb) return false;
      if (filtros.tipo === "proprio" && reemb) return false;
      if (filtros.grupo !== "todos" && grupoDaConta(l.contaCodigo ?? 0).codigo !== filtros.grupo) return false;
      if (termo && !(l.fornecedor ?? "").toLowerCase().includes(termo) && !l.contaFinanceira.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [dados, filtros.tipo, filtros.grupo, termo]);

  const fornecedores = useMemo(() => {
    const m = new Map<string, { codFor: string; nome: string; total: number; qtd: number }>();
    for (const l of linhas) {
      const f = m.get(l.codFor) ?? { codFor: l.codFor, nome: l.fornecedor ?? `código ${l.codFor}`, total: 0, qtd: 0 };
      f.total += l.valorRateado;
      f.qtd += 1;
      m.set(l.codFor, f);
    }
    return Array.from(m.values()).sort((a, b) => b.total - a.total);
  }, [linhas]);

  const total = fornecedores.reduce((s, f) => s + f.total, 0);
  const mostrados = todos ? fornecedores.slice(0, 30) : fornecedores.slice(0, 10);
  const resto = fornecedores.slice(mostrados.length);
  let acum = 0;
  const detalhe = aberto ? linhas.filter((l) => l.codFor === aberto).sort((a, b) => b.valorRateado - a.valorRateado) : [];

  return (
    <Cartao
      titulo="Quem recebe o custo"
      subtitulo={`Fornecedores com mais custo no período · % do centro de custo e % acumulado · clique para ver os títulos${base === "competencia" ? " · por competência" : ""}`}
      acao={
        fornecedores.length > 10 ? (
          <button type="button" onClick={() => setTodos((t) => !t)} className="text-[13px] font-medium text-brand hover:text-brand-dark">
            {todos ? "mostrar só os 10 maiores" : "mostrar os 30 maiores"}
          </button>
        ) : undefined
      }
    >
      {dados === "carregando" && <div className="h-40 animate-pulse rounded-xl bg-gray-100" aria-busy />}
      {dados === "erro" && <p className="py-6 text-center text-sm text-red-600">Não foi possível carregar os fornecedores.</p>}
      {dados !== "carregando" && dados !== "erro" && fornecedores.length === 0 && <p className="py-6 text-center text-sm text-gray-500">Sem lançamentos neste período e filtro.</p>}
      {fornecedores.length > 0 && (
        <div className="space-y-1.5">
          {mostrados.map((f) => {
            acum += f.total;
            const pct = total ? f.total / total : 0;
            const sel = aberto === f.codFor;
            return (
              <button key={f.codFor} type="button" onClick={() => setAberto(sel ? null : f.codFor)} className={`block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-gray-50 ${sel ? "bg-brand-light/60 ring-1 ring-brand/40" : ""}`} title={`${f.nome}: ${moeda(f.total)} em ${f.qtd} lançamento(s)`}>
                <div className="flex items-baseline justify-between gap-3 text-[14px]">
                  <span className="truncate font-medium text-gray-800">{f.nome}</span>
                  <span className="shrink-0 tabular-nums text-gray-900">
                    {moedaCompacta(f.total)} <span className="text-gray-400">· {percentual(pct, pct < 0.1 ? 1 : 0)}</span> <span className="hidden text-xs text-gray-400 sm:inline">acum. {percentual(total ? acum / total : 0)}</span>
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-gray-100">
                  <div className="h-full rounded-full bg-[#0e9f94]" style={{ width: `${Math.max(1.5, pct * 100 * (1 / Math.max(0.0001, (fornecedores[0].total / total))))}%` }} />
                </div>
              </button>
            );
          })}
          {resto.length > 0 && (
            <p className="border-t border-gray-100 pt-2 text-xs text-gray-500">
              + {resto.length} fornecedores menores somam {moedaCompacta(resto.reduce((s, f) => s + f.total, 0))} ({percentual(total ? resto.reduce((s, f) => s + f.total, 0) / total : 0)})
            </p>
          )}
        </div>
      )}
      {aberto && detalhe.length > 0 && (
        <div className="mt-4 overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full text-[13px]">
            <thead className="bg-gray-50 text-left uppercase text-gray-400">
              <tr>
                <th className="px-3 py-2">Título</th>
                <th className="px-3 py-2">Conta</th>
                <th className="px-3 py-2">Pago em</th>
                <th className="px-3 py-2 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {detalhe.map((l, i) => (
                <tr key={`${l.numTit}-${i}`} className={i % 2 ? "bg-gray-50/60" : undefined}>
                  <td className="px-3 py-1.5 font-medium">{l.numTit}</td>
                  <td className="px-3 py-1.5 text-gray-600">{l.contaFinanceira}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 tabular-nums text-gray-600">
                    {l.dataPagamento ? l.dataPagamento.split("-").reverse().join("/") : l.competencia.split("-").reverse().join("/")}
                    {l.formaBaixa === "adiantamento" && <span className="ml-1.5 rounded-full bg-violet-100 px-1.5 py-0.5 text-[11px] font-medium text-violet-800">adiantamento</span>}
                  </td>
                  <td className="px-3 py-1.5 text-right font-medium tabular-nums">{moeda(l.valorRateado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Cartao>
  );
}
