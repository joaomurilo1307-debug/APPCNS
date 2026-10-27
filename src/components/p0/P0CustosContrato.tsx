"use client";

// Aba P0 > Custos de contrato. O P0 so' faz sentido contra o REALIZADO do Senior, entao tudo aqui e' previsto x realizado, mes a mes:
// o cabecalho (onde o contrato esta' no P0), os numeros-chave, o grafico previsto x realizado, o comparativo conta a conta, a diferenca por tipo de
// custo em cada mes e, por ultimo, a tabela plano de contas x mes com o previsto de cada linha (clique = linhas do P0 por tras do valor).
// Nada compara previsto com previsto. As comparacoes aparecem a medida que o Senior lanca o realizado de cada mes.
// So' o P0 de custo de contrato: salario CLT, encargos, ferias, 13o e provisoes ficam guardados a' parte (aba "Custos pessoais", que vem depois).

import { Fragment, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { COR_DEMAIS, agruparPorGrupo, contaPassa, coresDosGrupos, linhasDoContrato, soma, variacao, type ContaDoContrato, type ContratoCusto, type Filtros } from "@/lib/custos/agregacao";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import { baixarCsv } from "@/lib/custos/csv";
import BotaoExcel from "@/components/BotaoExcel";
import { abaDeLinhas } from "@/lib/exportarExcel";
import { BarrasVariacao } from "@/components/custos/acompanhamento";
import { Sparkline, estiloCelulaCalor } from "@/components/custos/graficos";
import { Cartao, Kpi, SeloReembolsavel, Variacao } from "@/components/custos/ui";
import { compararMes, desviosContraP0, totaisPorMes } from "@/lib/p0/comparar";
import { mesesEntre, type P0Custos } from "@/lib/p0/montar";
import ComparativoP0 from "./ComparativoP0";
import DetalheP0, { type AlvoP0 } from "./DetalheP0";
import FiltrosP0 from "./FiltrosP0";
import GraficoPrevistoRealizado, { LegendaPrevistoRealizado } from "./GraficoPrevistoRealizado";
import HeroP0 from "./HeroP0";
import NavSecoesP0 from "./NavSecoesP0";
import PeriodoP0 from "./PeriodoP0";
import TiposDeCustoPorMes from "./TiposDeCustoPorMes";
import { useP0Custos } from "./useP0Custos";
import { useRealizadoDoContrato } from "./useRealizadoDoContrato";

const SEM_FILTRO: Pick<Filtros, "tipo" | "grupo"> = { tipo: "todos", grupo: "todos" };

function Esqueleto() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="h-56 animate-pulse rounded-2xl bg-gray-200/70" />
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
  const [modo, setModo] = useState<"linha" | "acumulado">("linha");
  const [modoCol, setModoCol] = useState<"mensal" | "acumulado">("mensal");
  const [deEsc, setDeEsc] = useState<string | null>(null);
  const [ateEsc, setAteEsc] = useState<string | null>(null);
  const [mesCmp, setMesCmp] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AlvoP0 | null>(null);
  // filtros (tipo de custo, grupo de contas e busca por conta): valem para o previsto, o realizado, os graficos e as tabelas
  const [filtros, setFiltros] = useState<Pick<Filtros, "tipo" | "grupo">>(SEM_FILTRO);
  const [busca, setBusca] = useState("");
  const mudarFiltros = (parcial: Partial<Pick<Filtros, "tipo" | "grupo">>) =>
    setFiltros((f) => {
      const n = { ...f, ...parcial };
      // trocou o tipo e o grupo escolhido nao existe mais nele: volta para todos os grupos
      if (parcial.tipo && n.grupo !== "todos" && !p0.contas.some((c) => c.grupoCodigo === n.grupo && contaPassa(c, { tipo: n.tipo, grupo: "todos" }))) n.grupo = "todos";
      return n;
    });
  const gruposDoFiltro = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of p0.contas) if (contaPassa(c, { tipo: filtros.tipo, grupo: "todos" })) m.set(c.grupoCodigo, c.grupoNome);
    return Array.from(m, ([codigo, nome]) => ({ codigo, nome })).sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  }, [p0.contas, filtros.tipo]);
  const termoBusca = busca.trim().toLowerCase();
  const passaNoFiltro = (c: ContaDoContrato) => contaPassa(c, filtros) && (!termoBusca || c.contaFinanceira.toLowerCase().includes(termoBusca));

  // o P0 cobre do primeiro ao ultimo mes com previsao, sem pular nenhum (um mes sem previsao no meio, como uma pausa, aparece zerado)
  const mesesP = useMemo(() => mesesEntre(p0.mesIni, p0.mesFim), [p0.mesIni, p0.mesFim]);
  const mesCorrente = realizado.mesCorrente;
  const contratoP0: ContratoCusto = useMemo(
    () => ({ codccu: p0.codccu, contrato: nomeContrato, nome: nomeContrato, teamId: null, teamName: null, projectName: null, totalGeral: p0.totalCusto, ultimaCompetencia: null, contas: p0.contas }),
    [p0, nomeContrato]
  );
  const cores = useMemo(() => coresDosGrupos([contratoP0]), [contratoP0]);

  const todas = useMemo(() => linhasDoContrato(contratoP0, { de: p0.mesIni, ate: p0.mesFim, ...filtros }, mesesP, busca), [contratoP0, p0.mesIni, p0.mesFim, mesesP, filtros, busca]);
  const linhas = useMemo(() => todas.filter((l) => l.total !== 0).sort((a, b) => b.total - a.total), [todas]);
  const grupos = useMemo(() => agruparPorGrupo(linhas, mesesP.length), [linhas, mesesP.length]);
  const totaisMes = useMemo(() => mesesP.map((_, i) => soma(linhas.map((l) => l.serie[i]))), [linhas, mesesP]);
  const totalP = soma(totaisMes);

  // realizado do Senior, mes a mes (so' ate o mes corrente; o mes corrente e' parcial: so' o ja' pago)
  const contaRealizado = realizado.contrato?.contas ?? [];
  const realizadoMes = useMemo(() => {
    if (!realizado.contrato) return null;
    return totaisPorMes(contaRealizado, mesesP, filtros, busca).map((v, i) => (mesCorrente && mesesP[i] <= mesCorrente ? v : null));
  }, [realizado.contrato, contaRealizado, mesesP, mesCorrente, filtros, busca]);
  const iParcial = mesCorrente ? mesesP.indexOf(mesCorrente) : -1;
  const iUltimoReal = realizadoMes ? realizadoMes.reduce<number>((u, v, i) => (v !== null ? i : u), -1) : -1;
  const temRealizado = iUltimoReal >= 0;

  // periodo de analise (vale para todos os graficos e tabelas): padrao = do inicio do P0 ate 3 meses depois do ultimo realizado
  const iFimPadrao = temRealizado ? Math.min(mesesP.length - 1, iUltimoReal + 3) : mesesP.length - 1;
  const de = deEsc && mesesP.includes(deEsc) ? deEsc : mesesP[0];
  const ateBruto = ateEsc && mesesP.includes(ateEsc) ? ateEsc : mesesP[iFimPadrao];
  const ate = ateBruto < de ? de : ateBruto;
  const iDe = mesesP.indexOf(de);
  const iAte = mesesP.indexOf(ate);
  const mesesJ = mesesP.slice(iDe, iAte + 1);
  const previstoJ = totaisMes.slice(iDe, iAte + 1);
  const realizadoJ = realizadoMes ? realizadoMes.slice(iDe, iAte + 1) : mesesJ.map(() => null);
  const iParcialJ = iParcial >= iDe && iParcial <= iAte ? iParcial - iDe : null;
  const desviosJ = temRealizado ? desviosContraP0(realizadoJ.map((v) => v ?? 0), previstoJ, iParcialJ).map((d, i) => (realizadoJ[i] === null ? null : d)) : null;
  const totalJ = soma(previstoJ);
  const linhasJ = useMemo(
    () =>
      todas
        .map((l) => {
          const serieP = l.serie.slice(iDe, iAte + 1);
          return { ...l, serieP, totalP: soma(serieP) };
        })
        .filter((l) => l.totalP !== 0)
        .sort((a, b) => b.totalP - a.totalP),
    [todas, iDe, iAte]
  );
  const gruposJ = useMemo(() => agruparPorGrupo(linhasJ.map((l) => ({ conta: l.conta, serie: l.serieP, total: l.totalP })), mesesJ.length), [linhasJ, mesesJ.length]);

  // comparativo conta a conta (mes padrao: o ultimo mes FECHADO do periodo que ja' tem realizado)
  const mesesComRealizado = mesesJ.filter((m) => !!mesCorrente && m <= mesCorrente);
  const ultimoFechado = [...mesesComRealizado].reverse().find((m) => m !== mesCorrente) ?? mesesComRealizado[mesesComRealizado.length - 1];
  const mesDoComparativo = mesCmp && mesesComRealizado.includes(mesCmp) ? mesCmp : ultimoFechado;
  const comparacaoDoMes = useMemo(
    () => (realizado.contrato && mesDoComparativo ? compararMes({ p0: p0.contas, realizado: contaRealizado, mes: mesDoComparativo, periodo: { mesIni: p0.mesIni, mesFim: p0.mesFim }, filtros, busca }) : null),
    [realizado.contrato, mesDoComparativo, p0, contaRealizado, filtros, busca]
  );
  const maiorDesvio = useMemo(() => {
    if (!comparacaoDoMes) return null;
    let melhor: (typeof comparacaoDoMes.grupos)[number]["linhas"][number] | null = null;
    for (const g of comparacaoDoMes.grupos) for (const l of g.linhas) if (!melhor || Math.abs(l.delta) > Math.abs(melhor.delta)) melhor = l;
    return melhor && Math.abs(melhor.delta) >= 0.005 ? melhor : null;
  }, [comparacaoDoMes]);

  // numeros-chave
  const mesRef = mesCorrente && mesCorrente >= p0.mesIni && mesCorrente <= p0.mesFim ? mesCorrente : null;
  const iRef = mesRef ? mesesP.indexOf(mesRef) : -1;
  const kpiAcum = (() => {
    let pp = 0;
    let rr = 0;
    let n = 0;
    let ateMes = "";
    mesesJ.forEach((m, i) => {
      if (realizadoJ[i] === null || m === mesCorrente) return;
      pp += previstoJ[i];
      rr += realizadoJ[i] ?? 0;
      n++;
      ateMes = m;
    });
    return n ? { p: pp, r: rr, n, ate: ateMes } : null;
  })();
  // P0 que comeca no mes atual: nenhum mes fechou ainda, entao a comparacao so' comeca quando ele fechar
  const comecaNoMesAtual = !!mesCorrente && mesesP[0] === mesCorrente;
  const mesDoComparativoEmAndamento = !!mesCorrente && mesDoComparativo === mesCorrente;
  const semRealizadoTexto = realizado.carregando ? "lendo o realizado do Senior…" : realizado.erro ? "realizado do Senior indisponível" : !realizado.contrato ? "sem realizado do Senior neste contrato" : comecaNoMesAtual ? `o P0 começa em ${mesCurto(mesCorrente!)}: nenhum mês fechou ainda` : "ainda sem realizado nos meses do P0";

  // "Tipo de custo x mes" recebe as contas ja' filtradas (ele nao tem filtro proprio)
  const p0Filtrado = useMemo(() => ({ ...p0, contas: p0.contas.filter(passaNoFiltro) }), [p0, filtros, termoBusca]); // eslint-disable-line react-hooks/exhaustive-deps
  const realizadoFiltrado = useMemo(() => contaRealizado.filter(passaNoFiltro), [contaRealizado, filtros, termoBusca]); // eslint-disable-line react-hooks/exhaustive-deps

  const nomeArquivo = `p0_${p0.codccu}_${nomeContrato.replace(/[^\w]+/g, "_").slice(0, 40)}`;
  function linhasQuadro(): (string | number)[][] {
    const cab = ["Tipo de custo", "Conta financeira", "Reembolsável", ...mesesJ.map(mesCurto), "Total previsto", "% do período"];
    const corpo: (string | number)[][] = [];
    for (const g of gruposJ) for (const l of g.linhas) corpo.push([g.grupoNome, l.conta.contaFinanceira, l.conta.reembolsavel ? "sim" : "não", ...l.serie, l.total, totalJ ? l.total / totalJ : 0]);
    corpo.push(["", "TOTAL", "", ...previstoJ, totalJ, 1]);
    return [cab, ...corpo];
  }

  const alternarGrupo = (g: string) =>
    setFechados((a) => {
      const n = new Set(a);
      if (n.has(g)) n.delete(g);
      else n.add(g);
      return n;
    });

  const abrirCelula = (conta: string, mesIdx: number, valor: number, reembolsavel: boolean) => setDetalhe({ codccu: p0.codccu, conta, mes: mesesJ[mesIdx], valor, reembolsavel, rotulo: p0.rotulo });
  const celula = (v: number, max: number, mesIdx: number, conta: string, reembolsavel: boolean) =>
    v ? (
      <button
        type="button"
        onClick={() => abrirCelula(conta, mesIdx, v, reembolsavel)}
        className="block w-full rounded-md px-1.5 py-1 text-right text-[13px] tabular-nums transition hover:ring-2 hover:ring-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
        style={estiloCelulaCalor(v, max)}
        title={`${conta} · ${mesLongo(mesesJ[mesIdx])}: ${moeda(v)} previsto — clique para ver as linhas do P0`}
      >
        {moedaCompacta(v).replace("R$ ", "")}
      </button>
    ) : (
      <span className="block px-1.5 py-1 text-right text-[13px] text-gray-300">–</span>
    );

  return (
    <div className="space-y-5">
      <HeroP0 rotulo={p0.rotulo} origem={p0.origem} rotuloNaPlanilha={p0.rotuloNaPlanilha} meses={mesesP} previsto={totaisMes} realizado={realizadoMes} mesCorrente={mesCorrente} />

      <NavSecoesP0
        itens={[
          { id: "p0-resumo", nome: "Resumo" },
          { id: "p0-grafico", nome: "Previsto × realizado" },
          ...(comparacaoDoMes ? [{ id: "p0-comparativo", nome: "Contas do mês" }, { id: "p0-tipos", nome: "Tipo de custo × mês" }] : []),
          { id: "p0-tabela", nome: "Plano de contas (P0)" },
        ]}
      />

      <PeriodoP0 meses={mesesP} de={de} ate={ate} mesCorrente={mesCorrente} onMudar={(d, a) => { setDeEsc(d); setAteEsc(a); }} />

      <FiltrosP0 filtros={filtros} onMudar={mudarFiltros} grupos={gruposDoFiltro} busca={busca} onBusca={setBusca} />

      <div id="p0-resumo" className="grid scroll-mt-16 grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi rotulo={mesesJ.length === mesesP.length ? "Previsto no P0" : "Previsto no período"} valor={moedaCompacta(totalJ)} detalhe={`custo de contrato · ${linhasJ.length} ${linhasJ.length === 1 ? "conta" : "contas"} · ${mesesJ.length} ${mesesJ.length === 1 ? "mês" : "meses"}`} destaque lateral={<Sparkline valores={previstoJ} largura={132} altura={30} />} />
        {iRef >= 0 && realizadoMes && realizadoMes[iRef] !== null ? (
          <Kpi
            rotulo={`Realizado em ${mesCurto(mesRef!)}`}
            valor={moedaCompacta(realizadoMes[iRef] ?? 0)}
            detalhe={
              <>
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-medium text-amber-800">em andamento</span>{" "}
                <span>
                  de {moedaCompacta(totaisMes[iRef])} previstos{totaisMes[iRef] > 0 ? ` (${percentual((realizadoMes[iRef] ?? 0) / totaisMes[iRef], 0)})` : ""}
                </span>
              </>
            }
          />
        ) : (
          <Kpi rotulo="Realizado no mês" valor="—" detalhe={semRealizadoTexto} />
        )}
        {comparacaoDoMes && comparacaoDoMes.temP0 && mesDoComparativo !== mesCorrente ? (
          <Kpi
            rotulo={`Realizado em ${mesCurto(mesDoComparativo!)}`}
            valor={moedaCompacta(comparacaoDoMes.realizado)}
            detalhe={
              <>
                <Variacao v={variacao(comparacaoDoMes.realizado, comparacaoDoMes.previsto)} sufixo="vs P0" /> <span>· P0 {moedaCompacta(comparacaoDoMes.previsto)}</span>
              </>
            }
          />
        ) : (
          <Kpi rotulo="Último mês fechado" valor="—" detalhe={semRealizadoTexto} />
        )}
        <Kpi
          rotulo={kpiAcum ? `No período · até ${mesCurto(kpiAcum.ate)}` : "Realizado × P0 no período"}
          valor={kpiAcum ? `${kpiAcum.r - kpiAcum.p > 0.005 ? "+" : kpiAcum.r - kpiAcum.p < -0.005 ? "−" : ""}${moedaCompacta(Math.abs(kpiAcum.r - kpiAcum.p))}` : "—"}
          detalhe={
            kpiAcum ? (
              <>
                <Variacao v={variacao(kpiAcum.r, kpiAcum.p)} sufixo="vs P0" /> <span>· P0 {moedaCompacta(kpiAcum.p)} · {kpiAcum.n} {kpiAcum.n === 1 ? "mês fechado" : "meses fechados"}</span>
              </>
            ) : (
              semRealizadoTexto
            )
          }
        />
        {maiorDesvio ? (
          <Kpi
            rotulo={mesDoComparativoEmAndamento ? `Maior diferença · ${mesCurto(mesDoComparativo!)} (em andamento)` : `Maior desvio · ${mesCurto(mesDoComparativo!)}`}
            valor={<span className="block truncate text-lg">{maiorDesvio.nome}</span>}
            detalhe={
              // mes em andamento: o realizado e' so' o ja' pago, entao "abaixo do P0" seria enganoso (a conta pode ainda ser paga no mes)
              <span className={mesDoComparativoEmAndamento ? "font-medium text-gray-600" : maiorDesvio.delta > 0 ? "font-medium text-red-600" : "font-medium text-emerald-700"}>
                {maiorDesvio.delta > 0 ? "+" : "−"}
                {moedaCompacta(Math.abs(maiorDesvio.delta))} {maiorDesvio.delta > 0 ? "acima do P0" : mesDoComparativoEmAndamento ? "do previsto ainda não pago" : "abaixo do P0"}
              </span>
            }
          />
        ) : (
          <Kpi rotulo="Maior desvio" valor="—" detalhe={semRealizadoTexto} />
        )}
      </div>

      <div id="p0-grafico" className="scroll-mt-16 space-y-5">
        <Cartao
          titulo="Previsto × realizado, mês a mês"
          subtitulo={modoCol === "acumulado" ? "Quanto o P0 previa acumular e quanto o Senior já realizou" : "O que o P0 previa em cada mês contra o que o Senior realizou · os meses por vir mostram só o previsto"}
          acao={
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200" role="group" aria-label="Tipo de gráfico">
              {(["mensal", "acumulado"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setModoCol(k)} className={`px-3 py-1.5 text-[13px] font-medium ${modoCol === k ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                  {k === "mensal" ? "Mensal" : "Acumulado"}
                </button>
              ))}
            </div>
          }
        >
          <div className="mb-3">
            <LegendaPrevistoRealizado modo={modoCol} temRealizado={temRealizado} />
          </div>
          <GraficoPrevistoRealizado meses={mesesJ} previsto={previstoJ} realizado={realizadoJ} mesCorrente={mesCorrente} modo={modoCol} mesDestaque={mesDoComparativo} onMesClick={setMesCmp} />
          {!temRealizado && <p className="mt-2 text-[13px] text-gray-500">{semRealizadoTexto.charAt(0).toUpperCase() + semRealizadoTexto.slice(1)}. O previsto continua valendo; o realizado aparece aqui assim que o Senior lançar.</p>}
          {modoCol === "mensal" && desviosJ && desviosJ.some((v) => v !== null) && (
            <div className="mt-4 border-t border-gray-100 pt-3">
              <h3 className="mb-1 text-sm font-semibold text-gray-800">
                Quanto o realizado passou ou ficou abaixo do P0 <span className="font-normal text-gray-500">· em % do previsto de cada mês</span>
              </h3>
              <BarrasVariacao meses={mesesJ} variacoes={desviosJ} selecionado={mesDoComparativo} onSelecionar={setMesCmp} contra="o P0" dicaClique="clique para ver as contas deste mês" rotuloAlta="▲ acima" rotuloQueda="▼ abaixo" altura={150} />
              <p className="mt-1 text-xs text-gray-500">Vermelho = o mês custou mais do que o P0 previa; verde = custou menos. O mês em andamento fica de fora (só o já pago). Clique numa barra para ver as contas daquele mês.</p>
            </div>
          )}
        </Cartao>

        {temRealizado && (
          <Cartao
            titulo="Acompanhamento mensal"
            subtitulo={modo === "acumulado" ? "Quanto o P0 previa acumular e quanto o Senior já realizou · * mês em andamento (só o já pago)" : "A linha do realizado do Senior contra a linha do previsto no P0, mês a mês · * mês em andamento (só o já pago)"}
            acao={
              <div className="inline-flex overflow-hidden rounded-lg border border-gray-200" role="group" aria-label="Tipo de gráfico">
                {(["linha", "acumulado"] as const).map((k) => (
                  <button key={k} type="button" onClick={() => setModo(k)} className={`px-3 py-1.5 text-[13px] font-medium ${modo === k ? "bg-brand text-white" : "bg-white text-gray-600 hover:bg-gray-50"}`}>
                    {k === "linha" ? "Mensal" : "Acumulado"}
                  </button>
                ))}
              </div>
            }
          >
            <div className="mb-3">
              <LegendaPrevistoRealizado modo={modo} temRealizado={temRealizado} />
            </div>
            <GraficoPrevistoRealizado meses={mesesJ} previsto={previstoJ} realizado={realizadoJ} mesCorrente={mesCorrente} modo={modo} mesDestaque={mesDoComparativo} onMesClick={setMesCmp} />
          </Cartao>
        )}
      </div>

      {comparacaoDoMes && mesDoComparativo && (
        <div id="p0-comparativo" className="scroll-mt-16">
          <ComparativoP0 p0={p0} realizado={contaRealizado} mes={mesDoComparativo} mesesEscolha={mesesComRealizado} onMes={setMesCmp} filtros={filtros} busca={busca} mesCorrente={mesCorrente} baseRotulo={realizado.base === "competencia" ? "competência da nota" : "data de pagamento"} nomeArquivo={p0.codccu} />
        </div>
      )}

      {comparacaoDoMes && (
        <div id="p0-tipos" className="scroll-mt-16">
          <TiposDeCustoPorMes p0={p0Filtrado} realizado={realizadoFiltrado} meses={mesesComRealizado} mesCorrente={mesCorrente} mesSelecionado={mesDoComparativo} onMes={setMesCmp} />
        </div>
      )}

      <div id="p0-tabela" className="scroll-mt-16">
        <Cartao
          titulo="Plano de contas × mês (P0)"
          subtitulo="O previsto de cada conta em cada mês do período, com a representatividade de cada uma · clique numa célula para ver as linhas do P0 por trás do valor · o realizado de cada mês está acima, nas contas do mês"
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
                  {mesesJ.map((m) => (
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
                  ? gruposJ.map((g) => {
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
                            <td className="border-b border-gray-100 px-3 py-2 text-right text-[13px] tabular-nums text-gray-500">{percentual(totalJ ? g.total / totalJ : 0, 1)}</td>
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
                                  <td className="border-b border-gray-100 px-3 py-1 text-right text-[13px] tabular-nums text-gray-500">{percentual(totalJ ? l.total / totalJ : 0, 1)}</td>
                                </tr>
                              );
                            })}
                        </Fragment>
                      );
                    })
                  : linhasJ.map((l) => {
                      const max = Math.max(...l.serieP, 0);
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
                          {l.serieP.map((v, i) => (
                            <td key={i} className="border-b border-gray-100 p-0.5">
                              {celula(v, max, i, l.conta.contaFinanceira, l.conta.reembolsavel)}
                            </td>
                          ))}
                          <td className="border-b border-gray-100 px-3 py-1 text-right tabular-nums text-gray-800">{moeda(l.totalP)}</td>
                          <td className="border-b border-gray-100 px-3 py-1 text-right text-[13px] tabular-nums text-gray-500">{percentual(totalJ ? l.totalP / totalJ : 0, 1)}</td>
                        </tr>
                      );
                    })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="sticky left-0 z-10 bg-gray-100 py-2.5 pr-3 text-gray-800">Total previsto</td>
                  {previstoJ.map((v, i) => (
                    <td key={i} className="bg-gray-100 px-1.5 py-2.5 text-right text-[13px] tabular-nums text-gray-800">
                      {v ? moedaCompacta(v).replace("R$ ", "") : "–"}
                    </td>
                  ))}
                  <td className="bg-gray-100 px-3 py-2.5 text-right tabular-nums text-gray-900">{moeda(totalJ)}</td>
                  <td className="bg-gray-100 px-3 py-2.5 text-right text-xs text-gray-500">100%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Cartao>
      </div>

      <DetalheP0 alvo={detalhe} onFechar={() => setDetalhe(null)} />
    </div>
  );
}
