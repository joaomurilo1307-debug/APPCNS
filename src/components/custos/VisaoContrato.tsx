"use client";

// Visao de UM centro de custo: KPIs, evolucao mensal por grupo, composicao do periodo por conta e a tabela plano de contas x mes
// (mapa de calor, agrupada por tipo, com subtotais). Clicar numa celula abre os lancamentos (titulo a titulo, com OC).

import { Fragment, useEffect, useMemo, useState } from "react";
import {
  COR_DEMAIS,
  PALETA_GRUPOS,
  agruparPorGrupo,
  linhasDoContrato,
  maioresMovimentos,
  mediaDoPeriodo,
  passosDaPonte,
  soma,
  variacao,
  variacoesMensais,
  type BaseMes,
  type ContratoCusto,
  type Filtros,
} from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { baixarCsv } from "@/lib/custos/csv";
import type { AlvoDetalhe } from "./DetalheConta";
import { BarrasRanking, ColunasEmpilhadas, LegendaGrupos, estiloCelulaCalor, type SerieEmpilhada } from "./graficos";
import { BarrasVariacao, Cascata, LegendaLinha, LinhaAcompanhamento } from "./acompanhamento";
import { Cartao, Kpi, SeloInativa, SeloReembolsavel, Variacao, VazioPeriodo } from "./ui";
import InsightsFornecedores from "./InsightsFornecedores";
import MatrizRepresentatividade from "./MatrizRepresentatividade";
import ParetoFornecedores from "./ParetoFornecedores";
import VariacaoPorConta from "./VariacaoPorConta";
import { useLancamentos } from "./useLancamentos";

