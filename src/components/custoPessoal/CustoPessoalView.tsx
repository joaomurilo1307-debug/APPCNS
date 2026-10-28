"use client";

// Custo de pessoal CLT por centro de custo (todos os que tem folha; filtro por grupo: nucleos ADM, Engenharia, Ambiental, Outros). Visao geral: total por centro e mes;
// clicar num total abre a folha de quem compoe o valor. Meses FECHADOS (a memoria) nao mudam mais e aparecem marcados.
// Clicar no centro de custo abre o detalhe: quanto gasta com o que (folha, INSS, FGTS, IRRF, ferias, 1/3, 13o, provisoes) mes a mes e a folha pessoa a pessoa.
// `ccuFixo` = embutido na aba "Custo de pessoal" do contrato (um centro so', sem titulo nem voltar).

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { mesCurto, mesLongo, moeda, moedaCompacta, percentual, dataHoraCurta } from "@/lib/custos/formato";
import { Cartao, Kpi } from "@/components/custos/ui";
import { estiloCelulaCalor } from "@/components/custos/graficos";
import BotaoExcel from "@/components/BotaoExcel";
import { abaDeLinhas } from "@/lib/exportarExcel";
import { COMPONENTES, GRUPOS_COMPONENTE, totalDoGrupo, type GrupoComponente } from "@/lib/custoPessoal/componentes";
import { mesesDasLinhas, mesesDoPeriodo, porCentroEMes, porMes, totalDoPeriodo, type Celula, type LinhaCentroMes } from "@/lib/custoPessoal/agregar";
import { GRUPOS_CENTRO, nomeDoCentro, type GrupoCentro } from "@/lib/custoPessoal/escopo";
import { nomeBonito } from "@/lib/custoPessoal/formato";
import GraficoEmpilhado, { LegendaEmpilhado, type PontoEmpilhado } from "./GraficoEmpilhado";
import FolhaDoCentro, { type PessoaDaFolha } from "./FolhaDoCentro";

type CentroDaTela = { codccu: string; nome: string; grupo: GrupoCentro };
type Fechamento = { mes: string; fechadoEm: string; linhas: number; total: number };
type Dados = { centros: CentroDaTela[]; linhas: LinhaCentroMes[]; fechamentos: Fechamento[]; atualizadoEm: string | null };

const pontoDe = (mes: string, c: Celula | undefined): PontoEmpilhado => ({ mes, folha: c ? totalDoGrupo(c, "folha") : 0, provisoes: c ? totalDoGrupo(c, "provisoes") : 0, prolabore: c ? totalDoGrupo(c, "prolabore") : 0 });
const curto = (v: number) => (v ? moedaCompacta(v).replace("R$ ", "") : "–");

