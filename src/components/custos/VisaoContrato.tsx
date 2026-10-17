"use client";

// Visao de UM contrato: KPIs, evolucao mensal por grupo, composicao do periodo por conta e a tabela plano de contas x mes
// (mapa de calor, agrupada por tipo, com subtotais). Clicar numa celula abre os lancamentos (titulo a titulo, com OC).

import { Fragment, useMemo, useState } from "react";
import {
  COR_DEMAIS,
  PALETA_GRUPOS,
  agruparPorGrupo,
  linhasDoContrato,
  soma,
  variacao,
  type ContratoCusto,
  type Filtros,
} from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { baixarCsv } from "@/lib/custos/csv";
import type { AlvoDetalhe } from "./DetalheConta";
import { BarrasRanking, ColunasEmpilhadas, LegendaGrupos, estiloCelulaCalor, type SerieEmpilhada } from "./graficos";
import { Cartao, Kpi, SeloReembolsavel, Variacao, VazioPeriodo } from "./ui";

export default function VisaoContrato({
  contrato,
  filtros,
  mesesAsc,
  mesCorrente,
  busca,
  cores,
  onVoltar,
  onAbrirDetalhe,
}: {
  contrato: ContratoCusto;
  filtros: Filtros;
  mesesAsc: string[];
  mesCorrente: string;
  busca: string;
  cores: Map<string, string>;
  onVoltar: () => void;
  onAbrirDetalhe: (alvo: AlvoDetalhe) => void;
}) {
  const [agrupar, setAgrupar] = useState(true);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());

  const idxDe = Math.max(0, mesesAsc.indexOf(filtros.de));
  const idxAte = Math.max(idxDe, mesesAsc.indexOf(filtros.ate));
  const mesesP = mesesAsc.slice(idxDe, idxAte + 1);
  const refParcial = filtros.ate === mesCorrente;

  const todas = useMemo(() => linhasDoContrato(contrato, filtros, mesesAsc, busca), [contrato, filtros, mesesAsc, busca]);
  const linhas = useMemo(
    () =>
      todas
        .map((l) => {
          const serieP = l.serie.slice(idxDe, idxAte + 1);
          return { ...l, serieP, totalP: soma(serieP), ref: l.serie[idxAte] ?? 0, ant: idxAte > 0 ? l.serie[idxAte - 1] : 0 };
        })
        .filter((l) => l.totalP !== 0)
        .sort((a, b) => b.totalP - a.totalP),
    [todas, idxDe, idxAte]
  );
  const grupos = useMemo(
    () =>
      agruparPorGrupo(
        linhas.map((l) => ({ conta: l.conta, serie: l.serieP, total: l.totalP })),
        mesesP.length
      ),
    [linhas, mesesP.length]
  );

  const totalP = soma(linhas.map((l) => l.totalP));
  const totalRef = soma(linhas.map((l) => l.ref));
  const totalAnt = soma(linhas.map((l) => l.ant));
  const totaisMes = mesesP.map((_, i) => soma(linhas.map((l) => l.serieP[i])));
  const reemb = soma(linhas.filter((l) => l.conta.reembolsavel).map((l) => l.totalP));
  const maiorConta = linhas[0];
  const mesesComCusto = totaisMes.filter((t) => t !== 0).length;

  // grafico: por grupo (cor segue o grupo no sistema todo)
  const { series, legenda } = useMemo(() => {
    const lista = grupos.map((g) => ({ codigo: g.grupoCodigo, nome: g.grupoNome, valores: g.serie, total: g.total, cor: cores.get(g.grupoCodigo) ?? COR_DEMAIS }));
    const proprios = lista.filter((g) => g.cor !== COR_DEMAIS).sort((a, b) => PALETA_GRUPOS.indexOf(a.cor as any) - PALETA_GRUPOS.indexOf(b.cor as any));
    const demais = lista.filter((g) => g.cor === COR_DEMAIS);
    const s: SerieEmpilhada[] = proprios.map((g) => ({ chave: g.codigo, nome: g.nome, cor: g.cor, valores: g.valores }));
    const lg = proprios.map((g) => ({ chave: g.codigo, nome: g.nome, cor: g.cor, total: g.total }));
    if (demais.length) {
      const valores = mesesP.map((_, i) => soma(demais.map((d) => d.valores[i])));
      s.push({ chave: "demais", nome: "Demais grupos", cor: COR_DEMAIS, valores });
      lg.push({ chave: "demais", nome: "Demais grupos", cor: COR_DEMAIS, total: soma(valores) });
    }
    return { series: s, legenda: lg };
  }, [grupos, cores, mesesP]);

  function exportar() {
    const cab = ["Grupo", "Conta financeira", "Reembolsável", ...mesesP.map(mesCurto), "Total do período", "% do contrato"];
    const corpo: (string | number)[][] = [];
    for (const g of grupos) for (const l of g.linhas) corpo.push([g.grupoNome, l.conta.contaFinanceira, l.conta.reembolsavel ? "sim" : "não", ...l.serie, l.total, totalP ? l.total / totalP : 0]);
    corpo.push(["", "TOTAL", "", ...totaisMes, totalP, 1]);
    baixarCsv(`custo_${contrato.codccu}_${contrato.nome.replace(/[^\w]+/g, "_").slice(0, 40)}_${filtros.de}_a_${filtros.ate}.csv`, [cab, ...corpo]);
  }

  function abrir(conta: string, mesIdx: number, valor: number, reembolsavel: boolean) {
    onAbrirDetalhe({ codccu: contrato.codccu, contrato: contrato.nome, conta, competencia: `${mesesP[mesIdx]}-01T00:00:00.000Z`, valor, reembolsavel });
  }

  const alternarGrupo = (g: string) =>
    setFechados((atual) => {
      const n = new Set(atual);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const celula = (v: number, max: number, mesIdx: number, conta: string, reembolsavel: boolean, tamanho = "text-xs") =>
    v ? (
      <button
        type="button"
        onClick={() => abrir(conta, mesIdx, v, reembolsavel)}
        className={`block w-full rounded-md px-1.5 py-1 text-right tabular-nums ${tamanho} transition hover:ring-2 hover:ring-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
        style={estiloCelulaCalor(v, max)}
        title={`${conta} · ${mesLongo(mesesP[mesIdx])}: ${moeda(v)} — clique para ver os lançamentos`}
      >
        {moedaCompacta(v).replace("R$ ", "")}
      </button>
    ) : (
      <span className="block px-1.5 py-1 text-right text-xs text-gray-300">–</span>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <button type="button" onClick={onVoltar} className="mb-1 inline-flex items-center gap-1 text-xs font-medium text-brand hover:text-brand-dark">
            ← Todos os contratos
          </button>
          <h2 className="truncate text-2xl font-semibold tracking-tight text-gray-900">{contrato.nome}</h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
            <span className="rounded-md bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">CCU {contrato.codccu}</span>
            {contrato.teamName ? <span>Equipe {contrato.teamName}</span> : <span className="text-amber-700">sem equipe vinculada</span>}
            {contrato.projectName && <span className="text-gray-400">· {contrato.projectName}</span>}
          </p>
        </div>
      </div>

      {linhas.length === 0 ? (
        <VazioPeriodo />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Kpi rotulo="Custo no período" valor={moedaCompacta(totalP)} detalhe={`${mesesComCusto} ${mesesComCusto === 1 ? "mês" : "meses"} com custo · ${linhas.length} contas`} destaque />
            <Kpi
              rotulo={`Mês de referência · ${mesCurto(filtros.ate)}`}
              valor={moedaCompacta(totalRef)}
              detalhe={refParcial ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">em andamento · só o já pago</span> : <Variacao v={variacao(totalRef, totalAnt)} sufixo="vs mês anterior" />}
            />
            <Kpi rotulo="Média mensal" valor={moedaCompacta(mesesP.length ? totalP / mesesP.length : 0)} detalhe={`em ${mesesP.length} ${mesesP.length === 1 ? "mês" : "meses"} do período`} />
            <Kpi rotulo="Maior conta" valor={<span className="block truncate text-lg">{maiorConta.conta.contaFinanceira}</span>} detalhe={`${moedaCompacta(maiorConta.totalP)} · ${percentual(maiorConta.totalP / totalP)} do contrato`} />
            <Kpi rotulo="Reembolsável" valor={moedaCompacta(reemb)} detalhe={`${percentual(totalP ? reemb / totalP : 0, totalP && reemb / totalP < 0.1 ? 1 : 0)} do custo no período`} />
          </div>

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <Cartao
              titulo="Evolução mensal por tipo de custo"
              subtitulo={
                <>
                  Cada coluna é um mês; o número no topo é o total{refParcial && <> · <span className="font-medium">* mês em andamento</span></>}
                </>
              }
            >
              <div className="mb-3">
                <LegendaGrupos
                  itens={legenda}
                  ocultos={ocultos}
                  onAlternar={(c) =>
                    setOcultos((atual) => {
                      const n = new Set(atual);
                      if (n.has(c)) n.delete(c);
                      else n.add(c);
                      return n;
                    })
                  }
                />
              </div>
              <ColunasEmpilhadas meses={mesesP} series={series.filter((s) => !ocultos.has(s.chave))} mesDestaque={filtros.ate} mesParcial={refParcial ? mesCorrente : undefined} altura={360} />
            </Cartao>

            <Cartao titulo="Onde o custo está" subtitulo={`As ${Math.min(8, linhas.length)} maiores contas do período · a cor é o tipo de custo`}>
              <BarrasRanking
                itens={linhas.slice(0, 8).map((l) => ({
                  chave: l.conta.contaFinanceira,
                  rotulo: l.conta.contaFinanceira,
                  subrotulo: l.conta.grupoNome,
                  valor: l.totalP,
                  cor: cores.get(l.conta.grupoCodigo) ?? COR_DEMAIS,
                  serie: l.serieP,
                  selo: l.conta.reembolsavel ? <SeloReembolsavel curto /> : undefined,
                }))}
                total={totalP}
              />
              {linhas.length > 8 && (
                <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
                  + {linhas.length - 8} contas menores somam {moedaCompacta(soma(linhas.slice(8).map((l) => l.totalP)))} ({percentual(soma(linhas.slice(8).map((l) => l.totalP)) / totalP)})
                </p>
              )}
            </Cartao>
          </div>

          <Cartao
            titulo="Plano de contas × mês"
            subtitulo="Cada célula é clicável: abre os lançamentos (título a título, com a OC). A cor mostra os meses mais pesados de cada conta."
            acao={
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="h-3.5 w-3.5 accent-[#00A99D]" />
                  Agrupar por tipo
                </label>
                <button type="button" onClick={exportar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50">
                  Exportar CSV
                </button>
              </div>
            }
          >
            <div className="-mx-5 overflow-x-auto px-5">
              <table className="w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
                    <th className="sticky left-0 z-10 min-w-[17rem] border-b border-gray-200 bg-white py-2 pr-3 font-semibold">Conta financeira</th>
                    {mesesP.map((m) => (
                      <th key={m} className="border-b border-gray-200 px-1.5 py-2 text-right font-semibold">
                        {mesCurto(m)}
                        {m === mesCorrente ? "*" : ""}
                      </th>
                    ))}
                    <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">Total</th>
                    <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">%</th>
                  </tr>
                </thead>
                <tbody>
                  {agrupar
                    ? grupos.map((g) => {
                        const fechado = fechados.has(g.grupoCodigo);
                        const cor = cores.get(g.grupoCodigo) ?? COR_DEMAIS;
                        const maxG = Math.max(...g.serie, 0);
                        return (
                          <Fragment key={g.grupoCodigo}>
                            <tr className="cursor-pointer bg-gray-50/80" onClick={() => alternarGrupo(g.grupoCodigo)}>
                              <td className="sticky left-0 z-10 border-b border-gray-100 bg-gray-50 py-2 pr-3">
                                <span className="flex items-center gap-2 font-semibold text-gray-800">
                                  <span className="w-3 text-[10px] text-gray-400">{fechado ? "▶" : "▼"}</span>
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cor }} />
                                  {g.grupoNome}
                                  <span className="text-[11px] font-normal text-gray-400">{g.linhas.length} {g.linhas.length === 1 ? "conta" : "contas"}</span>
                                </span>
                              </td>
                              {g.serie.map((v, i) => (
                                <td key={i} className="border-b border-gray-100 px-1.5 py-2 text-right text-xs font-semibold tabular-nums text-gray-700">
                                  {v ? moedaCompacta(v).replace("R$ ", "") : <span className="font-normal text-gray-300">–</span>}
                                </td>
                              ))}
                              <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{moeda(g.total)}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-right text-xs tabular-nums text-gray-500">{percentual(totalP ? g.total / totalP : 0, 1)}</td>
                            </tr>
                            {!fechado &&
                              g.linhas.map((l) => {
                                const max = Math.max(...l.serie, 0);
                                return (
                                  <tr key={l.conta.contaFinanceira} className="hover:bg-gray-50/70">
                                    <td className="sticky left-0 z-10 border-b border-gray-100 bg-white py-1 pl-7 pr-3">
                                      <span className="flex items-center gap-1.5 text-gray-700">
                                        <span className="truncate" title={l.conta.contaFinanceira}>
                                          {l.conta.contaFinanceira}
                                        </span>
                                        {l.conta.reembolsavel && <SeloReembolsavel curto />}
                                      </span>
                                    </td>
                                    {l.serie.map((v, i) => (
                                      <td key={i} className="border-b border-gray-100 p-0.5">
                                        {celula(v, max, i, l.conta.contaFinanceira, l.conta.reembolsavel)}
                                      </td>
                                    ))}
                                    <td className="border-b border-gray-100 px-3 py-1 text-right tabular-nums text-gray-800">{moeda(l.total)}</td>
                                    <td className="border-b border-gray-100 px-3 py-1 text-right text-xs tabular-nums text-gray-400">{percentual(totalP ? l.total / totalP : 0, 1)}</td>
                                  </tr>
                                );
                              })}
                          </Fragment>
                        );
                      })
                    : linhas.map((l) => {
                        const max = Math.max(...l.serieP, 0);
                        return (
                          <tr key={l.conta.contaFinanceira} className="hover:bg-gray-50/70">
                            <td className="sticky left-0 z-10 border-b border-gray-100 bg-white py-1 pr-3">
                              <span className="flex items-center gap-1.5 text-gray-700">
                                <span className="truncate" title={l.conta.contaFinanceira}>
                                  {l.conta.contaFinanceira}
                                </span>
                                {l.conta.reembolsavel && <SeloReembolsavel curto />}
                              </span>
                            </td>
                            {l.serieP.map((v, i) => (
                              <td key={i} className="border-b border-gray-100 p-0.5">
                                {celula(v, max, i, l.conta.contaFinanceira, l.conta.reembolsavel)}
                              </td>
                            ))}
                            <td className="border-b border-gray-100 px-3 py-1 text-right tabular-nums text-gray-800">{moeda(l.totalP)}</td>
                            <td className="border-b border-gray-100 px-3 py-1 text-right text-xs tabular-nums text-gray-400">{percentual(totalP ? l.totalP / totalP : 0, 1)}</td>
                          </tr>
                        );
                      })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="sticky left-0 z-10 bg-gray-100 py-2.5 pr-3 text-gray-800">Total do contrato</td>
                    {totaisMes.map((v, i) => (
                      <td key={i} className="bg-gray-100 px-1.5 py-2.5 text-right text-xs tabular-nums text-gray-800">
                        {v ? moedaCompacta(v).replace("R$ ", "") : "–"}
                      </td>
                    ))}
                    <td className="bg-gray-100 px-3 py-2.5 text-right tabular-nums text-gray-900">{moeda(totalP)}</td>
                    <td className="bg-gray-100 px-3 py-2.5 text-right text-xs text-gray-500">100%</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Cartao>
        </>
      )}
    </div>
  );
}
