"use client";

// Resultado operacional: receita - custos, da empresa, de cada area e de cada contrato. Receita = Receita e Medicao; custo = Custo por Centro de Custo; pessoal = folha CLT (so' com
// o acesso restrito). Tudo vem dos mesmos motores das outras telas: nada e' digitado. `ccuFixo` = embutido na aba "Resultado" do contrato (um centro so', sem ranking).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import BotaoExcel from "@/components/BotaoExcel";
import { Cartao, Kpi, Variacao } from "@/components/custos/ui";
import { abaDeLinhas } from "@/lib/exportarExcel";
import type { BaseMes, ContratoCusto, TipoCusto } from "@/lib/custos/agregacao";
import { dataHoraCurta, mesCurto, mesLongo, moeda, moedaCompacta, percentual } from "@/lib/custos/formato";
import {
  agruparPorArea, CENTROS_JUNTOS, curvaDoResultado, gerarInsights, indicesDoPeriodo, juntarCentros, mesDoCentro, resumir, ROTULO_SELO, seloDoCentro, somarSeries,
  type Insight, type LinhaDoResultado, type Opcoes, type Selo,
} from "@/lib/resultado/calculo";
import { montarLinhas, type CentroDaApi } from "@/lib/resultado/montar";
import DetalheDoResultado from "./DetalheDoResultado";
import { BarrasMensais, corDoResultado, COR, Dispersao, LegendaMensal, LinhaSimples, PonteDoResultado, RankingResultado, type PassoPonte, type PontoMensal } from "./graficos";

type DadosApi = { hoje: string; mesAtual: string; meses: string[]; centros: CentroDaApi[]; podePessoal: boolean; mesesComFolha: string[]; pessoalAtualizadoEm: string | null; medicaoAtualizadaEm: string | null; faturamentoErro: string | null };
type DadosCusto = { contratos: ContratoCusto[]; meses: string[]; temCompetencia?: boolean; atualizacao: { ultimaOk: { finalizadoEm: string | null } | null; emCurso: unknown | null } };
type Carga<T> = { estado: "carregando" } | { estado: "erro"; mensagem: string } | { estado: "ok"; dados: T };

async function buscar<T>(url: string, falha: string, sinal: AbortSignal): Promise<T> {
  const r = await fetch(url, { cache: "no-store", signal: sinal });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(r.status === 403 ? "Você não tem acesso a esta tela." : j.error || falha);
  return j as T;
}

type Visao = "empresa" | "contratos" | "ENGENHARIA" | "AMBIENTAL";
const VISOES: { id: Visao; rotulo: string; ajuda: string }[] = [
  { id: "empresa", rotulo: "Empresa", ajuda: "Contratos mais a estrutura administrativa" },
  { id: "contratos", rotulo: "Só contratos", ajuda: "Sem a estrutura administrativa" },
  { id: "ENGENHARIA", rotulo: "Engenharia", ajuda: "Contratos da área de Engenharia" },
  { id: "AMBIENTAL", rotulo: "Ambiental", ajuda: "Contratos da área Ambiental" },
];

const SELO_ESTILO: Record<Selo, string> = {
  prejuizo: "bg-red-100 text-red-700", acima: "bg-emerald-100 text-emerald-800", abaixo: "bg-amber-100 text-amber-800", "sem-receita": "bg-gray-100 text-gray-600", "sem-custo": "bg-gray-100 text-gray-500",
};
const TOM_ESTILO: Record<Insight["tom"], string> = { bom: "bg-emerald-500", atencao: "bg-amber-500", alerta: "bg-red-500", info: "bg-sky-500" };