function SeletorPeriodo({ meses, de, ate, onMudar }: { meses: string[]; de: string; ate: string; onMudar: (de: string, ate: string) => void }) {
  const n = meses.length;
  const pill = (rotulo: string, a: string, b: string) => (
    <button key={rotulo} type="button" onClick={() => onMudar(a, b)} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${de === a && ate === b ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{rotulo}</button>
  );
  const seletor = (valor: string, aoMudar: (m: string) => void, rotulo: string) => (
    <select value={valor} onChange={(e) => aoMudar(e.target.value)} aria-label={rotulo} className="rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-[13.5px] focus:border-brand focus:outline-none">
      {meses.map((m) => <option key={m} value={m}>{mesLongo(m).replace(" de ", " ")}</option>)}
    </select>
  );
  return (
    <section className="flex flex-wrap items-end gap-x-6 gap-y-3 rounded-2xl border border-gray-100 bg-white px-5 py-4 shadow-soft" aria-label="Período">
      <div>
        <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-gray-500">Período</p>
        <div className="flex flex-wrap items-center gap-2 text-[13px] text-gray-500">
          {seletor(de, (m) => onMudar(m, ate < m ? m : ate), "Mês inicial")} até {seletor(ate, (m) => onMudar(de > m ? m : de, m), "Mês final")}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {pill("Último mês", meses[n - 1], meses[n - 1])}
        {n >= 3 && pill("Últimos 3 meses", meses[n - 3], meses[n - 1])}
        {n >= 6 && pill("Últimos 6 meses", meses[n - 6], meses[n - 1])}
        {pill("Tudo", meses[0], meses[n - 1])}
      </div>
    </section>
  );
}

export default function CustoPessoalView({ ccuFixo }: { ccuFixo?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [dados, setDados] = useState<Dados | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [gaveta, setGaveta] = useState<{ ccu: string; mes: string } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/custo-pessoal", { cache: "no-store", signal: controller.signal })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (r.status === 403) return setSemAcesso(true);
        if (!r.ok) return setErro(j.error || "Não foi possível carregar o custo de pessoal.");
        setDados(j as Dados);
      })
      .catch(() => !controller.signal.aborted && setErro("Não foi possível carregar o custo de pessoal."));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!gaveta) return;
    const fechar = (e: KeyboardEvent) => e.key === "Escape" && setGaveta(null);
    window.addEventListener("keydown", fechar);
    return () => window.removeEventListener("keydown", fechar);
  }, [gaveta]);

  const mudarUrl = useCallback((parcial: Record<string, string | null>) => {
    const n = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(parcial)) (v === null ? n.delete(k) : n.set(k, v));
    router.replace(`${pathname}${n.toString() ? `?${n}` : ""}`, { scroll: false });
  }, [params, pathname, router]);

  const todosMeses = useMemo(() => mesesDasLinhas(dados?.linhas ?? []), [dados]);
  const mapa = useMemo(() => porCentroEMes(dados?.linhas ?? []), [dados]);
  const centroPorCodigo = useMemo(() => new Map((dados?.centros ?? []).map((c) => [c.codccu, c])), [dados]);

  // Embutido na aba do contrato, quem nao tem o modulo exclusivo ve so' o aviso (a pagina inteira ja redireciona).
  if (semAcesso) return ccuFixo ? <Cartao titulo="Custo de pessoal"><p className="rounded-xl border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-gray-500">O custo de pessoal é dado de remuneração e está liberado só para quem recebeu esse acesso.</p></Cartao> : <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">Você não tem acesso ao custo de pessoal.</div>;
  if (erro) return <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4 text-sm text-red-800">{erro}</div>;
  if (!dados) return <div className="space-y-4" aria-busy><div className="h-28 animate-pulse rounded-2xl bg-gray-200/70" /><div className="h-72 animate-pulse rounded-2xl bg-gray-200/70" /></div>;
  if (todosMeses.length === 0) return <Cartao titulo="Custo de pessoal"><p className="rounded-xl border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-gray-500">Ainda não há folha carregada. Ela chega do Senior (HCM) e fica aqui assim que for sincronizada.</p></Cartao>;

  const valido = (m: string | null) => (m && todosMeses.includes(m) ? m : null);
  const de = valido(params.get("de")) ?? todosMeses[0];
  const ateBruto = valido(params.get("ate")) ?? todosMeses[todosMeses.length - 1];
  const ate = ateBruto < de ? de : ateBruto;
  const mesesJ = mesesDoPeriodo(todosMeses, de, ate);
  const mudarPeriodo = (d: string, a: string) => mudarUrl({ de: d, ate: a });
  const ccuParam = ccuFixo ?? params.get("ccu");
  const ccu = ccuFixo ?? (ccuParam && centroPorCodigo.has(ccuParam) ? ccuParam : null);
  const fechadoDoMes = new Map((dados.fechamentos ?? []).map((f) => [f.mes, f]));
  const mesesFechados = todosMeses.filter((m) => fechadoDoMes.has(m));
  const mesesAbertos = todosMeses.filter((m) => !fechadoDoMes.has(m));
  const atualizado = dados.atualizadoEm ? `Dados do Senior de ${dataHoraCurta(dados.atualizadoEm)}` : null;

  // ---------------------------------------------------------------- detalhe de um centro de custo
  if (ccu) {
    const nome = centroPorCodigo.get(ccu)?.nome ?? nomeDoCentro(ccu);
    const rotuloGrupo = GRUPOS_CENTRO.find((g) => g.id === centroPorCodigo.get(ccu)?.grupo)?.rotulo;
    const celulas = mesesJ.map((m) => mapa.get(ccu)?.get(m));
    const comDados = mesesJ.filter((_, i) => celulas[i] && celulas[i]!.pessoas > 0);
    const tot = totalDoPeriodo(celulas);
    const mesFolha = valido(params.get("mes")) && mesesJ.includes(params.get("mes")!) ? params.get("mes")! : comDados[comDados.length - 1] ?? mesesJ[mesesJ.length - 1];
    const celMes = mapa.get(ccu)?.get(mesFolha);
    const temProLabore = tot.proLabore > 0;
    const base = temProLabore ? tot.totalComProLabore : tot.total;
    const pct = (v: number) => (base ? percentual(v / base, 1) : "–");
    const grupos = GRUPOS_COMPONENTE.filter((g) => g.id !== "prolabore");
    const pontos = mesesJ.map((m, i) => pontoDe(m, celulas[i]));
    const mediaMes = comDados.length ? base / comDados.length : 0;

    const abasDoCentro = async () => {
      const r = await fetch(`/api/custo-pessoal/pessoas?ccu=${encodeURIComponent(ccu)}`, { cache: "no-store" });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || "Não foi possível gerar a folha.");
      const pessoas = (j.pessoas as PessoaDaFolha[]).filter((p) => mesesJ.includes(p.mes));
      const compos: (string | number)[][] = [["Componente", ...mesesJ.map(mesCurto), "Total do período"]];
      for (const c of COMPONENTES) compos.push([c.rotulo, ...celulas.map((x) => x?.[c.id] ?? 0), tot[c.id]]);
      compos.push(["TOTAL (regra do Rito)", ...celulas.map((x) => x?.total ?? 0), tot.total]);
      const folha: (string | number)[][] = [["Mês", "Matrícula", "Pessoa", "Cargo", "Situação atual", ...COMPONENTES.map((c) => c.rotulo), "Total (regra do Rito)", "Total com pró-labore"]];
      for (const p of pessoas) folha.push([mesCurto(p.mes), p.matricula, nomeBonito(p.nome), nomeBonito(p.cargo), p.situacao ?? "", ...COMPONENTES.map((c) => p[c.id]), p.total, p.totalComProLabore]);
      return [
        abaDeLinhas("Composição por mês", compos, `Custo de pessoal CLT · ${nome} · ${mesLongo(mesesJ[0])} a ${mesLongo(mesesJ[mesesJ.length - 1])} · regra do Rito de Gestão`, true),
        abaDeLinhas("Folha por pessoa", folha, "Pessoa a pessoa, mês a mês. Dado de remuneração: uso restrito."),
      ];
    };

    return (
      <div className="space-y-5">
        {!ccuFixo && (
          <header>
            <Link href="/custo-pessoal" className="text-[13px] font-medium text-brand hover:text-brand-dark">← Todos os centros de custo</Link>
            <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight text-gray-900">{nome} <span className="ml-1 rounded-lg bg-teal-50 px-2 py-0.5 align-middle text-sm font-semibold tabular-nums text-teal-800">CCU {ccu}</span>{rotuloGrupo && <span className="ml-1.5 rounded-lg bg-gray-100 px-2 py-0.5 align-middle text-xs font-medium text-gray-600">{rotuloGrupo}</span>}</h1>
                <p className="mt-0.5 text-[14px] text-gray-500">Custo de pessoal CLT: quanto gasta com o quê, mês a mês, e a folha dentro do centro de custo.</p>
              </div>
              <div className="flex items-center gap-3 text-xs text-gray-500">{atualizado && <span>{atualizado}</span>}<BotaoExcel arquivo={`custo-de-pessoal-${ccu}`} gerar={abasDoCentro} /></div>
            </div>
          </header>
        )}
        {ccuFixo && <div className="flex items-center justify-end gap-3 text-xs text-gray-500">{atualizado && <span>{atualizado}</span>}<BotaoExcel arquivo={`custo-de-pessoal-${ccu}`} gerar={abasDoCentro} /></div>}

        <SeletorPeriodo meses={todosMeses} de={de} ate={ate} onMudar={mudarPeriodo} />
        <FaixaMemoria fechados={mesesFechados} abertos={mesesAbertos} fechadoDoMes={fechadoDoMes} />

        {comDados.length === 0 ? (
          <Cartao titulo="Sem folha CLT neste centro de custo"><p className="text-sm text-gray-600">Não há folha CLT em {nome} no período. Se as pessoas deste centro são prestadores (PJ), o custo delas está em <b>Serviços Terceiros PJ</b> no Custo por Centro de Custo.</p></Cartao>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Kpi rotulo="Custo de pessoal no período" valor={moedaCompacta(base)} detalhe={`${comDados.length} ${comDados.length === 1 ? "mês" : "meses"} com folha`} destaque />
              <Kpi rotulo="Média por mês" valor={moedaCompacta(mediaMes)} detalhe="nos meses com folha" />
              <Kpi rotulo={`Pessoas em ${mesCurto(mesFolha)}`} valor={String(celMes?.pessoas ?? 0)} detalhe="com folha no mês" />
              <Kpi rotulo="Provisões" valor={tot.provFerias + tot.provTerco + tot.prov13 + tot.provInss + tot.provFgts ? pct(tot.provFerias + tot.provTerco + tot.prov13 + tot.provInss + tot.provFgts) : "sem provisão"} detalhe="do total vira provisão (férias, 1/3, 13º e encargos)" />
            </div>

            <Cartao titulo="Mês a mês" subtitulo="Folha, provisões e pró-labore somados · clique numa barra para ver a folha do mês">
              <div className="mb-2"><LegendaEmpilhado grupos={temProLabore ? ["folha", "provisoes", "prolabore"] : ["folha", "provisoes"]} /></div>
              <GraficoEmpilhado pontos={pontos} mesSelecionado={mesFolha} onMes={(m) => mudarUrl({ mes: m })} />
            </Cartao>

            <Cartao titulo="Quanto gasta com o quê" subtitulo="Cada componente do custo de pessoal, mês a mês · clique no mês para abrir a folha dele">
              <div className="overflow-x-auto rounded-xl border border-gray-100">
                <table className="w-full min-w-[640px] text-[13px] tabular-nums">
                  <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
                    <tr>
                      <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Componente</th>
                      {mesesJ.map((m) => (
                        <th key={m} className="p-0 text-right"><button type="button" onClick={() => mudarUrl({ mes: m })} className={`w-full whitespace-nowrap px-2.5 py-2 text-right uppercase tracking-wide transition hover:bg-teal-50 ${m === mesFolha ? "bg-teal-50 font-bold text-teal-800" : ""}`}>{mesCurto(m)}</button></th>
                      ))}
                      <th className="border-l border-gray-200 px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <GrupoDeLinhas key={g.id} grupo={g.id} rotulo={g.rotulo} cor={g.cor} meses={mesesJ} celulas={celulas} tot={tot} base={base} mesFolha={mesFolha} />
                    ))}
                    {tot.total !== 0 && (
                    <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
                      <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Total (regra do Rito)</td>
                      {celulas.map((c, i) => <td key={mesesJ[i]} className={`px-2.5 py-2 text-right ${mesesJ[i] === mesFolha ? "bg-teal-50" : ""}`} title={c ? moeda(c.total) : ""}>{curto(c?.total ?? 0)}</td>)}
                      <td className="border-l border-gray-200 px-3 py-2 text-right" title={moeda(tot.total)}>{moedaCompacta(tot.total)}</td>
                      <td className="px-3 py-2 text-right">{temProLabore ? "" : "100%"}</td>
                    </tr>
                    )}
                    {temProLabore && (
                      <>
                        <tr className="border-t border-gray-100">
                          <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium" style={{ color: GRUPOS_COMPONENTE[2].cor }}>Pró-labore (diretoria) <span className="ml-1 text-[11px] font-normal text-gray-400">fora da regra do Rito</span></td>
                          {celulas.map((c, i) => <td key={mesesJ[i]} className={`px-2.5 py-2 text-right ${mesesJ[i] === mesFolha ? "bg-teal-50" : ""}`}>{curto(c?.proLabore ?? 0)}</td>)}
                          <td className="border-l border-gray-100 px-3 py-2 text-right" title={moeda(tot.proLabore)}>{moedaCompacta(tot.proLabore)}</td>
                          <td className="px-3 py-2 text-right text-gray-500">{pct(tot.proLabore)}</td>
                        </tr>
                        <tr className="border-t border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
                          <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Total com pró-labore</td>
                          {celulas.map((c, i) => <td key={mesesJ[i]} className={`px-2.5 py-2 text-right ${mesesJ[i] === mesFolha ? "bg-teal-50" : ""}`}>{curto(c?.totalComProLabore ?? 0)}</td>)}
                          <td className="border-l border-gray-200 px-3 py-2 text-right" title={moeda(tot.totalComProLabore)}>{moedaCompacta(tot.totalComProLabore)}</td>
                          <td className="px-3 py-2 text-right">100%</td>
                        </tr>
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </Cartao>

            <Cartao titulo={`Folha de ${mesLongo(mesFolha)}`} subtitulo="Quem compõe o total do mês, com cada componente · dado de remuneração: uso restrito">
              <div className="mb-3 flex flex-wrap gap-1.5">
                {comDados.map((m) => (
                  <button key={m} type="button" onClick={() => mudarUrl({ mes: m })} className={`rounded-full border px-3 py-1 text-[12.5px] font-medium transition ${m === mesFolha ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>{mesCurto(m)}</button>
                ))}
              </div>
              <FolhaDoCentro ccu={ccu} mes={mesFolha} />
            </Cartao>
          </>
        )}
      </div>
    );
  }

  // ---------------------------------------------------------------- visao geral
  const contagemPorGrupo = new Map<GrupoCentro, number>();
  for (const c of dados.centros) if (mapa.has(c.codccu) || c.grupo === "NUCLEO_ADM") contagemPorGrupo.set(c.grupo, (contagemPorGrupo.get(c.grupo) ?? 0) + 1);
  const grupoParam = params.get("grupo");
  const grupo: GrupoCentro | null = GRUPOS_CENTRO.some((g) => g.id === grupoParam) ? (grupoParam as GrupoCentro) : null;
  const rotuloEscopo = grupo ? GRUPOS_CENTRO.find((g) => g.id === grupo)!.rotulo : "todos os centros de custo";
  const centrosDoEscopo = dados.centros.filter((c) => (!grupo || c.grupo === grupo) && (mapa.has(c.codccu) || c.grupo === "NUCLEO_ADM"));
  const codigosDoEscopo = new Set(centrosDoEscopo.map((c) => c.codccu));
  const linhasPeriodo = (dados.linhas ?? []).filter((l) => mesesJ.includes(l.mes) && codigosDoEscopo.has(l.codccu));
  const totalPorMes = porMes(linhasPeriodo, mesesJ);
  const geral = totalDoPeriodo([...totalPorMes.values()]);
  const temProLabore = geral.proLabore > 0;
  const base = temProLabore ? geral.totalComProLabore : geral.total;
  const mesesComFolha = mesesJ.filter((m) => (totalPorMes.get(m)?.pessoas ?? 0) > 0);
  const ultimoMes = mesesJ[mesesJ.length - 1];
  const centros = centrosDoEscopo
    .map((n) => {
      const celulas = mesesJ.map((m) => mapa.get(n.codccu)?.get(m));
      const tot = totalDoPeriodo(celulas);
      return { n, celulas, tot, valor: tot.totalComProLabore, temFolha: (mapa.get(n.codccu)?.size ?? 0) > 0 };
    })
    .sort((a, b) => b.valor - a.valor || a.n.nome.localeCompare(b.n.nome, "pt-BR"));
  const maxCelula = Math.max(1, ...centros.flatMap((c) => c.celulas.map((x) => x?.totalComProLabore ?? 0)));
  const pontos = mesesJ.map((m) => pontoDe(m, totalPorMes.get(m)));
  const provisoes = geral.provFerias + geral.provTerco + geral.prov13 + geral.provInss + geral.provFgts;

  const abasGeral = () => {
    const rotuloDoGrupo = (g: GrupoCentro) => GRUPOS_CENTRO.find((x) => x.id === g)!.rotulo;
    const por: (string | number)[][] = [["Centro de custo", "CCU", "Grupo", ...mesesJ.map(mesCurto), "Total do período"]];
    for (const c of centros) por.push([c.n.nome, c.n.codccu, rotuloDoGrupo(c.n.grupo), ...c.celulas.map((x) => x?.totalComProLabore ?? 0), c.valor]);
    por.push([`TOTAL (${rotuloEscopo})`, "", "", ...mesesJ.map((m) => totalPorMes.get(m)?.totalComProLabore ?? 0), geral.totalComProLabore]);
    const comp: (string | number)[][] = [["Componente", ...mesesJ.map(mesCurto), "Total do período"]];
    for (const c of COMPONENTES) comp.push([c.rotulo, ...mesesJ.map((m) => totalPorMes.get(m)?.[c.id] ?? 0), geral[c.id]]);
    comp.push(["TOTAL (regra do Rito)", ...mesesJ.map((m) => totalPorMes.get(m)?.total ?? 0), geral.total]);
    return [
      abaDeLinhas("Por centro e mês", por, `Custo de pessoal CLT · ${rotuloEscopo} (com pró-labore da diretoria). Regra do Rito de Gestão, calculada no Senior.`, true),
      abaDeLinhas("Componentes por mês", comp, `Total de ${rotuloEscopo} por componente.`, true),
    ];
  };

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-gray-900">Custo de pessoal por centro de custo</h1>
          <p className="mt-1 max-w-3xl text-[14px] text-gray-500">Folha, encargos e provisões dos CLT, calculados no Senior pela regra do Rito de Gestão. Clique num valor para ver quem compõe o total, ou no centro de custo para abrir a folha dele.</p>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">{atualizado && <span>{atualizado}</span>}<BotaoExcel arquivo={`custo-de-pessoal-${grupo ? grupo.toLowerCase().replace("_", "-") : "todos"}`} gerar={abasGeral} /></div>
      </header>

      <SeletorPeriodo meses={todosMeses} de={de} ate={ate} onMudar={mudarPeriodo} />
      <FaixaMemoria fechados={mesesFechados} abertos={mesesAbertos} fechadoDoMes={fechadoDoMes} />

      <nav aria-label="Grupo de centros de custo" className="flex flex-wrap items-center gap-1.5">
        {[{ id: null as GrupoCentro | null, rotulo: "Todos" }, ...GRUPOS_CENTRO.filter((g) => contagemPorGrupo.has(g.id))].map((g) => {
          const n = g.id ? contagemPorGrupo.get(g.id) ?? 0 : [...contagemPorGrupo.values()].reduce((a, b) => a + b, 0);
          return (
            <button key={g.rotulo} type="button" onClick={() => mudarUrl({ grupo: g.id })} aria-pressed={grupo === g.id} className={`rounded-full border px-3.5 py-1.5 text-[13px] font-medium transition ${grupo === g.id ? "border-brand bg-brand text-white" : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"}`}>
              {g.rotulo} <span className={grupo === g.id ? "text-white/80" : "text-gray-400"}>{n}</span>
            </button>
          );
        })}
      </nav>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi rotulo="Custo de pessoal no período" valor={moedaCompacta(base)} detalhe={`${mesesComFolha.length} ${mesesComFolha.length === 1 ? "mês" : "meses"} · ${rotuloEscopo}`} destaque />
        <Kpi rotulo="Média por mês" valor={moedaCompacta(mesesComFolha.length ? base / mesesComFolha.length : 0)} detalhe="nos meses com folha" />
        <Kpi rotulo={`Pessoas em ${mesCurto(ultimoMes)}`} valor={String(totalPorMes.get(ultimoMes)?.pessoas ?? 0)} detalhe="CLT com folha no mês" />
        <Kpi rotulo="Provisões" valor={base ? percentual(provisoes / base, 1) : "–"} detalhe="do total vira provisão (férias, 1/3, 13º e encargos)" />
      </div>

      <Cartao titulo="Mês a mês" subtitulo={`${rotuloEscopo[0].toUpperCase()}${rotuloEscopo.slice(1)}, por grupo de custo`}>
        <div className="mb-2"><LegendaEmpilhado grupos={temProLabore ? ["folha", "provisoes", "prolabore"] : ["folha", "provisoes"]} /></div>
        <GraficoEmpilhado pontos={pontos} />
      </Cartao>

      <Cartao titulo="Por centro de custo" subtitulo="Total do mês (folha + provisões) · clique num valor para ver quem compõe · clique no centro para abrir a folha">
        <div className="overflow-x-auto rounded-xl border border-gray-100">
          <table className="w-full min-w-[760px] text-[13px] tabular-nums">
            <thead className="bg-gray-50 text-[11px] uppercase tracking-wide text-gray-500">
              <tr>
                <th className="sticky left-0 z-10 bg-gray-50 px-3 py-2 text-left">Centro de custo</th>
                {mesesJ.map((m) => <th key={m} className="whitespace-nowrap px-2.5 py-2 text-right">{mesCurto(m)}</th>)}
                <th className="border-l border-gray-200 px-3 py-2 text-right">Total</th>
                <th className="px-3 py-2 text-right">%</th>
              </tr>
            </thead>
            <tbody>
              {centros.map((c) => (
                <tr key={c.n.codccu} className="border-t border-gray-100">
                  <td className="sticky left-0 z-10 bg-white px-3 py-1.5">
                    <button type="button" onClick={() => mudarUrl({ ccu: c.n.codccu })} className="text-left font-medium text-gray-900 hover:text-brand">{c.n.nome}</button>
                    <span className="ml-2 text-[11px] text-gray-400">CCU {c.n.codccu}</span>
                    {!grupo && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500">{GRUPOS_CENTRO.find((g) => g.id === c.n.grupo)!.rotulo}</span>}
                    {!c.temFolha && <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] text-gray-500" title="As pessoas deste centro são prestadores (PJ): o custo está em Serviços Terceiros PJ">sem CLT</span>}
                  </td>
                  {c.celulas.map((x, i) => {
                    const v = x?.totalComProLabore ?? 0;
                    return (
                      <td key={mesesJ[i]} className="px-1 py-1">
                        {v ? (
                          <button type="button" onClick={() => setGaveta({ ccu: c.n.codccu, mes: mesesJ[i] })} title={`${c.n.nome} · ${mesLongo(mesesJ[i])}: ${moeda(v)} · ${x!.pessoas} ${x!.pessoas === 1 ? "pessoa" : "pessoas"} — clique para ver quem compõe`} className="block w-full rounded-md px-1.5 py-1 text-right text-[12.5px] transition hover:ring-2 hover:ring-brand/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand" style={estiloCelulaCalor(v, maxCelula)}>{curto(v)}</button>
                        ) : <span className="block px-1.5 py-1 text-right text-gray-300">–</span>}
                      </td>
                    );
                  })}
                  <td className="border-l border-gray-100 px-3 py-1.5 text-right font-semibold text-gray-900" title={moeda(c.valor)}>{c.valor ? moedaCompacta(c.valor) : "–"}</td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{base && c.valor ? percentual(c.valor / base, 1) : "–"}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-gray-200 bg-gray-50/80 font-semibold text-gray-900">
                <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2">Total · {rotuloEscopo}</td>
                {mesesJ.map((m) => <td key={m} className="px-2.5 py-2 text-right" title={moeda(totalPorMes.get(m)?.totalComProLabore ?? 0)}>{curto(totalPorMes.get(m)?.totalComProLabore ?? 0)}</td>)}
                <td className="border-l border-gray-200 px-3 py-2 text-right" title={moeda(geral.totalComProLabore)}>{moedaCompacta(geral.totalComProLabore)}</td>
                <td className="px-3 py-2 text-right">100%</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[12px] leading-snug text-gray-500">Só pessoas CLT. Prestadores PJ (como o grupo ADM) já estão em Serviços Terceiros PJ no Custo por Centro de Custo e não entram aqui. A diretoria recebe pró-labore (sem provisão), que está somado nos valores acima.{todosMeses.some((m) => m < "2026-03") && ' Em janeiro e fevereiro, quem estava no centro único "ADM" foi distribuído para o núcleo em que está desde março (marcado como "distribuído" na folha).'}</p>
      </Cartao>

      {gaveta && (
        <div className="fixed inset-0 z-40 flex justify-end bg-gray-900/35 backdrop-blur-[1.5px]" onClick={() => setGaveta(null)}>
          <aside role="dialog" aria-modal="true" aria-label="Folha do centro de custo" className="flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-start justify-between gap-4 border-b border-gray-100 bg-gradient-to-r from-brand/10 to-transparent px-6 py-4">
              <div className="min-w-0">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Quem compõe o total · {mesLongo(gaveta.mes)}</p>
                <h2 className="truncate text-lg font-semibold text-gray-900">{centroPorCodigo.get(gaveta.ccu)?.nome ?? gaveta.ccu} <span className="text-sm font-normal text-gray-400">CCU {gaveta.ccu}</span></h2>
                <p className="text-sm text-gray-600">Total do mês: <b className="tabular-nums text-gray-900">{moeda(mapa.get(gaveta.ccu)?.get(gaveta.mes)?.totalComProLabore ?? 0)}</b></p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button type="button" onClick={() => { const c = gaveta.ccu; const m = gaveta.mes; setGaveta(null); mudarUrl({ ccu: c, mes: m }); }} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 text-[13px] font-medium text-gray-700 hover:bg-gray-50">Abrir o centro de custo</button>
                <button type="button" onClick={() => setGaveta(null)} aria-label="Fechar" className="rounded-lg p-1.5 text-gray-500 hover:bg-gray-100">✕</button>
              </div>
            </header>
            <div className="flex-1 overflow-y-auto p-6"><FolhaDoCentro ccu={gaveta.ccu} mes={gaveta.mes} /></div>
          </aside>
        </div>
      )}
    </div>
  );
}

const dataCurta = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });

/** A "memoria": meses fechados nao mudam mais; so' os meses seguintes sao acrescentados. */
function FaixaMemoria({ fechados, abertos, fechadoDoMes }: { fechados: string[]; abertos: string[]; fechadoDoMes: Map<string, Fechamento> }) {
  if (fechados.length === 0) return null;
  const datas = Array.from(new Set(fechados.map((m) => dataCurta(fechadoDoMes.get(m)!.fechadoEm))));
  const intervalo = fechados.length === 1 ? mesCurto(fechados[0]) : `${mesCurto(fechados[0])} a ${mesCurto(fechados[fechados.length - 1])}`;
  return (
    <p className="rounded-xl border border-teal-100 bg-teal-50/60 px-4 py-2.5 text-[13px] leading-snug text-teal-900" role="note">
      <b>Meses fechados: {intervalo}</b> (fechado em {datas.join(", ")}). Esses meses não mudam mais, mesmo que o cadastro do Senior mude depois (troca de centro de custo, desligamento).
      {abertos.length > 0 ? ` Em aberto: ${abertos.map(mesCurto).join(", ")}.` : " Só os meses seguintes serão acrescentados."}
    </p>
  );
}

function GrupoDeLinhas({ grupo, rotulo, cor, meses, celulas, tot, base, mesFolha }: { grupo: GrupoComponente; rotulo: string; cor: string; meses: string[]; celulas: (Celula | undefined)[]; tot: Celula; base: number; mesFolha: string }) {
  const comps = COMPONENTES.filter((c) => c.grupo === grupo && (tot[c.id] !== 0 || celulas.some((x) => (x?.[c.id] ?? 0) !== 0)));
  if (comps.length === 0) return null; // grupo sem nenhum valor no periodo (ex.: provisoes da diretoria)
  const subtotal = (c: Celula | undefined) => (c ? totalDoGrupo(c, grupo) : 0);
  const pct = (v: number) => (base && v ? percentual(v / base, 1) : "–");
  const destaque = (m: string) => (m === mesFolha ? "bg-teal-50" : "");
  return (
    <>
      <tr className="border-t border-gray-200 bg-gray-50/50">
        <td className="sticky left-0 z-10 bg-gray-50 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide" style={{ color: cor }}>{rotulo}</td>
        {celulas.map((c, i) => <td key={meses[i]} className={`px-2.5 py-1.5 text-right font-semibold text-gray-700 ${destaque(meses[i])}`}>{curto(subtotal(c))}</td>)}
        <td className="border-l border-gray-200 px-3 py-1.5 text-right font-semibold text-gray-800" title={moeda(totalDoGrupo(tot, grupo))}>{moedaCompacta(totalDoGrupo(tot, grupo))}</td>
        <td className="px-3 py-1.5 text-right font-semibold text-gray-600">{pct(totalDoGrupo(tot, grupo))}</td>
      </tr>
      {comps.map((c) => (
        <tr key={c.id} className="border-t border-gray-100">
          <td className="sticky left-0 z-10 bg-white py-1.5 pl-6 pr-3 text-gray-700" title={c.ajuda}>{c.rotulo}</td>
          {celulas.map((x, i) => <td key={meses[i]} className={`px-2.5 py-1.5 text-right ${x?.[c.id] ? "text-gray-800" : "text-gray-300"} ${destaque(meses[i])}`} title={x?.[c.id] ? moeda(x[c.id]) : ""}>{curto(x?.[c.id] ?? 0)}</td>)}
          <td className="border-l border-gray-100 px-3 py-1.5 text-right text-gray-800" title={moeda(tot[c.id])}>{tot[c.id] ? moedaCompacta(tot[c.id]) : "–"}</td>
          <td className="px-3 py-1.5 text-right text-gray-500">{pct(tot[c.id])}</td>
        </tr>
      ))}
    </>
  );
}