export default function VisaoContrato({
  contrato,
  filtros,
  base = "pagamento",
  mesesAsc,
  mesCorrente,
  busca,
  cores,
  onVoltar,
  onAbrirDetalhe,
}: {
  contrato: ContratoCusto;
  filtros: Filtros;
  base?: BaseMes;
  mesesAsc: string[];
  mesCorrente: string;
  busca: string;
  cores: Map<string, string>;
  onVoltar?: () => void;
  onAbrirDetalhe: (alvo: AlvoDetalhe) => void;
}) {
  const [agrupar, setAgrupar] = useState(true);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"mensal" | "acumulado">("mensal");
  const [mostrarMedia, setMostrarMedia] = useState(true);
  const [mostrarMM3, setMostrarMM3] = useState(true);
  const [metaTexto, setMetaTexto] = useState("");
  const [baixando, setBaixando] = useState(false);
  // mes em analise no painel "O que mudou": clicar numa barra de variacao muda o mes (padrao: o ultimo mes fechado do periodo)
  const [mesAnalise, setMesAnalise] = useState<string | null>(null);
  const lancamentos = useLancamentos(contrato.codccu, filtros, base);

  // meta mensal do coordenador: fica guardada neste navegador, por centro de custo
  useEffect(() => {
    try {
      setMetaTexto(localStorage.getItem(`custo_meta_${contrato.codccu}`) ?? "");
    } catch {
      setMetaTexto("");
    }
  }, [contrato.codccu]);
  const meta = (() => {
    const n = Number(metaTexto.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n > 0 ? n : null;
  })();
  function mudarMeta(v: string) {
    const limpo = v.replace(/[^\d.,]/g, "");
    setMetaTexto(limpo);
    try {
      if (limpo) localStorage.setItem(`custo_meta_${contrato.codccu}`, limpo);
      else localStorage.removeItem(`custo_meta_${contrato.codccu}`);
    } catch {
      /* sem armazenamento: a meta vale so' nesta sessao */
    }
  }

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
  const reembAntiga = soma(linhas.filter((l) => l.conta.grupoCodigo === "reemb").map((l) => l.totalP));
  const reembR = soma(linhas.filter((l) => l.conta.grupoCodigo === "reembR").map((l) => l.totalP));
  const maiorConta = linhas[0];
  const mesesComCusto = totaisMes.filter((t) => t !== 0).length;

  // acompanhamento: media dos meses fechados, variacao mensal, meses acima da meta
  const mediaFechada = mediaDoPeriodo(totaisMes, refParcial);
  const variacoes = variacoesMensais(totaisMes, refParcial);
  const mesesFechados = refParcial ? totaisMes.slice(0, -1) : totaisMes;
  const acimaDaMeta = meta ? mesesFechados.filter((v) => v > meta).length : 0;

  // ponte: o mes em analise contra o anterior (padrao: o ultimo mes FECHADO do periodo; clicar numa barra de variacao troca o mes)
  const iPadraoPonte = refParcial ? idxAte - 1 : idxAte;
  const iSelecionado = mesAnalise ? mesesAsc.indexOf(mesAnalise) : -1;
  const iPonte = iSelecionado > 0 && iSelecionado >= idxDe && iSelecionado <= idxAte ? iSelecionado : iPadraoPonte;
  const temPonte = iPonte > 0 && iPonte - 1 >= 0;

  // balao de cada mes no grafico de variacao: a conta que mais subiu e a que mais caiu contra o mes anterior
  const dicasVariacao = useMemo(
    () =>
      mesesP.map((_, i) => {
        const g = idxDe + i;
        if (g <= 0) return null;
        let alta: { nome: string; d: number } | null = null;
        let queda: { nome: string; d: number } | null = null;
        for (const l of linhas) {
          const d = (l.serie[g] ?? 0) - (l.serie[g - 1] ?? 0);
          if (d > 0 && (!alta || d > alta.d)) alta = { nome: l.conta.contaFinanceira, d };
          if (d < 0 && (!queda || d < queda.d)) queda = { nome: l.conta.contaFinanceira, d };
        }
        const partes = [alta ? `▲ ${alta.nome}: +${moedaCompacta(alta.d)}` : null, queda ? `▼ ${queda.nome}: ${moedaCompacta(queda.d)}` : null].filter(Boolean);
        return partes.length ? partes.join("\n") : null;
      }),
    [mesesP, idxDe, linhas]
  );
  const ponte = useMemo(() => {
    if (!temPonte) return null;
    const porGrupo = new Map<string, { nome: string; anterior: number; atual: number }>();
    for (const l of linhas) {
      const g = porGrupo.get(l.conta.grupoNome) ?? { nome: l.conta.grupoNome, anterior: 0, atual: 0 };
      g.anterior += l.serie[iPonte - 1] ?? 0;
      g.atual += l.serie[iPonte] ?? 0;
      porGrupo.set(l.conta.grupoNome, g);
    }
    const grupos2 = Array.from(porGrupo.values());
    const contas = linhas.map((l) => ({ nome: l.conta.contaFinanceira, anterior: l.serie[iPonte - 1] ?? 0, atual: l.serie[iPonte] ?? 0 }));
    return {
      inicio: soma(grupos2.map((g) => g.anterior)),
      fim: soma(grupos2.map((g) => g.atual)),
      passos: passosDaPonte(grupos2, 5),
      movimentos: maioresMovimentos(contas, 6),
    };
  }, [linhas, iPonte, temPonte]);

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
    const cab = ["Grupo", "Conta financeira", "Reembolsável", ...mesesP.map(mesCurto), "Total do período", "% do centro de custo"];
    const corpo: (string | number)[][] = [];
    for (const g of grupos) for (const l of g.linhas) corpo.push([g.grupoNome, l.conta.contaFinanceira, l.conta.reembolsavel ? "sim" : "não", ...l.serie, l.total, totalP ? l.total / totalP : 0]);
    corpo.push(["", "TOTAL", "", ...totaisMes, totalP, 1]);
    baixarCsv(`custo_${contrato.codccu}_${contrato.nome.replace(/[^\w]+/g, "_").slice(0, 40)}_${filtros.de}_a_${filtros.ate}.csv`, [cab, ...corpo]);
  }

  async function exportarLancamentos() {
    setBaixando(true);
    try {
      const qs = new URLSearchParams({ codccu: contrato.codccu, de: filtros.de, ate: filtros.ate, base });
      const res = await fetch(`/api/custos-conta/lancamentos?${qs.toString()}`);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || "Falha ao buscar os lançamentos");
      const d = await res.json();
      const br = (iso: string | null) => (iso ? iso.split("-").reverse().join("/") : "");
      const cab = ["Centro de Custo", "Descrição Centro de Custo", "Competência", "Conta Financeira", "Descrição Conta Financeira", "Número do Título", "Código do Fornecedor", "Descrição do Fornecedor", "Data de Entrada", "Data de Vencimento", "Valor Rateio", "Data de Pagamento", "Competência da nota", "Forma de baixa"];
      const corpo = (d.linhas as any[]).map((l) => [l.codccu, l.centroDeCusto, l.competencia.split("-").reverse().join("/"), l.contaCodigo ?? "", l.contaFinanceira, l.numTit, l.codFor, l.fornecedor ?? "", br(l.dataEntrada), br(l.dataVencimento), l.valorRateado, br(l.dataPagamento), l.competenciaNota ? l.competenciaNota.split("-").reverse().join("/") : "", l.formaBaixa ?? ""]);
      corpo.push(["", "TOTAL", "", "", "", "", "", "", "", "", d.total, "", "", ""]);
      baixarCsv(`lancamentos_${contrato.codccu}_${base === "competencia" ? "competencia_" : ""}${filtros.de}_a_${filtros.ate}.csv`, [cab, ...corpo]);
    } catch (e: any) {
      alert(e?.message || "Não foi possível exportar os lançamentos.");
    } finally {
      setBaixando(false);
    }
  }

  function abrir(conta: string, mesIdx: number, valor: number, reembolsavel: boolean) {
    onAbrirDetalhe({ codccu: contrato.codccu, contrato: contrato.nome, conta, competencia: `${mesesP[mesIdx]}-01T00:00:00.000Z`, valor, reembolsavel, base });
  }

  const alternarGrupo = (g: string) =>
    setFechados((atual) => {
      const n = new Set(atual);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const celula = (v: number, max: number, mesIdx: number, conta: string, reembolsavel: boolean, tamanho = "text-[13px]") =>
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
      <span className="block px-1.5 py-1 text-right text-[13px] text-gray-300">–</span>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {onVoltar && (
            <button type="button" onClick={onVoltar} className="mb-1 inline-flex items-center gap-1 text-[13px] font-medium text-brand hover:text-brand-dark">
              ← Todos os centros de custo
            </button>
          )}
          <h2 className="truncate text-3xl font-semibold tracking-tight text-gray-900">
            <span className="mr-3 inline-block rounded-lg bg-teal-50 px-2.5 py-0.5 align-middle text-2xl font-semibold tabular-nums text-teal-800">CCU {contrato.codccu}</span>
            {contrato.nome}
          </h2>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-gray-500">
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
              detalhe={refParcial ? <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">em andamento · só o já pago</span> : <Variacao v={variacao(totalRef, totalAnt)} sufixo="vs mês anterior" />}
            />
            <Kpi rotulo="Média mensal" valor={moedaCompacta(mesesP.length ? totalP / mesesP.length : 0)} detalhe={`em ${mesesP.length} ${mesesP.length === 1 ? "mês" : "meses"} do período`} />
            <Kpi rotulo="Maior conta" valor={<span className="block truncate text-lg">{maiorConta.conta.contaFinanceira}</span>} detalhe={`${moedaCompacta(maiorConta.totalP)} · ${percentual(maiorConta.totalP / totalP)} do centro de custo`} />
            <Kpi rotulo="Reembolsável" valor={moedaCompacta(reemb)} detalhe={reemb ? `conta antiga ${moedaCompacta(reembAntiga)} · contas R ${moedaCompacta(reembR)}` : "nenhum no período"} />
          </div>

          <Cartao
            titulo="Acompanhamento mensal"
            subtitulo={
              <>
                {modo === "acumulado" ? "Quanto o centro de custo já acumulou ao longo do período" : "Linha do custo de cada mês contra a média e a tendência"}
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
                <label className="flex items-center gap-1.5">
                  Meta mensal R$
                  <input
                    type="text"
                    inputMode="decimal"
                    value={metaTexto}
                    onChange={(e) => mudarMeta(e.target.value)}
                    placeholder="opcional"
                    className="w-28 rounded-lg border border-gray-200 px-2 py-1 text-[13px] tabular-nums focus:border-brand focus:outline-none"
                    aria-label="Meta mensal em reais"
                  />
                </label>
              </div>
            }
          >
            <div className="mb-3">
              <LegendaLinha modo={modo} mostrarMedia={mostrarMedia} mostrarMediaMovel={mostrarMM3} temMeta={!!meta} />
            </div>
            <LinhaAcompanhamento meses={mesesP} valores={totaisMes} mesParcial={refParcial ? mesCorrente : undefined} mesDestaque={filtros.ate} modo={modo} mostrarMedia={mostrarMedia} mostrarMediaMovel={mostrarMM3} meta={meta} />
            {meta && (
              <p className={`mt-1 text-[13px] font-medium ${acimaDaMeta ? "text-red-700" : "text-emerald-700"}`}>
                {acimaDaMeta ? `▲ ${acimaDaMeta} de ${mesesFechados.length} meses fechados ficaram acima da meta de ${moeda(meta)}` : `✓ Nenhum dos ${mesesFechados.length} meses fechados passou da meta de ${moeda(meta)}`}
              </p>
            )}
            {modo === "mensal" && (
              <div className="mt-4 border-t border-gray-100 pt-3">
                <h3 className="mb-1 text-sm font-semibold text-gray-800">
                  Variação contra o mês anterior <span className="font-normal text-gray-500">· média dos meses fechados {moedaCompacta(mediaFechada)}</span>
                </h3>
                <BarrasVariacao meses={mesesP} variacoes={variacoes} selecionado={temPonte ? mesesAsc[iPonte] : undefined} onSelecionar={setMesAnalise} dicas={dicasVariacao} />
                <p className="mt-1 text-xs text-gray-500">
                  Clique numa barra para ver, logo abaixo, <b>quais contas</b> mais subiram e mais caíram naquele mês contra o anterior.
                  {mesAnalise && (
                    <button type="button" onClick={() => setMesAnalise(null)} className="ml-2 font-medium text-brand hover:text-brand-dark">
                      voltar ao último mês fechado
                    </button>
                  )}
                </p>
              </div>
            )}
          </Cartao>

          <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
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
                  selo: l.conta.inativa ? <SeloInativa /> : undefined,
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

          {ponte && (
            <Cartao
              titulo={`O que mudou: ${mesCurto(mesesAsc[iPonte - 1])} → ${mesCurto(mesesAsc[iPonte])}`}
              subtitulo={`Ponte do custo por tipo de custo${!mesAnalise && refParcial ? " · compara os dois últimos meses fechados" : ""} · vermelho = custo subiu, verde = custo caiu`}
            >
              <Cascata rotuloInicio={mesCurto(mesesAsc[iPonte - 1])} valorInicio={ponte.inicio} rotuloFim={mesCurto(mesesAsc[iPonte])} valorFim={ponte.fim} passos={ponte.passos} />
            </Cartao>
          )}

          {temPonte && (
            <VariacaoPorConta linhas={todas} mesesAsc={mesesAsc} iMes={iPonte} mesesEscolha={mesesP.filter((m) => mesesAsc.indexOf(m) > 0)} onMes={setMesAnalise} />
          )}

          <MatrizRepresentatividade grupos={grupos} meses={mesesP} totaisMes={totaisMes} totalP={totalP} cores={cores} mesCorrente={mesCorrente} />

          <InsightsFornecedores dados={lancamentos} filtros={filtros} busca={busca} meses={mesesP} mesAtual={temPonte ? mesesAsc[iPonte] : undefined} mesAnterior={temPonte ? mesesAsc[iPonte - 1] : undefined} mesParcial={refParcial ? mesCorrente : undefined} />

          <ParetoFornecedores dados={lancamentos} filtros={filtros} base={base} busca={busca} />

          <Cartao
            titulo="Plano de contas × mês"
            subtitulo="Cada célula é clicável: abre os lançamentos (título a título, com a OC). A cor mostra os meses mais pesados de cada conta."
            acao={
              <div className="flex items-center gap-2">
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="h-3.5 w-3.5 accent-[#00A99D]" />
                  Agrupar por tipo
                </label>
                <button type="button" onClick={exportar} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50">
                  Exportar quadro (CSV)
                </button>
                <button
                  type="button"
                  onClick={exportarLancamentos}
                  disabled={baixando}
                  title="Todos os lançamentos do período, título a título, no layout do Rel114 do Senior — para conferir com a planilha da área"
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
                                  <span className="w-3 text-xs text-gray-400">{fechado ? "▶" : "▼"}</span>
                                  <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cor }} />
                                  {g.grupoNome}
                                  <span className="text-xs font-normal text-gray-400">{g.linhas.length} {g.linhas.length === 1 ? "conta" : "contas"}</span>
                                </span>
                              </td>
                              {g.serie.map((v, i) => (
                                <td key={i} className="border-b border-gray-100 px-1.5 py-2 text-right text-[13px] font-semibold tabular-nums text-gray-700">
                                  {v ? moedaCompacta(v).replace("R$ ", "") : <span className="font-normal text-gray-300">–</span>}
                                </td>
                              ))}
                              <td className="border-b border-gray-100 px-3 py-2 text-right font-semibold tabular-nums text-gray-900">{moeda(g.total)}</td>
                              <td className="border-b border-gray-100 px-3 py-2 text-right text-[13px] tabular-nums text-gray-500">{percentual(totalP ? g.total / totalP : 0, 1)}</td>
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
                                        {l.conta.reembolsavel && !g.grupoCodigo.startsWith("reemb") && <SeloReembolsavel />}
                                        {l.conta.inativa && <SeloInativa />}
                                      </span>
                                    </td>
                                    {l.serie.map((v, i) => (
                                      <td key={i} className="border-b border-gray-100 p-0.5">
                                        {celula(v, max, i, l.conta.contaFinanceira, l.conta.reembolsavel)}
                                      </td>
                                    ))}
                                    <td className="border-b border-gray-100 px-3 py-1 text-right tabular-nums text-gray-800">{moeda(l.total)}</td>
                                    <td className="border-b border-gray-100 px-3 py-1 text-right text-[13px] tabular-nums text-gray-500">{percentual(totalP ? l.total / totalP : 0, 1)}</td>
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
                                {l.conta.reembolsavel && <SeloReembolsavel />}
                                {l.conta.inativa && <SeloInativa />}
                              </span>
                            </td>
                            {l.serieP.map((v, i) => (
                              <td key={i} className="border-b border-gray-100 p-0.5">
                                {celula(v, max, i, l.conta.contaFinanceira, l.conta.reembolsavel)}
                              </td>
                            ))}
                            <td className="border-b border-gray-100 px-3 py-1 text-right tabular-nums text-gray-800">{moeda(l.totalP)}</td>
                            <td className="border-b border-gray-100 px-3 py-1 text-right text-[13px] tabular-nums text-gray-500">{percentual(totalP ? l.totalP / totalP : 0, 1)}</td>
                          </tr>
                        );
                      })}
                </tbody>
                <tfoot>
                  <tr className="font-semibold">
                    <td className="sticky left-0 z-10 bg-gray-100 py-2.5 pr-3 text-gray-800">Total do centro de custo</td>
                    {totaisMes.map((v, i) => (
                      <td key={i} className="bg-gray-100 px-1.5 py-2.5 text-right text-[13px] tabular-nums text-gray-800">
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