function Chip({ ativo, onClick, children, titulo }: { ativo: boolean; onClick: () => void; children: React.ReactNode; titulo?: string }) {
  return <button type="button" title={titulo} aria-pressed={ativo} onClick={onClick} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${ativo ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{children}</button>;
}

export default function ResultadoOperacionalView({ ccuFixo }: { ccuFixo?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [api, setApi] = useState<Carga<DadosApi>>({ estado: "carregando" });
  const [custo, setCusto] = useState<Carga<DadosCusto>>({ estado: "carregando" });
  const [ordem, setOrdem] = useState<{ chave: string; desc: boolean }>({ chave: "resultado", desc: true });
  const [verTodos, setVerTodos] = useState(false);

  useEffect(() => {
    const c = new AbortController();
    buscar<DadosApi>("/api/resultado-operacional", "Não foi possível carregar a receita e o pessoal.", c.signal).then((d) => setApi({ estado: "ok", dados: d })).catch((e) => !c.signal.aborted && setApi({ estado: "erro", mensagem: e.message }));
    buscar<DadosCusto>("/api/custos-conta", "Não foi possível carregar os custos.", c.signal).then((d) => setCusto({ estado: "ok", dados: d })).catch((e) => !c.signal.aborted && setCusto({ estado: "erro", mensagem: e.message }));
    return () => c.abort();
  }, []);

  const mudarUrl = useCallback((parcial: Record<string, string | null>) => {
    const n = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(parcial)) (v === null || v === "" ? n.delete(k) : n.set(k, v));
    router.replace(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  const dados = api.estado === "ok" ? api.dados : null;
  const dadosCusto = custo.estado === "ok" ? custo.dados : null;
  const temCompetencia = !!dadosCusto?.temCompetencia;
  const base: BaseMes = params.get("base") === "competencia" && temCompetencia ? "competencia" : "pagamento";
  const tipoParam = params.get("tipo");
  const tipo: TipoCusto = tipoParam === "proprio" || tipoParam === "reembolsavel" ? tipoParam : "todos";
  const liquida = params.get("rec") !== "bruta";
  const comPessoal = !!dados?.podePessoal && params.get("pes") !== "0";
  const juntar = params.get("junto") !== "0";
  const visaoParam = params.get("vis");
  const visao: Visao = (VISOES.find((v) => v.id === visaoParam)?.id ?? "empresa") as Visao;
  const busca = (params.get("q") ?? "").trim().toLowerCase();
  const opcoes: Opcoes = useMemo(() => ({ liquida, comPessoal }), [liquida, comPessoal]);

  const meses = dados?.meses ?? [];
  const mesParcial = dados?.mesAtual ?? "";
  const hoje = dados?.hoje ?? "";
  const todasLinhas = useMemo(() => {
    if (!dados || !dadosCusto) return [];
    const linhas = montarLinhas(dados.centros, dadosCusto.contratos, dados.meses, { base, tipo });
    return juntar ? juntarCentros(linhas) : linhas;
  }, [dados, dadosCusto, base, tipo, juntar]);

  // periodo: padrao = de janeiro ao ultimo mes FECHADO (e, com pessoal, ate onde a folha esta carregada)
  const ultimoFechado = meses.length ? (meses[meses.length - 1] === mesParcial && meses.length > 1 ? meses[meses.length - 2] : meses[meses.length - 1]) : "";
  const ultimoComFolha = dados && comPessoal && dados.mesesComFolha.length ? dados.mesesComFolha[dados.mesesComFolha.length - 1] : null;
  const padraoAte = ultimoComFolha && ultimoComFolha < ultimoFechado ? ultimoComFolha : ultimoFechado;
  const valido = (m: string | null) => (m && meses.includes(m) ? m : null);
  const de = valido(params.get("de")) ?? meses[0] ?? "";
  const ateBruto = valido(params.get("ate")) ?? padraoAte;
  const ate = ateBruto < de ? de : ateBruto;
  const idx = useMemo(() => indicesDoPeriodo(meses, de, ate), [meses, de, ate]);
  const mesesSemFolha = comPessoal && dados ? idx.map((i) => meses[i]).filter((m) => !dados.mesesComFolha.includes(m)) : [];

  // escopo: um centro (aba do contrato), ou a empresa/area
  const centroUnico = useMemo(() => {
    if (!ccuFixo) return null;
    const merged = juntar && (CENTROS_JUNTOS.partes as readonly string[]).includes(ccuFixo) ? todasLinhas.find((l) => l.codccu === CENTROS_JUNTOS.codigo) : undefined;
    return merged ?? todasLinhas.find((l) => l.codccu === ccuFixo) ?? null;
  }, [ccuFixo, juntar, todasLinhas]);
  const selecionado = !ccuFixo ? todasLinhas.find((l) => l.codccu === params.get("ccu")) ?? null : null;

  const contratos = useMemo(() => todasLinhas.filter((l) => l.tipo === "CONTRATO" && (visao === "ENGENHARIA" || visao === "AMBIENTAL" ? l.area === visao : true)), [todasLinhas, visao]);
  const estrutura = useMemo(() => (visao === "empresa" ? todasLinhas.filter((l) => l.tipo === "ADMINISTRATIVO") : []), [todasLinhas, visao]);
  const escopoLinhas = useMemo(() => (ccuFixo ? (centroUnico ? [centroUnico] : []) : [...contratos, ...estrutura]), [ccuFixo, centroUnico, contratos, estrutura]);

  const r = useMemo(() => resumir(escopoLinhas, idx, opcoes), [escopoLinhas, idx, opcoes]);
  const rContratos = useMemo(() => resumir(ccuFixo ? escopoLinhas : contratos, idx, opcoes), [ccuFixo, escopoLinhas, contratos, idx, opcoes]);
  const rEstrutura = useMemo(() => resumir(estrutura, idx, opcoes), [estrutura, idx, opcoes]);
  const anterior = useMemo(() => {
    const n = idx.length;
    if (!n || idx[0] - n < 0) return null;
    return resumir(escopoLinhas, Array.from({ length: n }, (_, k) => idx[0] - n + k), opcoes);
  }, [escopoLinhas, idx, opcoes]);

  const somadas = useMemo(() => somarSeries(escopoLinhas, meses.length), [escopoLinhas, meses.length]);
  const curva = useMemo(() => curvaDoResultado(somadas, meses.length, opcoes), [somadas, meses.length, opcoes]);
  const pontos: PontoMensal[] = idx.map((i) => { const m = curva.meses[i]; return { mes: meses[i], receita: opcoes.liquida ? m.receitaLiquida : m.receita, custo: m.custo, pessoal: m.pessoal, resultado: m.resultado, margem: m.margem }; });
  const acum = (() => { let a = 0; return idx.map((i) => (a = Math.round((a + curva.meses[i].resultado) * 100) / 100)); })();
  const mesesDoPeriodo = idx.map((i) => meses[i]);

  const porContrato = useMemo(() => contratos.map((l) => ({ l, r: resumir([l], idx, opcoes), serie: idx.map((i) => mesDoCentro(l, i, opcoes).resultado) })), [contratos, idx, opcoes]);
  const carteira = useMemo(() => resumir(contratos, idx, opcoes), [contratos, idx, opcoes]);
  const ativos = porContrato.filter((x) => x.r.receita !== 0 || x.r.custo !== 0 || x.r.pessoal !== 0);
  const insights = useMemo(() => (ccuFixo ? [] : gerarInsights(contratos, meses, idx, opcoes, hoje, mesParcial)), [ccuFixo, contratos, meses, idx, opcoes, hoje, mesParcial]);

  if (api.estado === "erro" || custo.estado === "erro") {
    return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{api.estado === "erro" ? api.mensagem : custo.estado === "erro" ? custo.mensagem : ""}</div>;
  }
  if (!dados || !dadosCusto) return <div className="space-y-4" aria-busy aria-label="Carregando o resultado operacional"><div className="h-24 animate-pulse rounded-2xl bg-gray-200/70" /><div className="grid grid-cols-5 gap-3">{[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-28 animate-pulse rounded-2xl bg-gray-200/70" />)}</div><div className="h-80 animate-pulse rounded-2xl bg-gray-200/70" /></div>;
  if (ccuFixo && !centroUnico) return <Cartao titulo="Resultado operacional"><p className="rounded-xl border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500">Este centro de custo ainda não tem receita nem custo lidos pelo sistema.</p></Cartao>;

  const mudarPeriodo = (d: string, a: string) => mudarUrl({ de: d, ate: a });
  const seletorMes = (valor: string, aoMudar: (m: string) => void, rotulo: string) => (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13.5px] focus:border-brand focus:outline-none">{meses.map((m) => <option key={m} value={m}>{mesLongo(m).replace(" de ", " ")}{m === mesParcial ? " (em andamento)" : ""}</option>)}</select>
  );
  const n = meses.length;
  const atalhos: { rotulo: string; de: string; ate: string }[] = [
    { rotulo: "Último mês fechado", de: ultimoFechado, ate: ultimoFechado },
    ...(n >= 4 ? [{ rotulo: "Últimos 3 meses", de: meses[Math.max(0, meses.indexOf(ultimoFechado) - 2)], ate: ultimoFechado }] : []),
    { rotulo: `Ano ${meses[0]?.slice(0, 4)} (até o último fechado)`, de: meses[0], ate: ultimoFechado },
    { rotulo: "Tudo, com o mês em andamento", de: meses[0], ate: meses[n - 1] },
  ];

  const nomeEscopo = ccuFixo ? centroUnico!.nome : VISOES.find((v) => v.id === visao)!.rotulo;
  const margemTexto = r.margem === null ? "sem receita no período" : `margem ${percentual(r.margem, 1)} ${liquida ? "sobre a receita líquida" : "sobre a receita bruta"}`;
  const delta = anterior && Math.abs(anterior.resultado) > 0.5 ? (r.resultado - anterior.resultado) / Math.abs(anterior.resultado) : null;

  // ponte (cascata)
  const passos: PassoPonte[] = [{ rotulo: "Receita bruta", valor: r.receita, tipo: "total", cor: COR.receita }];
  if (liquida) passos.push({ rotulo: "Retenções", valor: r.retencoes, tipo: "menos", cor: COR.retencao, dica: "impostos retidos nas notas fiscais" }, { rotulo: "Receita líquida", valor: r.receitaLiquida, tipo: "subtotal", cor: "#5eb8b0" });
  const custosContratos = ccuFixo ? r.custo : rContratos.custo;
  passos.push({ rotulo: "Custos", valor: custosContratos, tipo: "menos", cor: COR.custo });
  if (comPessoal) passos.push({ rotulo: "Pessoal", valor: ccuFixo ? r.pessoal : rContratos.pessoal, tipo: "menos", cor: COR.pessoal });
  if (visao === "empresa" && !ccuFixo && (rEstrutura.custo + rEstrutura.pessoal) > 0) passos.push({ rotulo: "Estrutura ADM", valor: rEstrutura.custo + rEstrutura.pessoal, tipo: "menos", cor: "#6b4fd0", dica: "centros administrativos: custos e pessoal" });
  passos.push({ rotulo: visao === "empresa" && !ccuFixo ? "Resultado da empresa" : "Resultado", valor: r.resultado, tipo: "total", cor: r.resultado < 0 ? COR.negativo : "#1f2937" });

  // tabela de contratos
  const filtradosTabela = ativos.filter((x) => !busca || x.l.nome.toLowerCase().includes(busca) || x.l.codccu.includes(busca) || (x.l.cliente ?? "").toLowerCase().includes(busca));
  const chaveOrdem: Record<string, (x: (typeof ativos)[number]) => number | string> = {
    nome: (x) => x.l.nome.toLowerCase(), receita: (x) => x.r.receita, retencoes: (x) => x.r.retencoes, custo: (x) => x.r.custo, pessoal: (x) => x.r.pessoal, resultado: (x) => x.r.resultado, margem: (x) => x.r.margem ?? -999, vigencia: (x) => x.l.vigenciaFim ?? "9999",
  };
  const linhasTabela = [...filtradosTabela].sort((a, b) => { const fa = chaveOrdem[ordem.chave](a), fb = chaveOrdem[ordem.chave](b); const c = typeof fa === "string" ? fa.localeCompare(fb as string, "pt-BR") : (fa as number) - (fb as number); return ordem.desc ? -c : c; });
  const cabecalho = (chave: string, rotulo: string, direita = true) => (
    <th className={`px-3 py-2 ${direita ? "text-right" : "text-left"}`}><button type="button" onClick={() => setOrdem((o) => ({ chave, desc: o.chave === chave ? !o.desc : chave !== "nome" }))} className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-gray-800">{rotulo}{ordem.chave === chave && <span aria-hidden>{ordem.desc ? "↓" : "↑"}</span>}</button></th>
  );

  const maxCalor = Math.max(1, ...ativos.flatMap((x) => idx.map((i) => Math.abs(mesDoCentro(x.l, i, opcoes).resultado))));
  const grupos = agruparPorArea(contratos).filter((g) => g.id !== "ADMINISTRATIVO");

  const exportarTudo = () => {
    const cab = ["Contrato", "CCU", "Cliente", "Área", "Receita bruta", "Retenções", "Receita líquida", "Custos", "Pessoal", "Resultado", "Margem", "Vigência até"];
    const linhas: (string | number | null)[][] = [cab, ...linhasTabela.map((x) => [x.l.nome, x.l.codccu, x.l.cliente, x.l.area ?? "", x.r.receita, x.r.retencoes, x.r.receitaLiquida, x.r.custo, x.r.pessoal, x.r.resultado, x.r.margem, x.l.vigenciaFim])];
    linhas.push(["TOTAL DOS CONTRATOS", "", "", "", carteira.receita, carteira.retencoes, carteira.receitaLiquida, carteira.custo, carteira.pessoal, carteira.resultado, carteira.margem, ""]);
    const mensal: (string | number | null)[][] = [["Mês", "Receita bruta", "Retenções", "Custos", "Pessoal", "Resultado", "Margem", "Acumulado"]];
    idx.forEach((i, k) => mensal.push([mesCurto(meses[i]), curva.meses[i].receita, curva.meses[i].retencoes, curva.meses[i].custo, curva.meses[i].pessoal, curva.meses[i].resultado, curva.meses[i].margem, acum[k]]));
    const nota = `${nomeEscopo} · ${mesLongo(de)} a ${mesLongo(ate)} · resultado ${liquida ? "sobre a receita líquida (após retenções)" : "sobre a receita bruta"}${comPessoal ? ", com custo de pessoal" : ", antes do custo de pessoal"} · custo por ${base === "competencia" ? "competência" : "data de pagamento"}`;
    return [abaDeLinhas("Contratos", linhas, nota, true, { Margem: "percentual" }), abaDeLinhas(`${nomeEscopo}`.slice(0, 28) + " mês a mês", mensal, nota, false, { Margem: "percentual" })];
  };

  const atualizacao = [
    dados.medicaoAtualizadaEm && `receita do Senior de ${dataHoraCurta(dados.medicaoAtualizadaEm)}`,
    dadosCusto.atualizacao.ultimaOk?.finalizadoEm && `custos do Senior de ${dataHoraCurta(dadosCusto.atualizacao.ultimaOk.finalizadoEm)}`,
    comPessoal && dados.pessoalAtualizadoEm && `folha até ${mesCurto(dados.mesesComFolha[dados.mesesComFolha.length - 1] ?? "")}`,
  ].filter(Boolean).join(" · ");

  // ---------------------------------------------------------------- um centro so' (aba do contrato)
  if (ccuFixo) {
    return (
      <div className="space-y-5">
        <Filtros />
        {centroUnico!.codccu === CENTROS_JUNTOS.codigo && (
          <p className="rounded-xl border border-sky-100 bg-sky-50/70 px-4 py-2.5 text-[13px] leading-snug text-sky-900" role="note">Resultado de <b>{CENTROS_JUNTOS.nome}</b> juntos: o custo do 3687 está no 210 (com o 3686) e a receita do 3687 está no 230 (com o 3687 LT); só somados mostram o resultado real. <button type="button" className="font-semibold underline" onClick={() => mudarUrl({ junto: "0" })}>Ver {ccuFixo} separado</button>.</p>
        )}
        <Avisos />
        <DetalheDoResultado linha={centroUnico!} meses={meses} de={de} ate={ate} opcoes={opcoes} mesParcial={mesParcial} hoje={hoje} />
        <ComoCalcula />
      </div>
    );
  }

  // ---------------------------------------------------------------- empresa / area
  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">Resultado Operacional</h1>
          <p className="mt-1 max-w-3xl text-[14px] leading-relaxed text-gray-500">Quanto cada contrato, cada área e a empresa ganham: receita menos custos, mês a mês, com os mesmos números das telas de Receita e Medição e de Custo por Centro de Custo.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">{atualizacao && <span className="max-w-md text-right">{atualizacao}</span>}<BotaoExcel arquivo={`resultado-operacional-${visao.toLowerCase()}`} gerar={exportarTudo} /></div>
      </header>

      <Filtros />
      <Avisos />

      {/* ----------------------------------------------------- indicadores */}
      <section aria-label="Indicadores do período" className="grid gap-3 lg:grid-cols-[1.5fr_1fr_1fr_1fr_1fr]">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-gray-900 via-gray-900 to-teal-900 p-5 text-white shadow-soft">
          <p className="text-xs font-medium uppercase tracking-wide text-teal-100/80">{visao === "empresa" ? "Resultado da empresa" : `Resultado · ${nomeEscopo}`}</p>
          <p className={`mt-1 text-[38px] font-semibold leading-tight tabular-nums tracking-tight ${r.resultado < 0 ? "text-red-300" : ""}`}>{moedaCompacta(r.resultado)}</p>
          <p className="mt-1 text-[13px] text-teal-50/90">{margemTexto}</p>
          <p className="mt-3 text-xs text-teal-100/70">{mesLongo(de)} a {mesLongo(ate)} · {idx.length} {idx.length === 1 ? "mês" : "meses"}</p>
          {delta !== null && anterior && <p className="mt-0.5 text-xs text-teal-100/70">vs. {idx.length} {idx.length === 1 ? "mês" : "meses"} antes ({moedaCompacta(anterior.resultado)}): <span className={`font-semibold ${delta >= 0 ? "text-emerald-300" : "text-red-300"}`}>{delta >= 0 ? "+" : ""}{percentual(delta, 0)}</span></p>}
        </div>
        <Kpi rotulo="Receita bruta" valor={moedaCompacta(r.receita)} detalhe={anterior && anterior.receita ? <Variacao v={(r.receita - anterior.receita) / anterior.receita} sufixo="vs. antes" /> : `líquida ${moedaCompacta(r.receitaLiquida)}`} />
        <Kpi rotulo="Retenções (impostos)" valor={moedaCompacta(r.retencoes)} detalhe={r.receita ? `${percentual(r.retencoes / r.receita, 1)} da receita bruta` : "–"} />
        <Kpi rotulo="Custos" valor={moedaCompacta(r.custo)} detalhe={r.receita ? `${percentual(r.custo / r.receita, 0)} da receita bruta` : "Senior, por " + (base === "competencia" ? "competência" : "pagamento")} />
        <Kpi rotulo={visao === "empresa" ? "Pessoal e estrutura" : "Custo de pessoal"} valor={comPessoal ? moedaCompacta(r.pessoal) : "–"} detalhe={comPessoal ? (visao === "empresa" && rEstrutura.custo > 0 ? `estrutura ADM: ${moedaCompacta(rEstrutura.custo + rEstrutura.pessoal)}` : "folha CLT, encargos e provisões") : dados.podePessoal ? "desligado nas opções" : "acesso restrito"} />
      </section>

      {/* ----------------------------------------------------- ponte + leituras */}
      <div className="grid gap-5 xl:grid-cols-[1.35fr_1fr]">
        <Cartao titulo="Da receita ao resultado" subtitulo="Cada barra tira uma parte da receita até chegar ao resultado do período">
          <PonteDoResultado passos={passos} />
        </Cartao>
        <Cartao titulo="O que os números mostram" subtitulo="Leituras automáticas do período, só com o que está nos dados">
          {insights.length === 0 ? <p className="text-sm text-gray-500">Sem leituras para este recorte.</p> : (
            <ul className="space-y-3">
              {insights.slice(0, 6).map((i) => (
                <li key={i.id} className="flex gap-3">
                  <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${TOM_ESTILO[i.tom]}`} aria-hidden />
                  <div className="min-w-0">
                    {i.codccu ? <button type="button" onClick={() => mudarUrl({ ccu: i.codccu! })} className="text-left text-[13.5px] font-semibold text-gray-900 hover:text-brand">{i.titulo}</button> : <p className="text-[13.5px] font-semibold text-gray-900">{i.titulo}</p>}
                    <p className="text-[12.5px] leading-snug text-gray-500">{i.texto}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {/* ----------------------------------------------------- mes a mes */}
      <Cartao titulo="Mês a mês" subtitulo="Receita, custos e resultado de cada mês · o mês em andamento (*) aparece hachurado" acao={<LegendaMensal comPessoal={comPessoal} />}>
        <BarrasMensais pontos={pontos} mesParcial={mesParcial} />
      </Cartao>
      <div className="grid gap-5 lg:grid-cols-2">
        <Cartao titulo="Margem mês a mês" subtitulo={`Resultado sobre a receita ${liquida ? "líquida" : "bruta"}`}><LinhaSimples meses={mesesDoPeriodo} valores={pontos.map((p) => p.margem)} formato={(v) => percentual(v, 1)} eixo="pct" rotulo="Margem mês a mês" mesParcial={mesParcial} referencia={r.margem} /></Cartao>
        <Cartao titulo="Resultado acumulado" subtitulo={`${nomeEscopo}, somando mês a mês desde ${mesLongo(de)}`}><LinhaSimples meses={mesesDoPeriodo} valores={acum} formato={moedaCompacta} eixo="moeda" cor={COR.tinta} rotulo="Resultado acumulado" mesParcial={mesParcial} /></Cartao>
      </div>

      {/* ----------------------------------------------------- areas */}
      {(visao === "empresa" || visao === "contratos") && grupos.length > 0 && (
        <Cartao titulo="Por área" subtitulo="Quanto cada área contribui para o resultado dos contratos">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {grupos.map((g) => {
              const rg = resumir(g.linhas, idx, opcoes);
              const parte = carteira.resultado > 0 && rg.resultado > 0 ? rg.resultado / carteira.resultado : null;
              return (
                <div key={g.id} className="rounded-xl border border-gray-100 p-4">
                  <div className="flex items-baseline justify-between"><h3 className="text-[15px] font-semibold text-gray-900">{g.rotulo}</h3><span className="text-xs text-gray-400">{g.linhas.filter((l) => resumir([l], idx, opcoes).receita > 0).length} contratos com receita</span></div>
                  <p className={`mt-1 text-2xl font-semibold tabular-nums ${rg.resultado < 0 ? "text-red-600" : "text-gray-900"}`}>{moedaCompacta(rg.resultado)}</p>
                  <p className="text-[12.5px] text-gray-500">{rg.margem === null ? "sem receita" : `margem ${percentual(rg.margem, 1)}`}{parte !== null ? ` · ${percentual(parte, 0)} do resultado dos contratos` : ""}</p>
                  <dl className="mt-3 grid grid-cols-3 gap-2 text-xs"><div><dt className="text-gray-400">Receita</dt><dd className="font-semibold tabular-nums text-gray-800">{moedaCompacta(rg.receita)}</dd></div><div><dt className="text-gray-400">Custos</dt><dd className="font-semibold tabular-nums text-gray-800">{moedaCompacta(rg.custo)}</dd></div><div><dt className="text-gray-400">Pessoal</dt><dd className="font-semibold tabular-nums text-gray-800">{comPessoal ? moedaCompacta(rg.pessoal) : "–"}</dd></div></dl>
                </div>
              );
            })}
          </div>
        </Cartao>
      )}

      {/* ----------------------------------------------------- ranking + dispersao */}
      <div className="grid gap-5 xl:grid-cols-2">
        <Cartao titulo="Resultado por contrato" subtitulo="Do maior ao menor no período · clique para abrir o contrato" acao={ativos.length > 14 && <button type="button" onClick={() => setVerTodos((v) => !v)} className="text-[13px] font-medium text-brand hover:text-brand-dark">{verTodos ? "Ver os 14 primeiros" : `Ver todos (${ativos.length})`}</button>}>
          {ativos.length === 0 ? <p className="text-sm text-gray-500">Nenhum contrato com receita ou custo neste recorte.</p> : (
            <RankingResultado
              max={verTodos ? ativos.length : 14}
              onAbrir={(c) => mudarUrl({ ccu: c })}
              itens={[...ativos].sort((a, b) => b.r.resultado - a.r.resultado).map((x) => ({ chave: x.l.codccu, rotulo: x.l.nome, subrotulo: [x.l.cliente, x.l.area ? agruparPorArea([x.l])[0].rotulo : null].filter(Boolean).join(" · ") || `CCU ${x.l.codccu}`, resultado: x.r.resultado, margem: x.r.margem, receita: x.r.base }))}
            />
          )}
        </Cartao>
        <Cartao titulo="Receita × margem" subtitulo="Cada bolha é um contrato · tamanho = custos · acima da linha pontilhada = margem melhor que a da carteira">
          {porContrato.filter((x) => x.r.base > 0).length < 2 ? <p className="text-sm text-gray-500">São necessários ao menos 2 contratos com receita no período.</p> : (
            <Dispersao
              margemMedia={carteira.margem}
              onAbrir={(c) => mudarUrl({ ccu: c })}
              pontos={porContrato.filter((x) => x.r.base > 0 && x.r.margem !== null).map((x) => ({ chave: x.l.codccu, rotulo: x.l.nome, receita: x.r.base, margem: x.r.margem!, custo: x.r.custo + x.r.pessoal, resultado: x.r.resultado }))}
            />
          )}
        </Cartao>
      </div>

      {/* ----------------------------------------------------- mapa de calor */}
      <Cartao titulo="Mapa de resultado" subtitulo="Resultado de cada contrato em cada mês · verde = ganho, vermelho = perda · clique no contrato para abrir">
        {ativos.length === 0 ? <p className="text-sm text-gray-500">Sem dados no recorte.</p> : (
          <div className="overflow-x-auto rounded-xl border border-gray-100">
            <table className="w-full text-[12.5px] tabular-nums" style={{ minWidth: 260 + idx.length * 78 }}>
              <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500"><tr><th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Contrato</th>{idx.map((i) => <th key={meses[i]} className="px-2 py-2 text-right">{mesCurto(meses[i])}{meses[i] === mesParcial ? "*" : ""}</th>)}<th className="border-l border-gray-200 px-3 py-2 text-right">Total</th></tr></thead>
              <tbody>
                {[...ativos].sort((a, b) => b.r.resultado - a.r.resultado).map((x) => (
                  <tr key={x.l.codccu} className="border-t border-gray-100">
                    <td className="sticky left-0 z-10 max-w-[260px] truncate bg-white px-3 py-1.5"><button type="button" onClick={() => mudarUrl({ ccu: x.l.codccu })} className="truncate text-left font-medium text-gray-900 hover:text-brand">{x.l.nome}</button></td>
                    {idx.map((i, k) => { const v = x.serie[k]; return <td key={meses[i]} className="px-1 py-1">{v ? <span className="block rounded-md px-1.5 py-1 text-right" style={corDoResultado(v, maxCalor)} title={`${x.l.nome} · ${mesLongo(meses[i])}: ${moeda(v)}`}>{moedaCompacta(v).replace("R$ ", "")}</span> : <span className="block px-1.5 py-1 text-right text-gray-300">–</span>}</td>; })}
                    <td className={`border-l border-gray-100 px-3 py-1.5 text-right font-semibold ${x.r.resultado < 0 ? "text-red-600" : "text-gray-900"}`}>{moedaCompacta(x.r.resultado)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Cartao>

      {/* ----------------------------------------------------- tabela */}
      <Cartao titulo="Todos os contratos" subtitulo="Clique no nome para abrir o contrato · clique no título da coluna para ordenar" acao={<input type="search" placeholder="Buscar contrato, cliente ou CCU…" defaultValue={params.get("q") ?? ""} onChange={(e) => mudarUrl({ q: e.target.value })} className="w-64 rounded-lg border border-gray-200 px-3 py-1.5 text-[13px] focus:border-brand focus:outline-none" />}>
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[980px] text-[13px] tabular-nums">
            <thead className="bg-gray-50 text-[11px] text-gray-500"><tr>{cabecalho("nome", "Contrato", false)}{cabecalho("receita", "Receita bruta")}{cabecalho("retencoes", "Retenções")}{cabecalho("custo", "Custos")}{comPessoal && cabecalho("pessoal", "Pessoal")}{cabecalho("resultado", "Resultado")}{cabecalho("margem", "Margem")}<th className="px-3 py-2 text-left uppercase tracking-wide">Situação</th>{cabecalho("vigencia", "Vigência até")}</tr></thead>
            <tbody>
              {linhasTabela.map((x) => {
                const selo = seloDoCentro(x.r, carteira.margem);
                return (
                  <tr key={x.l.codccu} className="border-t border-gray-100 hover:bg-gray-50/60">
                    <td className="max-w-[300px] px-3 py-1.5"><button type="button" onClick={() => mudarUrl({ ccu: x.l.codccu })} className="block truncate text-left font-medium text-gray-900 hover:text-brand">{x.l.nome}</button><span className="text-[11px] text-gray-400">CCU {x.l.codccu}{x.l.cliente ? ` · ${x.l.cliente}` : ""}</span></td>
                    <td className="px-3 py-1.5 text-right">{x.r.receita ? moedaCompacta(x.r.receita) : "–"}</td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{x.r.retencoes ? moedaCompacta(x.r.retencoes) : "–"}</td>
                    <td className="px-3 py-1.5 text-right">{x.r.custo ? moedaCompacta(x.r.custo) : "–"}</td>
                    {comPessoal && <td className="px-3 py-1.5 text-right">{x.r.pessoal ? moedaCompacta(x.r.pessoal) : "–"}</td>}
                    <td className={`px-3 py-1.5 text-right font-semibold ${x.r.resultado < 0 ? "text-red-600" : "text-gray-900"}`} title={moeda(x.r.resultado)}>{moedaCompacta(x.r.resultado)}</td>
                    <td className="px-3 py-1.5 text-right">{x.r.margem === null ? "–" : percentual(x.r.margem, 1)}</td>
                    <td className="px-3 py-1.5"><span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${SELO_ESTILO[selo]}`}>{ROTULO_SELO[selo]}</span></td>
                    <td className="px-3 py-1.5 text-right text-gray-500">{x.l.vigenciaFim ? x.l.vigenciaFim.split("-").reverse().join("/") : "–"}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
                <td className="px-3 py-2">Total dos contratos</td><td className="px-3 py-2 text-right">{moedaCompacta(carteira.receita)}</td><td className="px-3 py-2 text-right">{moedaCompacta(carteira.retencoes)}</td><td className="px-3 py-2 text-right">{moedaCompacta(carteira.custo)}</td>{comPessoal && <td className="px-3 py-2 text-right">{moedaCompacta(carteira.pessoal)}</td>}
                <td className={`px-3 py-2 text-right ${carteira.resultado < 0 ? "text-red-600" : ""}`}>{moedaCompacta(carteira.resultado)}</td><td className="px-3 py-2 text-right">{carteira.margem === null ? "–" : percentual(carteira.margem, 1)}</td><td colSpan={2} />
              </tr>
              {visao === "empresa" && (rEstrutura.custo + rEstrutura.pessoal) > 0 && (
                <>
                  <tr className="border-t border-gray-100 text-gray-700"><td className="px-3 py-2">(−) Estrutura administrativa <span className="text-[11px] text-gray-400">centros administrativos: custos{comPessoal ? " e pessoal" : ""}</span></td><td className="px-3 py-2 text-right">–</td><td className="px-3 py-2 text-right">–</td><td className="px-3 py-2 text-right">{moedaCompacta(rEstrutura.custo)}</td>{comPessoal && <td className="px-3 py-2 text-right">{moedaCompacta(rEstrutura.pessoal)}</td>}<td className="px-3 py-2 text-right font-semibold text-red-600">{moedaCompacta(rEstrutura.resultado)}</td><td colSpan={3} /></tr>
                  <tr className="border-t-2 border-gray-300 bg-gray-900 font-semibold text-white"><td className="px-3 py-2.5">Resultado da empresa</td><td className="px-3 py-2.5 text-right">{moedaCompacta(r.receita)}</td><td className="px-3 py-2.5 text-right">{moedaCompacta(r.retencoes)}</td><td className="px-3 py-2.5 text-right">{moedaCompacta(r.custo)}</td>{comPessoal && <td className="px-3 py-2.5 text-right">{moedaCompacta(r.pessoal)}</td>}<td className="px-3 py-2.5 text-right">{moedaCompacta(r.resultado)}</td><td className="px-3 py-2.5 text-right">{r.margem === null ? "–" : percentual(r.margem, 1)}</td><td colSpan={2} /></tr>
                </>
              )}
            </tbody>
          </table>
        </div>
      </Cartao>

      <ComoCalcula />

      {selecionado && (
        <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/35 backdrop-blur-[1.5px]" onClick={() => mudarUrl({ ccu: null })}>
          <aside role="dialog" aria-modal="true" aria-label={`Resultado de ${selecionado.nome}`} className="flex h-full w-full max-w-6xl flex-col bg-gray-50 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b border-gray-100 bg-white px-6 py-4">
              <div className="min-w-0"><p className="text-xs font-medium uppercase tracking-wide text-gray-500">Resultado do contrato · CCU {selecionado.codccu}</p><h2 className="truncate text-xl font-semibold text-gray-900">{selecionado.nome}</h2></div>
              <div className="flex shrink-0 items-center gap-2">
                {!selecionado.codccu.includes("+") && <a href={`/contratos/${selecionado.codccu}?aba=resultado`} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Abrir o contrato</a>}
                <button type="button" onClick={() => mudarUrl({ ccu: null })} aria-label="Fechar" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">✕</button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6"><DetalheDoResultado linha={selecionado} meses={meses} de={de} ate={ate} opcoes={opcoes} mesParcial={mesParcial} hoje={hoje} /></div>
          </aside>
        </div>
      )}
    </div>
  );

  // ---------------------------------------------------------------- pecas internas
  function Filtros() {
    return (
      <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-4 shadow-soft" aria-label="Filtros do resultado">
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <div>
            <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Período</p>
            <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500">{seletorMes(de, (m) => mudarPeriodo(m, ate < m ? m : ate), "Mês inicial")} até {seletorMes(ate, (m) => mudarPeriodo(de > m ? m : de, m), "Mês final")}</div>
          </div>
          <div className="flex flex-wrap gap-1.5">{atalhos.map((a) => <Chip key={a.rotulo} ativo={a.de === de && a.ate === ate} onClick={() => mudarPeriodo(a.de, a.ate)}>{a.rotulo}</Chip>)}</div>
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-gray-100 pt-3">
          {!ccuFixo && (
            <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Visão</span>{VISOES.map((v) => <Chip key={v.id} titulo={v.ajuda} ativo={visao === v.id} onClick={() => mudarUrl({ vis: v.id === "empresa" ? null : v.id })}>{v.rotulo}</Chip>)}</div>
          )}
          <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Receita</span><Chip titulo="Resultado sobre a receita depois das retenções (como o Rito de Gestão)" ativo={liquida} onClick={() => mudarUrl({ rec: null })}>Líquida (após retenções)</Chip><Chip titulo="Resultado sobre a receita bruta, sem tirar as retenções" ativo={!liquida} onClick={() => mudarUrl({ rec: "bruta" })}>Bruta</Chip></div>
          <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Custos</span><Chip ativo={tipo === "todos"} onClick={() => mudarUrl({ tipo: null })}>Todos</Chip><Chip ativo={tipo === "proprio"} onClick={() => mudarUrl({ tipo: "proprio" })}>Próprios</Chip><Chip titulo="Contas de reembolsável: o cliente repõe por nota de débito" ativo={tipo === "reembolsavel"} onClick={() => mudarUrl({ tipo: "reembolsavel" })}>Reembolsáveis</Chip></div>
          {temCompetencia && <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Custo por</span><Chip ativo={base === "pagamento"} onClick={() => mudarUrl({ base: null })}>Data de pagamento</Chip><Chip ativo={base === "competencia"} onClick={() => mudarUrl({ base: "competencia" })}>Competência</Chip></div>}
          {dados!.podePessoal && <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Pessoal</span><Chip ativo={comPessoal} onClick={() => mudarUrl({ pes: null })}>Incluir</Chip><Chip ativo={!comPessoal} onClick={() => mudarUrl({ pes: "0" })}>Antes do pessoal</Chip></div>}
          {todasLinhas.some((l) => l.codccu === CENTROS_JUNTOS.codigo) || (todasLinhas.some((l) => l.codccu === "210") && todasLinhas.some((l) => l.codccu === "230")) || !juntar ? (
            <div className="flex flex-wrap items-center gap-1.5"><span className="mr-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">210 + 230</span><Chip titulo="O custo do 3687 está no 210 e a receita do 3687 está no 230: juntos mostram o resultado real" ativo={juntar} onClick={() => mudarUrl({ junto: null })}>Juntos</Chip><Chip ativo={!juntar} onClick={() => mudarUrl({ junto: "0" })}>Separados</Chip></div>
          ) : null}
        </div>
      </section>
    );
  }

  function Avisos() {
    const itens: { tom: "info" | "atencao"; texto: React.ReactNode }[] = [];
    if (!dados!.podePessoal) itens.push({ tom: "info", texto: <>O resultado é <b>antes do custo de pessoal</b>: a folha é dado de remuneração e só aparece para quem tem esse acesso.</> });
    if (mesesSemFolha.length) itens.push({ tom: "atencao", texto: <>A folha de pessoal ainda não está carregada para {mesesSemFolha.map(mesCurto).join(", ")}: nesses meses o resultado fica <b>sem o custo de pessoal</b> (parece melhor do que é). Encurte o período ou desligue o pessoal.</> });
    if (idx.some((i) => meses[i] === mesParcial)) itens.push({ tom: "info", texto: <>O mês em andamento ({mesCurto(mesParcial)}) está no período: custos e medição ainda estão sendo lançados e ele fica fora das comparações.</> });
    if (dados!.faturamentoErro) itens.push({ tom: "atencao", texto: <>A leitura das notas fiscais do Senior falhou na última atualização ({dados!.faturamentoErro}): a receita pode estar incompleta.</> });
    if (!ccuFixo && juntar && todasLinhas.some((l) => l.codccu === CENTROS_JUNTOS.codigo)) itens.push({ tom: "info", texto: <>Os centros <b>210 e 230</b> estão somados em uma linha ({CENTROS_JUNTOS.nome}): o custo do 3687 fica no 210 e a receita do 3687 no 230.</> });
    if (!itens.length) return null;
    return <ul className="space-y-1.5" role="note">{itens.map((a, k) => <li key={k} className={`rounded-xl border px-4 py-2.5 text-[13px] leading-snug ${a.tom === "atencao" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-sky-100 bg-sky-50/70 text-sky-900"}`}>{a.texto}</li>)}</ul>;
  }

  function ComoCalcula() {
    return (
      <details className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft">
        <summary className="cursor-pointer text-[15px] font-semibold text-gray-900">Como o resultado é calculado e o que não entra</summary>
        <div className="mt-3 space-y-2 text-[13px] leading-relaxed text-gray-600">
          <p><b className="text-gray-800">Receita bruta</b> = medição faturada em nota fiscal + notas de débito + o que foi medido e ainda está sem nota (a mesma da aba Receita e Medição; vale pelos pedidos do contrato).</p>
          <p><b className="text-gray-800">Retenções</b> = impostos retidos pelo cliente nas notas fiscais (PIS, COFINS, CSLL, IRRF, ISS…): valor bruto da nota menos o líquido. Nota de débito não tem retenção. Só existem para notas já emitidas; o medido sem nota ainda não tem retenção.</p>
          <p><b className="text-gray-800">Custos</b> = custo realizado do centro de custo no Senior (baixas 90550 e 90558, pela data de pagamento ou pela competência da compra), sem as contas de pessoal e de imposto, como na tela Custo por Centro de Custo.</p>
          <p><b className="text-gray-800">Custo de pessoal</b> = folha dos CLT (líquido, rescisão, INSS, FGTS, IRRF e provisões; pró-labore da diretoria incluído), pela regra do Rito de Gestão. Só aparece para quem tem o acesso restrito e só nos meses em que a folha está carregada. PJ já está nos custos.</p>
          <p><b className="text-gray-800">Resultado</b> = receita (líquida ou bruta, conforme o filtro) − custos − pessoal. <b className="text-gray-800">Margem</b> = resultado ÷ receita considerada. Na visão Empresa, a <b className="text-gray-800">estrutura administrativa</b> (centros administrativos) é descontada dos contratos.</p>
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-900"><b>Diferença para o Rito de Gestão:</b> o Rito calcula a receita líquida descontando uma alíquota de imposto sobre <i>todo</i> o faturamento (no CT 3748 o líquido do Rito é 77,85% do bruto em todos os meses), e não só as retenções das notas. Por isso o resultado desta tela é maior que a “margem real” do Rito. Para ver o resultado sem desconto algum de imposto, use <b>Receita: Bruta</b>; para chegar ao número do Rito, falta definir com o financeiro qual alíquota entra aqui.</p>
          <p><b className="text-gray-800">O que não entra:</b> impostos que a empresa paga por conta própria (fora das retenções), receita de períodos anteriores a {mesLongo(meses[0] ?? "")}, e qualquer lançamento ainda não feito no Senior. O resultado é a visão de gestão do sistema, não a contabilidade.</p>
          <p className="text-gray-500">Todos os números vêm do Senior pelos mesmos motores das telas de Receita e Medição e de Custo por Centro de Custo; nada é digitado ou ajustado à mão.</p>
        </div>
      </details>
    );
  }
}
