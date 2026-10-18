"use client";

// Visao do portfolio: todos os centros de custo que o usuario pode ver. KPIs, custo mensal por grupo, ranking e a
// tabela centro de custo x mes (clique abre o centro de custo).

import { Fragment, useMemo, useState } from "react";
import {
  COR_DEMAIS,
  PALETA_GRUPOS,
  contaPassa,
  linhasDoPortfolio,
  maioresMovimentos,
  mediaDoPeriodo,
  passosDaPonte,
  serieDaConta,
  soma,
  variacao,
  variacoesMensais,
  type ContratoCusto,
  type Filtros,
} from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { baixarCsv } from "@/lib/custos/csv";
import { BarrasRanking, ColunasEmpilhadas, LegendaGrupos, Sparkline, estiloCelulaCalor, type SerieEmpilhada } from "./graficos";
import { BarrasVariacao, Cascata, LegendaLinha, LinhaAcompanhamento, TabelaMovimentos } from "./acompanhamento";
import { Cartao, Kpi, Variacao, VazioPeriodo } from "./ui";

type Ordem = "total" | "nome" | "ultimo" | "variacao";

export default function VisaoGeral({
  contratos,
  filtros,
  mesesAsc,
  mesCorrente,
  busca,
  cores,
  onAbrirContrato,
}: {
  contratos: ContratoCusto[];
  filtros: Filtros;
  mesesAsc: string[];
  mesCorrente: string;
  busca: string;
  cores: Map<string, string>;
  onAbrirContrato: (codccu: string) => void;
}) {
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [ordem, setOrdem] = useState<Ordem>("total");
  const [desc, setDesc] = useState(true);
  const [modo, setModo] = useState<"mensal" | "acumulado">("mensal");
  const [mostrarMedia, setMostrarMedia] = useState(true);
  const [mostrarMM3, setMostrarMM3] = useState(true);
  const [baixando, setBaixando] = useState(false);

  const idxDe = Math.max(0, mesesAsc.indexOf(filtros.de));
  const idxAte = Math.max(idxDe, mesesAsc.indexOf(filtros.ate));
  const mesesP = mesesAsc.slice(idxDe, idxAte + 1);
  const refParcial = filtros.ate === mesCorrente;

  const linhas = useMemo(() => {
    return linhasDoPortfolio(contratos, filtros, mesesAsc, busca)
      .map((l) => {
        const serieP = l.serie.slice(idxDe, idxAte + 1);
        const ref = l.serie[idxAte] ?? 0;
        const ant = idxAte > 0 ? l.serie[idxAte - 1] : 0;
        return { ...l, serieP, totalP: soma(serieP), media: mesesP.length ? soma(serieP) / mesesP.length : 0, ref, delta: variacao(ref, ant) };
      })
      .filter((l) => l.totalP !== 0);
  }, [contratos, filtros, mesesAsc, busca, idxDe, idxAte, mesesP.length]);

  const totalP = soma(linhas.map((l) => l.totalP));
  const totalRef = soma(linhas.map((l) => l.ref));
  const totalAnt = idxAte > 0 ? soma(linhas.map((l) => l.serie[idxAte - 1] ?? 0)) : 0;
  const maior = linhas[0];

  // reembolsavel x proprio (ignora o filtro de tipo, respeita periodo/grupo/busca)
  const reparto = useMemo(() => {
    let reemb = 0;
    let reembR = 0;
    let proprio = 0;
    const termo = busca.trim().toLowerCase();
    for (const c of contratos) {
      if (termo && !c.nome.toLowerCase().includes(termo) && !c.codccu.includes(termo) && !(c.teamName ?? "").toLowerCase().includes(termo)) continue;
      for (const conta of c.contas) {
        if (!contaPassa(conta, { tipo: "todos", grupo: filtros.grupo })) continue;
        const v = soma(serieDaConta(conta, mesesP));
        if (conta.reembolsavel) reemb += v;
        if (conta.grupoCodigo === "reembR") reembR += v;
        else proprio += v;
      }
    }
    return { reemb, reembR, reembAntiga: reemb - reembR, proprio };
  }, [contratos, filtros.grupo, busca, mesesP]);

  // series do grafico: custo mensal por grupo (6 maiores com cor propria, resto em "Demais")
  const { series, legenda } = useMemo(() => {
    const porGrupo = new Map<string, { nome: string; valores: number[]; total: number }>();
    for (const l of linhas) {
      for (const conta of l.contrato.contas) {
        if (!contaPassa(conta, filtros)) continue;
        const s = serieDaConta(conta, mesesP);
        if (!s.some((v) => v !== 0)) continue;
        const g = porGrupo.get(conta.grupoCodigo) ?? { nome: conta.grupoNome, valores: mesesP.map(() => 0), total: 0 };
        s.forEach((v, i) => (g.valores[i] += v));
        g.total += soma(s);
        porGrupo.set(conta.grupoCodigo, g);
      }
    }
    const lista = Array.from(porGrupo.entries()).map(([codigo, g]) => ({ codigo, ...g, cor: cores.get(codigo) ?? COR_DEMAIS }));
    const proprios = lista.filter((g) => g.cor !== COR_DEMAIS).sort((a, b) => PALETA_GRUPOS.indexOf(a.cor as any) - PALETA_GRUPOS.indexOf(b.cor as any));
    const demais = lista.filter((g) => g.cor === COR_DEMAIS);
    const todas: SerieEmpilhada[] = proprios.map((g) => ({ chave: g.codigo, nome: g.nome, cor: g.cor, valores: g.valores }));
    const itensLegenda = proprios.map((g) => ({ chave: g.codigo, nome: g.nome, cor: g.cor, total: g.total }));
    if (demais.length) {
      const valores = mesesP.map((_, i) => soma(demais.map((d) => d.valores[i])));
      todas.push({ chave: "demais", nome: "Demais grupos", cor: COR_DEMAIS, valores });
      itensLegenda.push({ chave: "demais", nome: "Demais grupos", cor: COR_DEMAIS, total: soma(valores) });
    }
    return { series: todas, legenda: itensLegenda };
  }, [linhas, filtros, mesesP, cores]);

  const seriesVisiveis = series.filter((s) => !ocultos.has(s.chave));

  const ordenadas = useMemo(() => {
    const dir = desc ? -1 : 1;
    return [...linhas].sort((a, b) => {
      if (ordem === "nome") return -dir * a.contrato.nome.localeCompare(b.contrato.nome, "pt-BR");
      if (ordem === "ultimo") return dir * (a.ref - b.ref);
      if (ordem === "variacao") return dir * ((a.delta ?? -Infinity) - (b.delta ?? -Infinity));
      return dir * (a.totalP - b.totalP);
    });
  }, [linhas, ordem, desc]);

  // acompanhamento do total e ponte (mes de referencia contra o anterior; se o mes esta em andamento, os dois ultimos FECHADOS)
  const totaisMes = mesesP.map((_, i) => soma(linhas.map((l) => l.serieP[i])));
  const mediaFechada = mediaDoPeriodo(totaisMes, refParcial);
  const variacoes = variacoesMensais(totaisMes, refParcial);
  const iPonte = refParcial ? idxAte - 1 : idxAte;
  const ponte = useMemo(() => {
    if (iPonte <= 0) return null;
    const porGrupo = new Map<string, { nome: string; anterior: number; atual: number }>();
    for (const l of linhas) {
      for (const conta of l.contrato.contas) {
        if (!contaPassa(conta, filtros)) continue;
        const s = serieDaConta(conta, mesesAsc);
        const g = porGrupo.get(conta.grupoNome) ?? { nome: conta.grupoNome, anterior: 0, atual: 0 };
        g.anterior += s[iPonte - 1] ?? 0;
        g.atual += s[iPonte] ?? 0;
        porGrupo.set(conta.grupoNome, g);
      }
    }
    const grupos2 = Array.from(porGrupo.values());
    const centros = linhas.map((l) => ({ nome: l.contrato.nome, anterior: l.serie[iPonte - 1] ?? 0, atual: l.serie[iPonte] ?? 0 }));
    return { inicio: soma(grupos2.map((g) => g.anterior)), fim: soma(grupos2.map((g) => g.atual)), passos: passosDaPonte(grupos2, 5), movimentos: maioresMovimentos(centros, 6) };
  }, [linhas, filtros, mesesAsc, iPonte]);

  async function exportarLancamentos() {
    setBaixando(true);
    try {
      const qs = new URLSearchParams({ codccu: "todos", de: filtros.de, ate: filtros.ate });
      const res = await fetch(`/api/custos-conta/lancamentos?${qs.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao buscar os lançamentos");
      const d = await res.json();
      const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
      const cab = ["Centro de Custo", "Descrição Centro de Custo", "Competência", "Conta Financeira", "Descrição Conta Financeira", "Número do Título", "Código do Fornecedor", "Descrição do Fornecedor", "Data de Entrada", "Data de Vencimento", "Valor Rateio"];
      const corpo = (d.linhas as any[]).map((l) => [l.codccu, l.centroDeCusto, l.competencia.split("-").reverse().join("/"), l.contaCodigo ?? "", l.contaFinanceira, l.numTit, l.codFor, l.fornecedor ?? "", br(l.dataEntrada), br(l.dataVencimento), l.valorRateado]);
      corpo.push(["", "TOTAL", "", "", "", "", "", "", "", "", d.total]);
      baixarCsv(`lancamentos_todos_${filtros.de}_a_${filtros.ate}.csv`, [cab, ...corpo]);
    } catch (e: any) {
      alert(e?.message || "Não foi possível exportar os lançamentos.");
    } finally {
      setBaixando(false);
    }
  }

  function ordenarPor(o: Ordem) {
    if (ordem === o) setDesc(!desc);
    else {
      setOrdem(o);
      setDesc(o !== "nome");
    }
  }

  function exportar() {
    const cab = ["CCU", "Centro de custo", "Equipe", ...mesesP.map(mesCurto), "Total do período", "Média mensal"];
    const corpo = ordenadas.map((l) => [l.contrato.codccu, l.contrato.nome, l.contrato.teamName ?? "", ...l.serieP, l.totalP, l.media]);
    corpo.push(["", "TOTAL", "", ...mesesP.map((_, i) => soma(ordenadas.map((l) => l.serieP[i]))), totalP, mesesP.length ? totalP / mesesP.length : 0]);
    baixarCsv(`custo-por-centro-de-custo_${filtros.de}_a_${filtros.ate}.csv`, [cab, ...corpo]);
  }

  if (linhas.length === 0) return <VazioPeriodo />;

  const topo = linhas.slice(0, 10);
  const SetaOrdem = ({ o }: { o: Ordem }) => <span className="ml-0.5 text-[9px] text-gray-400">{ordem === o ? (desc ? "▼" : "▲") : ""}</span>;
  const pctReemb = reparto.reemb + reparto.proprio > 0 ? reparto.reemb / (reparto.reemb + reparto.proprio) : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Custo no período" valor={moedaCompacta(totalP)} detalhe={`${linhas.length} centros de custo · ${mesesP.length} ${mesesP.length === 1 ? "mês" : "meses"}`} destaque />
        <Kpi
          rotulo={`Mês de referência · ${mesCurto(filtros.ate)}`}
          valor={moedaCompacta(totalRef)}
          detalhe={
            refParcial ? (
              <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">em andamento · só o que já foi pago</span>
            ) : (
              <Variacao v={variacao(totalRef, totalAnt)} sufixo="vs mês anterior" />
            )
          }
        />
        <Kpi rotulo="Maior centro de custo" valor={<span className="text-lg">{maior.contrato.nome}</span>} detalhe={`${moedaCompacta(maior.totalP)} · ${percentual(maior.totalP / totalP)} do total`} />
        <Kpi rotulo="Reembolsável" valor={moedaCompacta(reparto.reemb)} detalhe={`${percentual(pctReemb, pctReemb < 0.1 ? 1 : 0)} do custo · conta antiga ${moedaCompacta(reparto.reembAntiga)} · contas R ${moedaCompacta(reparto.reembR)}`} />
      </div>

      <Cartao
        titulo="Acompanhamento mensal — todos os centros de custo"
        subtitulo={
          <>
            {modo === "acumulado" ? "Quanto já foi acumulado ao longo do período" : "Linha do custo total de cada mês contra a média e a tendência"}
            {refParcial && <> · <span className="font-medium">* mês em andamento (só o já pago)</span></>}
          </>
        }
        acao={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-gray-600">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200" role="group">
              {(["mensal", "acumulado"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setModo(k)} className={`px-3 py-1.5 text-[13px] font-medium ${modo === k ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {k === "mensal" ? "Mensal" : "Acumulado"}
                </button>
              ))}
            </div>
            {modo === "mensal" && (
              <>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={mostrarMedia} onChange={(e) => setMostrarMedia(e.target.checked)} className="h-4 w-4 accent-[#00A99D]" /> Média
                </label>
                <label className="flex cursor-pointer items-center gap-1.5">
                  <input type="checkbox" checked={mostrarMM3} onChange={(e) => setMostrarMM3(e.target.checked)} className="h-4 w-4 accent-[#00A99D]" /> Média móvel 3 meses
                </label>
              </>
            )}
          </div>
        }
      >
        <div className="mb-3">
          <LegendaLinha modo={modo} mostrarMedia={mostrarMedia} mostrarMediaMovel={mostrarMM3} temMeta={false} />
        </div>
        <LinhaAcompanhamento meses={mesesP} valores={totaisMes} mesParcial={refParcial ? mesCorrente : undefined} mesDestaque={filtros.ate} modo={modo} mostrarMedia={mostrarMedia} mostrarMediaMovel={mostrarMM3} />
        {modo === "mensal" && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Variação contra o mês anterior <span className="font-normal text-gray-500">· média dos meses fechados {moedaCompacta(mediaFechada)}</span>
            </h3>
            <BarrasVariacao meses={mesesP} variacoes={variacoes} />
          </div>
        )}
      </Cartao>

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
        <Cartao
          titulo="Custo mensal por tipo de custo"
          subtitulo={
            <>
              Soma de todos os centros de custo · clique na legenda para ocultar um grupo{refParcial && <> · <span className="font-medium">* mês em andamento</span></>}
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
          <ColunasEmpilhadas meses={mesesP} series={seriesVisiveis} mesDestaque={filtros.ate} mesParcial={refParcial ? mesCorrente : undefined} altura={400} />
        </Cartao>

        <Cartao titulo="Ranking de centros de custo" subtitulo={`Os ${topo.length} maiores no período · clique para abrir`}>
          <BarrasRanking
            itens={topo.map((l) => ({
              chave: l.contrato.codccu,
              rotulo: l.contrato.nome,
              subrotulo: `CCU ${l.contrato.codccu}${l.contrato.teamName ? ` · ${l.contrato.teamName}` : ""}`,
              valor: l.totalP,
              cor: PALETA_GRUPOS[0],
              serie: l.serieP,
            }))}
            total={totalP}
            onClick={onAbrirContrato}
          />
        </Cartao>
      </div>

      {ponte && (
        <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <Cartao
            titulo={`O que mudou: ${mesCurto(mesesAsc[iPonte - 1])} → ${mesCurto(mesesAsc[iPonte])}`}
            subtitulo={`Ponte do custo total por tipo de custo${refParcial ? " · compara os dois últimos meses fechados" : ""} · vermelho = custo subiu, verde = custo caiu`}
          >
            <Cascata rotuloInicio={mesCurto(mesesAsc[iPonte - 1])} valorInicio={ponte.inicio} rotuloFim={mesCurto(mesesAsc[iPonte])} valorFim={ponte.fim} passos={ponte.passos} />
          </Cartao>
          <Cartao titulo="Maiores variações por centro de custo" subtitulo={`${mesLongo(mesesAsc[iPonte - 1])} contra ${mesLongo(mesesAsc[iPonte])}`}>
            <div className="space-y-5">
              <TabelaMovimentos titulo="Maiores altas" itens={ponte.movimentos.altas} tom="alta" rotuloAnterior={mesCurto(mesesAsc[iPonte - 1])} rotuloAtual={mesCurto(mesesAsc[iPonte])} />
              <TabelaMovimentos titulo="Maiores quedas" itens={ponte.movimentos.quedas} tom="queda" rotuloAnterior={mesCurto(mesesAsc[iPonte - 1])} rotuloAtual={mesCurto(mesesAsc[iPonte])} />
            </div>
          </Cartao>
        </div>
      )}

      <Cartao
        titulo="Centros de custo × meses"
        subtitulo="A cor de cada linha mostra os meses mais pesados daquele centro de custo (escala própria por linha) · clique na linha para abrir"
        acao={
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50">
              Exportar quadro (CSV)
            </button>
            <button
              type="button"
              onClick={exportarLancamentos}
              disabled={baixando}
              title="Todos os lançamentos do período, título a título, no layout do Rel114 do Senior (disponível para quem vê todos os centros de custo)"
              className="rounded-lg border border-brand px-3 py-1.5 text-[13px] font-medium text-brand transition hover:bg-brand-light disabled:opacity-60"
            >
              {baixando ? "Gerando…" : "Exportar lançamentos (Rel114)"}
            </button>
          </div>
        }
      >
        <div className="-mx-5 overflow-x-auto px-5">
          <table className="w-full border-separate border-spacing-0 text-[15px]">
            <thead>
              <tr className="text-left text-[13px] uppercase tracking-wide text-gray-500">
                <th className="sticky left-0 z-10 min-w-[15rem] border-b border-gray-200 bg-white py-2 pr-3">
                  <button type="button" onClick={() => ordenarPor("nome")} className="font-semibold uppercase hover:text-gray-800">
                    Centro de custo <SetaOrdem o="nome" />
                  </button>
                </th>
                {mesesP.map((m) => (
                  <th key={m} className="border-b border-gray-200 px-2 py-2 text-right font-semibold">
                    {mesCurto(m)}
                    {m === mesCorrente ? "*" : ""}
                  </th>
                ))}
                <th className="border-b border-gray-200 px-3 py-2 text-right">
                  <button type="button" onClick={() => ordenarPor("total")} className="font-semibold uppercase hover:text-gray-800">
                    Total <SetaOrdem o="total" />
                  </button>
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">Média/mês</th>
                <th className="border-b border-gray-200 px-3 py-2 text-right">
                  <button type="button" onClick={() => ordenarPor("variacao")} className="font-semibold uppercase hover:text-gray-800">
                    Δ {mesCurto(filtros.ate)} <SetaOrdem o="variacao" />
                  </button>
                </th>
                <th className="border-b border-gray-200 px-3 py-2 text-right font-semibold">Evolução</th>
              </tr>
            </thead>
            <tbody>
              {ordenadas.map((l) => {
                const maxLinha = Math.max(...l.serieP, 0);
                return (
                  <tr key={l.contrato.codccu} onClick={() => onAbrirContrato(l.contrato.codccu)} className="group cursor-pointer">
                    <td className="sticky left-0 z-10 border-b border-gray-100 bg-white py-2 pr-3 group-hover:bg-gray-50">
                      <p className="truncate font-medium text-gray-900" title={l.contrato.nome}>
                        {l.contrato.nome}
                      </p>
                      <p className="text-[13px] text-gray-500">
                        CCU {l.contrato.codccu}
                        {l.contrato.teamName ? ` · ${l.contrato.teamName}` : " · sem equipe vinculada"}
                      </p>
                    </td>
                    {l.serieP.map((v, i) => (
                      <td key={i} className="border-b border-gray-100 p-0.5 text-right tabular-nums">
                        <div className="rounded-md px-1.5 py-1 text-[13px]" style={estiloCelulaCalor(v, maxLinha)} title={`${mesLongo(mesesP[i])}: ${moeda(v)}`}>
                          {v ? moedaCompacta(v).replace("R$ ", "") : <span className="text-gray-300">–</span>}
                        </div>
                      </td>
                    ))}
                    <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums group-hover:bg-gray-50">{moeda(l.totalP)}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right tabular-nums text-gray-600 group-hover:bg-gray-50">{moedaCompacta(l.media)}</td>
                    <td className="border-b border-gray-100 px-3 py-2 text-right text-[13px] group-hover:bg-gray-50">{refParcial ? <span className="text-gray-300">parcial</span> : <Variacao v={l.delta} />}</td>
                    <td className="border-b border-gray-100 px-3 py-1 text-right group-hover:bg-gray-50">
                      <Sparkline valores={l.serieP} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 bg-gray-50 py-2.5 pr-3 text-gray-700">Total ({linhas.length} centros de custo)</td>
                {mesesP.map((m, i) => (
                  <td key={m} className="bg-gray-50 px-2 py-2.5 text-right text-[13px] tabular-nums text-gray-700">
                    {moedaCompacta(soma(ordenadas.map((l) => l.serieP[i]))).replace("R$ ", "")}
                  </td>
                ))}
                <td className="bg-gray-50 px-3 py-2.5 text-right tabular-nums text-gray-900">{moeda(totalP)}</td>
                <td className="bg-gray-50 px-3 py-2.5 text-right tabular-nums text-gray-700">{moedaCompacta(mesesP.length ? totalP / mesesP.length : 0)}</td>
                <td className="bg-gray-50" colSpan={2} />
              </tr>
            </tfoot>
          </table>
        </div>
      </Cartao>
    </div>
  );
}
