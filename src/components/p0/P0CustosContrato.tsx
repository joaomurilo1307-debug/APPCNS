"use client";

// Aba P0 > Custos de contrato: a linha de base de custos do contrato (previsto mes a mes), no mesmo padrao da aba Custos -- grafico de
// acompanhamento com media e tendencia, variacao contra o mes anterior, evolucao por tipo de custo, representatividade e a tabela
// plano de contas x mes -- e, ao lado, o realizado do Senior e o comparativo conta a conta. So' o P0 de custo de contrato: salario CLT,
// encargos, ferias, 13o e provisoes ficam guardados a' parte (aba "Custos pessoais", que vem depois).

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  COR_DEMAIS,
  PALETA_GRUPOS,
  agruparPorGrupo,
  coresDosGrupos,
  linhasDoContrato,
  mediaDoPeriodo,
  soma,
  variacao,
  variacoesMensais,

  type ContratoCusto,
  type Filtros,
} from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { baixarCsv } from "@/lib/custos/csv";
import BotaoExcel from "@/components/BotaoExcel";
import { abaDeLinhas } from "@/lib/exportarExcel";
import { BarrasVariacao, LegendaLinha, LinhaAcompanhamento } from "@/components/custos/acompanhamento";
import { BarrasRanking, ColunasEmpilhadas, LegendaGrupos, estiloCelulaCalor, type SerieEmpilhada } from "@/components/custos/graficos";
import MatrizRepresentatividade from "@/components/custos/MatrizRepresentatividade";
import VariacaoPorConta from "@/components/custos/VariacaoPorConta";
import { Cartao, Kpi, SeloReembolsavel, Variacao } from "@/components/custos/ui";
import { desviosContraP0, totaisPorMes } from "@/lib/p0/comparar";
import { mesesEntre, type P0Custos } from "@/lib/p0/montar";
import ComparativoP0 from "./ComparativoP0";
import DetalheP0, { type AlvoP0 } from "./DetalheP0";
import { useP0Custos } from "./useP0Custos";
import { useRealizadoDoContrato } from "./useRealizadoDoContrato";

const COR_REALIZADO = "#eb6834";
const SEM_FILTRO: Pick<Filtros, "tipo" | "grupo"> = { tipo: "todos", grupo: "todos" };

function Esqueleto() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl bg-gray-200/70" />
        ))}
      </div>
      <div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" />
    </div>
  );
}

export default function P0CustosContrato({ codccu, nomeContrato }: { codccu: string; nomeContrato: string }) {
  const p0estado = useP0Custos(codccu);
  if (p0estado.estado === "carregando") return <Esqueleto />;
  if (p0estado.estado === "erro") return <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{p0estado.mensagem}</div>;
  if (p0estado.estado === "sem") {
    return (
      <Cartao titulo="P0 de custos do contrato" subtitulo="A linha de base de custos: o previsto, mês a mês, para comparar com o realizado do Senior">
        <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50/60 px-5 py-9 text-center">
          <p className="text-base font-medium text-gray-700">O P0 de custos deste contrato ainda não foi cadastrado.</p>
          <p className="mx-auto mt-1 max-w-2xl text-sm text-gray-500">Quando o P0 do contrato estiver pronto, ele será cadastrado aqui. Nada é estimado nem preenchido automaticamente: o previsto vem do P0 e o realizado vem do Senior.</p>
        </div>
      </Cartao>
    );
  }
  return <VisaoP0 p0={p0estado.p0} nomeContrato={nomeContrato} />;
}

