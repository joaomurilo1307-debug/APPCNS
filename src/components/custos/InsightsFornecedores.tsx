"use client";

// Insights de FORNECEDORES de um centro de custo, so' com os lancamentos do Senior: (1) quanto o custo e' concentrado e quanto vem de
// fornecedor recorrente, (2) quem recebe o custo mes a mes, (3) quem subiu, quem entrou e quem saiu de um mes para o outro.

import { useMemo } from "react";
import { COR_DEMAIS, PALETA_GRUPOS, type Filtros } from "@/lib/custos/agregacao";
import { mesCurto, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { eReembolsavel, grupoDaConta } from "@/lib/custos/planoContas";
import { ColunasEmpilhadas, type SerieEmpilhada } from "./graficos";
import type { DadosLancamentos } from "./useLancamentos";
import { Cartao } from "./ui";

type Forn = { codFor: string; nome: string; total: number; porMes: number[]; mesesAtivos: number };

export default function InsightsFornecedores({ dados, filtros, busca, meses, mesAtual, mesAnterior, mesParcial }: { dados: DadosLancamentos; filtros: Filtros; busca: string; meses: string[]; mesAtual?: string; mesAnterior?: string; mesParcial?: string }) {
  const termo = busca.trim().toLowerCase();
  const { forns, total } = useMemo(() => {
    const m = new Map<string, Forn>();
    if (dados !== "carregando" && dados !== "erro") {
      for (const l of dados) {
        const reemb = l.contaCodigo !== null && eReembolsavel(l.contaCodigo);
        if (filtros.tipo === "reembolsavel" && !reemb) continue;
        if (filtros.tipo === "proprio" && reemb) continue;
        if (filtros.grupo !== "todos" && grupoDaConta(l.contaCodigo ?? 0).codigo !== filtros.grupo) continue;
        if (termo && !(l.fornecedor ?? "").toLowerCase().includes(termo) && !l.contaFinanceira.toLowerCase().includes(termo)) continue;
        const i = meses.indexOf(l.competencia);
        if (i < 0) continue;
        const f = m.get(l.codFor) ?? { codFor: l.codFor, nome: l.fornecedor ?? `código ${l.codFor}`, total: 0, porMes: new Array(meses.length).fill(0), mesesAtivos: 0 };
        f.porMes[i] += l.valorRateado;
        f.total += l.valorRateado;
        m.set(l.codFor, f);
      }
    }
    const forns = Array.from(m.values())
      .map((f) => ({ ...f, mesesAtivos: f.porMes.filter((v) => Math.abs(v) > 0.004).length }))
      .sort((a, b) => b.total - a.total);
    return { forns, total: forns.reduce((s, f) => s + f.total, 0) };
  }, [dados, filtros.tipo, filtros.grupo, termo, meses]);

  const carregando = dados === "carregando";
  const pesoDosTop = (n: number) => (total ? forns.slice(0, n).reduce((s, f) => s + f.total, 0) / total : 0);
  const recorrentes = forns.filter((f) => f.mesesAtivos >= 3);
  const pontuais = forns.filter((f) => f.mesesAtivos === 1);
  const pesoRecorrente = total ? recorrentes.reduce((s, f) => s + f.total, 0) / total : 0;
  const pesoPontual = total ? pontuais.reduce((s, f) => s + f.total, 0) / total : 0;

  const series: SerieEmpilhada[] = useMemo(() => {
    const topo = forns.slice(0, 6);
    const s: SerieEmpilhada[] = topo.map((f, k) => ({ chave: f.codFor, nome: f.nome, cor: PALETA_GRUPOS[k], valores: f.porMes }));
    const resto = forns.slice(6);
    if (resto.length) s.push({ chave: "demais", nome: `Outros ${resto.length} fornecedores`, cor: COR_DEMAIS, valores: meses.map((_, i) => resto.reduce((a, f) => a + f.porMes[i], 0)) });
    return s;
  }, [forns, meses]);

  // movimento de fornecedores entre os dois meses em analise
  const iAt = mesAtual ? meses.indexOf(mesAtual) : -1;
  const iAn = mesAnterior ? meses.indexOf(mesAnterior) : -1;
  const mov = useMemo(() => {
    if (iAt < 0 || iAn < 0) return null;
    const linha = forns.map((f) => ({ nome: f.nome, ant: f.porMes[iAn], atual: f.porMes[iAt], delta: f.porMes[iAt] - f.porMes[iAn] }));
    const subiram = linha.filter((x) => x.ant > 0 && x.atual > 0 && x.delta > 0.004).sort((a, b) => b.delta - a.delta);
    const entraram = linha.filter((x) => x.ant <= 0 && x.atual > 0).sort((a, b) => b.atual - a.atual);
    const sairam = linha.filter((x) => x.ant > 0 && x.atual <= 0).sort((a, b) => b.ant - a.ant);
    return { subiram, entraram, sairam };
  }, [forns, iAt, iAn]);

  if (carregando) return <Cartao titulo="Fornecedores: o que os números mostram"><div className="h-48 animate-pulse rounded-xl bg-gray-100" aria-busy /></Cartao>;
  if (dados === "erro") return <Cartao titulo="Fornecedores: o que os números mostram"><p className="py-6 text-center text-sm text-red-600">Não foi possível carregar os fornecedores.</p></Cartao>;
  if (forns.length === 0) return null;

  const lider = forns[0];
  const bloco = (titulo: string, cor: string, itens: { nome: string; valor: number; extra?: string }[], vazio: string, totalItens: number) => (
    <div className="min-w-0">
      <p className="mb-1.5 text-[13px] font-semibold" style={{ color: cor }}>
        {titulo} <span className="font-normal text-gray-400">· {totalItens}</span>
      </p>
      {itens.length === 0 ? (
        <p className="text-[13px] text-gray-400">{vazio}</p>
      ) : (
        <ul className="space-y-1">
          {itens.map((i) => (
            <li key={i.nome} className="flex items-baseline justify-between gap-2 text-[13.5px]">
              <span className="truncate text-gray-700" title={i.nome}>{i.nome}</span>
              <span className="shrink-0 tabular-nums font-medium text-gray-900" title={moeda(i.valor)}>
                {moedaCompacta(i.valor)} {i.extra && <span className="text-xs font-normal text-gray-400">{i.extra}</span>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  return (
    <Cartao titulo="Fornecedores: o que os números mostram" subtitulo="Concentração, recorrência e movimento de quem recebe o custo — tudo dos lançamentos do Senior neste período e filtro.">
      <div className="mb-4 grid grid-cols-2 gap-2 text-[13px] lg:grid-cols-4">
        <div className="rounded-xl bg-teal-50 px-3 py-2">
          <p className="text-teal-800">Fornecedores com custo</p>
          <p className="text-lg font-semibold tabular-nums text-teal-900">{forns.length}</p>
        </div>
        <div className="rounded-xl bg-amber-50 px-3 py-2" title={`Os 5 maiores fornecedores somam ${moeda(forns.slice(0, 5).reduce((s, f) => s + f.total, 0))}`}>
          <p className="text-amber-800">Os 5 maiores concentram</p>
          <p className="text-lg font-semibold tabular-nums text-amber-900">{percentual(pesoDosTop(5))}</p>
        </div>
        <div className="rounded-xl bg-sky-50 px-3 py-2" title={`${recorrentes.length} fornecedores com custo em 3 meses ou mais`}>
          <p className="text-sky-800">Vem de recorrentes (3+ meses)</p>
          <p className="text-lg font-semibold tabular-nums text-sky-900">{percentual(pesoRecorrente)}</p>
        </div>
        <div className="rounded-xl bg-violet-50 px-3 py-2" title={`${pontuais.length} fornecedores apareceram em um único mês`}>
          <p className="text-violet-800">Vem de pontuais (1 mês)</p>
          <p className="text-lg font-semibold tabular-nums text-violet-900">{percentual(pesoPontual)}</p>
        </div>
      </div>
      <p className="mb-3 text-[14px] text-gray-700">
        O maior fornecedor, <b>{lider.nome}</b>, recebeu <b>{moedaCompacta(lider.total)}</b> ({percentual(total ? lider.total / total : 0)} do custo) e aparece em {lider.mesesAtivos} {lider.mesesAtivos === 1 ? "mês" : "meses"} do período.
      </p>

      {meses.length > 1 && (
        <div className="mb-5">
          <p className="mb-1 text-[13px] font-semibold text-gray-700">Quem recebe o custo, mês a mês</p>
          <ColunasEmpilhadas meses={meses} series={series} mesDestaque={filtros.ate} mesParcial={mesParcial} altura={260} />
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-gray-600">
            {series.map((s) => (
              <span key={s.chave} className="inline-flex max-w-[16rem] items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: s.cor }} />
                <span className="truncate" title={s.nome}>{s.nome}</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {mov && mesAtual && mesAnterior && (
        <div>
          <p className="mb-2 text-[13px] font-semibold text-gray-700">
            Movimento de fornecedores: {mesCurto(mesAnterior)} → {mesCurto(mesAtual)}
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {bloco("Subiram mais", "#c2413a", mov.subiram.slice(0, 5).map((x) => ({ nome: x.nome, valor: x.delta, extra: `(${mesCurto(mesAtual)}: ${moedaCompacta(x.atual)})` })), "Nenhum fornecedor subiu.", mov.subiram.length)}
            {bloco("Entraram (não tinham custo no mês anterior)", "#6b4fd0", mov.entraram.slice(0, 5).map((x) => ({ nome: x.nome, valor: x.atual })), "Nenhum fornecedor novo.", mov.entraram.length)}
            {bloco("Saíram (sem custo neste mês)", "#4b5563", mov.sairam.slice(0, 5).map((x) => ({ nome: x.nome, valor: x.ant, extra: `(em ${mesCurto(mesAnterior)})` })), "Nenhum fornecedor saiu.", mov.sairam.length)}
          </div>
        </div>
      )}
    </Cartao>
  );
}