function VisaoP0({ p0, nomeContrato }: { p0: P0Custos; nomeContrato: string }) {
  const params = useSearchParams();
  const realizado = useRealizadoDoContrato(p0.codccu, params.get("base") === "competencia" ? "competencia" : "pagamento");

  const [agrupar, setAgrupar] = useState(true);
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [modo, setModo] = useState<"mensal" | "acumulado">("mensal");
  const [mostrarMedia, setMostrarMedia] = useState(true);
  const [mostrarMM3, setMostrarMM3] = useState(true);
  const [mostrarRealizado, setMostrarRealizado] = useState(true);
  const [mesAnalise, setMesAnalise] = useState<string | null>(null);
  const [mesCmp, setMesCmp] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AlvoP0 | null>(null);

  // o P0 cobre do primeiro ao ultimo mes com previsao, sem pular nenhum (um mes sem previsao no meio, como uma pausa, aparece zerado)
  const mesesP = useMemo(() => mesesEntre(p0.mesIni, p0.mesFim), [p0.mesIni, p0.mesFim]);
  const mesCorrente = realizado.mesCorrente;
  const contratoP0: ContratoCusto = useMemo(
    () => ({ codccu: p0.codccu, contrato: nomeContrato, nome: nomeContrato, teamId: null, teamName: null, projectName: null, totalGeral: p0.totalCusto, ultimaCompetencia: null, contas: p0.contas }),
    [p0, nomeContrato]
  );
  const cores = useMemo(() => coresDosGrupos([contratoP0]), [contratoP0]);

  const todas = useMemo(() => linhasDoContrato(contratoP0, { de: p0.mesIni, ate: p0.mesFim, ...SEM_FILTRO }, mesesP), [contratoP0, p0.mesIni, p0.mesFim, mesesP]);
  const linhas = useMemo(() => todas.filter((l) => l.total !== 0).sort((a, b) => b.total - a.total), [todas]);
  const grupos = useMemo(() => agruparPorGrupo(linhas, mesesP.length), [linhas, mesesP.length]);
  const totaisMes = useMemo(() => mesesP.map((_, i) => soma(linhas.map((l) => l.serie[i]))), [linhas, mesesP]);
  const totalP = soma(totaisMes);

  // mes de referencia: o mes corrente se estiver dentro do P0; senao o primeiro mes do P0
  const mesRef = mesCorrente && mesCorrente >= p0.mesIni && mesCorrente <= p0.mesFim ? mesCorrente : p0.mesIni;
  const iRef = mesesP.indexOf(mesRef);
  const previstoRef = totaisMes[iRef] ?? 0;
  const previstoAnt = iRef > 0 ? totaisMes[iRef - 1] : 0;
  const mediaMensal = mesesP.length ? totalP / mesesP.length : 0;
  const maiorConta = linhas[0];
  const reembTotal = soma(linhas.filter((l) => l.conta.reembolsavel).map((l) => l.total));
  const mesesSemPrevisao = totaisMes.filter((t) => Math.abs(t) < 0.005).length;

  // variacao do previsto contra o mes anterior (o P0 e' plano: nenhum mes e' "em andamento")
  const variacoes = variacoesMensais(totaisMes, false);
  const mediaFechada = mediaDoPeriodo(totaisMes, false);
  const iPadraoPonte = iRef > 0 ? iRef : Math.min(1, mesesP.length - 1);
  const iSelecionado = mesAnalise ? mesesP.indexOf(mesAnalise) : -1;
  const iPonte = iSelecionado > 0 ? iSelecionado : iPadraoPonte;
  const temPonte = iPonte > 0;

  // realizado do Senior no mesmo periodo (so' ate o mes corrente; o mes corrente e' parcial: so' o ja' pago)
  const contaRealizado = realizado.contrato?.contas ?? [];
  const realizadoMes = useMemo(() => {
    if (!realizado.contrato) return null;
    return totaisPorMes(contaRealizado, mesesP, SEM_FILTRO).map((v, i) => (mesCorrente && mesesP[i] <= mesCorrente ? v : null));
  }, [realizado.contrato, contaRealizado, mesesP, mesCorrente]);
  const iParcial = mesCorrente ? mesesP.indexOf(mesCorrente) : -1;
  const desvios = realizadoMes ? desviosContraP0(realizadoMes.map((v) => v ?? 0), totaisMes, iParcial >= 0 ? iParcial : null).map((d, i) => (realizadoMes[i] === null ? null : d)) : null;
  const comparacao = realizadoMes && mostrarRealizado && realizadoMes.some((v) => v !== null) ? { rotulo: "Realizado (Senior)", cor: COR_REALIZADO, valores: realizadoMes, parcialEm: iParcial >= 0 ? mesCorrente : undefined, desvios: desvios ?? undefined, rotuloDesvio: "Realizado vs P0" } : undefined;

  // KPI: realizado x P0 ate o ultimo mes fechado
  const kpiAcum = useMemo(() => {
    if (!realizadoMes) return null;
    let p = 0;
    let r = 0;
    let n = 0;
    mesesP.forEach((m, i) => {
      if (realizadoMes[i] === null || m === mesCorrente) return;
      p += totaisMes[i];
      r += realizadoMes[i] ?? 0;
      n++;
    });
    return n ? { p, r, n, ate: mesesP.filter((m, i) => realizadoMes[i] !== null && m !== mesCorrente).slice(-1)[0] } : null;
  }, [realizadoMes, mesesP, totaisMes, mesCorrente]);

  const dicasVariacao = useMemo(
    () =>
      mesesP.map((_, g) => {
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
    [mesesP, linhas]
  );

  // evolucao por tipo de custo (a cor segue o grupo)
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

  // comparativo conta a conta (mes padrao: o ultimo mes fechado dentro do P0 que ja' tem realizado)
  const mesesComRealizado = mesesP.filter((m) => !!mesCorrente && m <= mesCorrente);
  const ultimoFechado = [...mesesComRealizado].reverse().find((m) => m !== mesCorrente) ?? mesesComRealizado[mesesComRealizado.length - 1];
  const mesDoComparativo = mesCmp && mesesComRealizado.includes(mesCmp) ? mesCmp : ultimoFechado;

  const nomeArquivo = `p0_${p0.codccu}_${nomeContrato.replace(/[^\w]+/g, "_").slice(0, 40)}`;
  function linhasQuadro(): (string | number)[][] {
    const cab = ["Tipo de custo", "Conta financeira", "Reembolsável", ...mesesP.map(mesCurto), "Total previsto", "% do P0"];
    const corpo: (string | number)[][] = [];
    for (const g of grupos) for (const l of g.linhas) corpo.push([g.grupoNome, l.conta.contaFinanceira, l.conta.reembolsavel ? "sim" : "não", ...l.serie, l.total, totalP ? l.total / totalP : 0]);
    corpo.push(["", "TOTAL", "", ...totaisMes, totalP, 1]);
    return [cab, ...corpo];
  }

  const alternarGrupo = (g: string) =>
    setFechados((a) => {
      const n = new Set(a);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const abrirCelula = (conta: string, mesIdx: number, valor: number, reembolsavel: boolean) => setDetalhe({ codccu: p0.codccu, conta, mes: mesesP[mesIdx], valor, reembolsavel, rotulo: p0.rotulo });
  const celula = (v: number, max: number, mesIdx: number, conta: string, reembolsavel: boolean) =>
    v ? (
      <button
        type="button"
        onClick={() => abrirCelula(conta, mesIdx, v, reembolsavel)}
        className="block w-full rounded-md px-1.5 py-1 text-right text-[13px] tabular-nums transition hover:ring-2 hover:ring-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        style={estiloCelulaCalor(v, max)}
        title={`${conta} · ${mesLongo(mesesP[mesIdx])}: ${moeda(v)} previsto — clique para ver as linhas do P0`}
      >
        {moedaCompacta(v).replace("R$ ", "")}
      </button>
    ) : (
      <span className="block px-1.5 py-1 text-right text-[13px] text-gray-300">–</span>
    );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-gray-100 bg-white px-5 py-3 text-[13px] text-gray-600 shadow-soft">
        <span className="rounded-full bg-brand-light px-2.5 py-0.5 text-xs font-semibold text-brand-dark">{p0.rotulo}</span>
        <span>
          Cobre <b>{mesLongo(p0.mesIni)}</b> a <b>{mesLongo(p0.mesFim)}</b> · {mesesP.length} meses
          {mesesSemPrevisao > 0 && <> ({mesesSemPrevisao} sem previsão, como pausa do contrato)</>}
        </span>
        {p0.origem && <span className="text-gray-400">· {p0.origem}</span>}
        {p0.rotuloNaPlanilha && <span className="text-gray-400">· rótulo na planilha: {p0.rotuloNaPlanilha}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo="Previsto no P0" valor={moedaCompacta(totalP)} detalhe={`custo de contrato · ${linhas.length} contas · ${mesesP.length} meses`} destaque />
        <Kpi
          rotulo={`Previsto em ${mesCurto(mesRef)}`}
          valor={moedaCompacta(previstoRef)}
          detalhe={
            realizado.contrato && mesRef === mesCorrente ? (
              <>
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">em andamento</span> <span>realizado até agora {moedaCompacta(realizadoMes?.[iRef] ?? 0)}</span>
              </>
            ) : iRef > 0 ? (
              <Variacao v={variacao(previstoRef, previstoAnt)} sufixo="vs mês anterior" />
            ) : (
              "primeiro mês do P0"
            )
          }
        />
        <Kpi rotulo="Média mensal prevista" valor={moedaCompacta(mediaMensal)} detalhe={`em ${mesesP.length} meses do P0`} />
        <Kpi rotulo="Maior conta" valor={<span className="block truncate text-lg">{maiorConta?.conta.contaFinanceira ?? "—"}</span>} detalhe={maiorConta ? `${moedaCompacta(maiorConta.total)} · ${percentual(totalP ? maiorConta.total / totalP : 0)} do P0` : ""} />
        <Kpi
          rotulo={kpiAcum ? `Realizado × P0 · até ${mesCurto(kpiAcum.ate)}` : "Realizado × P0"}
          valor={kpiAcum ? `${kpiAcum.r - kpiAcum.p > 0.005 ? "+" : kpiAcum.r - kpiAcum.p < -0.005 ? "−" : ""}${moedaCompacta(Math.abs(kpiAcum.r - kpiAcum.p))}` : "—"}
          detalhe={kpiAcum ? <><Variacao v={variacao(kpiAcum.r, kpiAcum.p)} sufixo="vs P0" /> <span>· P0 {moedaCompacta(kpiAcum.p)} · {kpiAcum.n} {kpiAcum.n === 1 ? "mês fechado" : "meses fechados"}</span></> : realizado.carregando ? "lendo o realizado do Senior…" : realizado.erro ? "realizado indisponível" : !realizado.contrato ? "sem realizado do Senior neste contrato" : "ainda sem mês fechado no P0"}
        />
      </div>

      <Cartao
        titulo="Acompanhamento mensal do P0"
        subtitulo={modo === "acumulado" ? "Quanto o P0 prevê acumular ao longo do contrato (e quanto o Senior já realizou)" : "Linha do custo previsto em cada mês contra a média e a tendência, com o realizado do Senior por cima"}
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
            <label className="flex cursor-pointer items-center gap-1.5">
              <input type="checkbox" checked={mostrarRealizado} onChange={(e) => setMostrarRealizado(e.target.checked)} disabled={!realizado.contrato} className="h-4 w-4 accent-[#eb6834]" /> Realizado (Senior)
            </label>
          </div>
        }
      >
        <div className="mb-3">
          <LegendaLinha modo={modo} mostrarMedia={mostrarMedia} mostrarMediaMovel={mostrarMM3} temMeta={false} rotuloMensal="Previsto no mês (P0)" rotuloAcumulado="Previsto acumulado (P0)" comparacao={comparacao && { rotulo: comparacao.rotulo, cor: comparacao.cor }} />
        </div>
        <LinhaAcompanhamento
          meses={mesesP}
          valores={totaisMes}
          mesDestaque={mesRef}
          modo={modo}
          mostrarMedia={mostrarMedia}
          mostrarMediaMovel={mostrarMM3}
          rotuloAcessivel="Linha do custo mensal previsto no P0"
          rotuloMensal="Previsto no mês (P0)"
          rotuloAcumulado="Previsto acumulado (P0)"
          comparacao={comparacao}
        />
        {realizado.erro && <p className="mt-1 text-[13px] text-amber-700">{realizado.erro} O previsto continua valendo.</p>}
        {modo === "mensal" && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Variação do previsto contra o mês anterior <span className="font-normal text-gray-500">· média mensal do P0 {moedaCompacta(mediaFechada)}</span>
            </h3>
            <BarrasVariacao meses={mesesP} variacoes={variacoes} selecionado={temPonte ? mesesP[iPonte] : undefined} onSelecionar={setMesAnalise} dicas={dicasVariacao} contra="o mês anterior do P0" dicaClique="clique para ver as contas que mudam" />
            <p className="mt-1 text-xs text-gray-500">
              Clique numa barra para ver, logo abaixo, <b>quais contas</b> do P0 mais sobem e mais caem naquele mês contra o anterior.
              {mesAnalise && (
                <button type="button" onClick={() => setMesAnalise(null)} className="ml-2 font-medium text-brand hover:text-brand-dark">
                  voltar ao mês de referência
                </button>
              )}
            </p>
          </div>
        )}
        {modo === "mensal" && comparacao && desvios && desvios.some((v) => v !== null) && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <h3 className="mb-1 text-sm font-semibold text-gray-800">
              Desvio do realizado contra o P0 <span className="font-normal text-gray-500">· realizado do mês contra o previsto</span>
            </h3>
            <BarrasVariacao meses={mesesP} variacoes={desvios} selecionado={mesDoComparativo} onSelecionar={setMesCmp} contra="o P0" dicaClique="clique para comparar com o P0 logo abaixo" rotuloAlta="▲ acima" rotuloQueda="▼ abaixo" />
            <p className="mt-1 text-xs text-gray-500">Vermelho = o mês custou mais do que o P0 previa; verde = custou menos. O mês em andamento fica de fora (só o já pago).</p>
          </div>
        )}
      </Cartao>

      {temPonte && <VariacaoPorConta linhas={todas} mesesAsc={mesesP} iMes={iPonte} mesesEscolha={mesesP.slice(1)} onMes={setMesAnalise} sufixoTitulo=" no P0" descricao="Todas as contas do P0 que mudam de um mês para o outro, da maior variação para a menor" />}

      {realizado.contrato && mesDoComparativo && <ComparativoP0 p0={p0} realizado={contaRealizado} mes={mesDoComparativo} mesesEscolha={mesesComRealizado} onMes={setMesCmp} filtros={SEM_FILTRO} mesCorrente={mesCorrente} baseRotulo={realizado.base === "competencia" ? "competência da nota" : "data de pagamento"} nomeArquivo={p0.codccu} />}

      <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <Cartao titulo="Evolução mensal prevista por tipo de custo" subtitulo="Cada coluna é um mês do P0; o número no topo é o total previsto">
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
          <ColunasEmpilhadas meses={mesesP} series={series.filter((s) => !ocultos.has(s.chave))} mesDestaque={mesRef} altura={360} />
        </Cartao>

        <Cartao titulo="Onde o previsto está" subtitulo={`As ${Math.min(8, linhas.length)} maiores contas do P0 · a cor é o tipo de custo`}>
          <BarrasRanking
            itens={linhas.slice(0, 8).map((l) => ({
              chave: l.conta.contaFinanceira,
              rotulo: l.conta.contaFinanceira,
              subrotulo: l.conta.grupoNome,
              valor: l.total,
              cor: cores.get(l.conta.grupoCodigo) ?? COR_DEMAIS,
              serie: l.serie,
            }))}
            total={totalP}
          />
          {linhas.length > 8 && (
            <p className="mt-2 border-t border-gray-100 pt-2 text-xs text-gray-500">
              + {linhas.length - 8} contas menores somam {moedaCompacta(soma(linhas.slice(8).map((l) => l.total)))} ({percentual(totalP ? soma(linhas.slice(8).map((l) => l.total)) / totalP : 0)})
            </p>
          )}
        </Cartao>
      </div>

      <MatrizRepresentatividade grupos={grupos} meses={mesesP} totaisMes={totaisMes} totalP={totalP} cores={cores} mesCorrente={mesCorrente} rotuloTotal="Previsto do mês" />

      <Cartao
        titulo="Plano de contas × mês (P0)"
        subtitulo="Cada célula é o previsto no P0; clique para ver as linhas do P0 por trás do valor. A cor mostra os meses mais pesados de cada conta."
        acao={
          <div className="flex items-center gap-2">
            <label className="flex cursor-pointer items-center gap-1.5 text-xs text-gray-600">
              <input type="checkbox" checked={agrupar} onChange={(e) => setAgrupar(e.target.checked)} className="h-3.5 w-3.5 accent-[#00A99D]" />
              Agrupar por tipo
            </label>
            <button type="button" onClick={() => baixarCsv(`${nomeArquivo}.csv`, linhasQuadro())} className="rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] font-medium text-gray-600 transition hover:bg-gray-50">
              Exportar quadro (CSV)
            </button>
            <BotaoExcel
              arquivo={nomeArquivo}
              rotulo="Exportar Excel"
              className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[13px] font-medium text-emerald-800 transition hover:bg-emerald-100 disabled:opacity-50"
              gerar={() => [abaDeLinhas("P0 plano de contas x mes", linhasQuadro(), `${nomeContrato} · CCU ${p0.codccu} · ${p0.rotulo} · custo de contrato, sem custo de pessoal`, true)]}
            />
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
                    return (
                      <Fragment key={g.grupoCodigo}>
                        <tr className="cursor-pointer bg-gray-50/80" onClick={() => alternarGrupo(g.grupoCodigo)}>
                          <td className="sticky left-0 z-10 border-b border-gray-100 bg-gray-50 py-2 pr-3">
                            <span className="flex items-center gap-2 font-semibold text-gray-800">
                              <span className="w-3 text-xs text-gray-400">{fechado ? "▶" : "▼"}</span>
                              <span className="h-2.5 w-2.5 shrink-0 rounded-[3px]" style={{ background: cor }} />
                              {g.grupoNome}
                              <span className="text-xs font-normal text-gray-400">
                                {g.linhas.length} {g.linhas.length === 1 ? "conta" : "contas"}
                              </span>
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
                    const max = Math.max(...l.serie, 0);
                    return (
                      <tr key={l.conta.contaFinanceira} className="hover:bg-gray-50/70">
                        <td className="sticky left-0 z-10 border-b border-gray-100 bg-white py-1 pr-3">
                          <span className="flex items-center gap-1.5 text-gray-700">
                            <span className="truncate" title={l.conta.contaFinanceira}>
                              {l.conta.contaFinanceira}
                            </span>
                            {l.conta.reembolsavel && <SeloReembolsavel />}
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
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="sticky left-0 z-10 bg-gray-100 py-2.5 pr-3 text-gray-800">Total previsto</td>
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

      <DetalheP0 alvo={detalhe} onFechar={() => setDetalhe(null)} />
    </div>
  );
}
