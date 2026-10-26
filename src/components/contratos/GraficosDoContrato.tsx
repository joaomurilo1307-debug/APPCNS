"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import ReceitaContrato from "@/components/medicao/ReceitaContrato";
import { LegendaLinha, LinhaAcompanhamento } from "@/components/custos/acompanhamento";
import { chaveMes, contratosNaBase, type ContratoCusto, type TipoCusto } from "@/lib/custos/agregacao";
import { periodoDasCurvas, serieDeCustoContrato } from "@/lib/contratos/curvas";
import { dataHoraCurta, mesLongo } from "@/lib/custos/formato";
import type { EstadoAtualizacaoUI } from "@/components/custos/AtualizarCusto";
import { somaMes } from "@/lib/medicao/competencia";
import type { EstadoMedicaoContrato } from "./MedicaoDoContrato";
import SeletorPeriodo, { atalhosDePeriodo } from "./SeletorPeriodo";

type Periodo = { de: string; ate: string };
type Custo = { contratos: ContratoCusto[]; meses: string[]; mesesCompetencia?: string[]; temCompetencia?: boolean; mesCorrente: string; atualizacao: EstadoAtualizacaoUI };
type EstadoCusto = { codccu: string; estado: "carregando" } | { codccu: string; estado: "erro"; mensagem: string } | { codccu: string; estado: "ok"; dados: Custo };

export default function GraficosDoContrato({ codccu, medicao, periodo, onPeriodo }: { codccu: string; medicao: EstadoMedicaoContrato; periodo: Periodo; onPeriodo: (de: string, ate: string) => void }) {
  const params = useSearchParams();
  const [custo, setCusto] = useState<EstadoCusto>({ codccu, estado: "carregando" });
  useEffect(() => {
    const abortar = new AbortController();
    setCusto({ codccu, estado: "carregando" });
    fetch(`/api/custos-conta?ccu=${encodeURIComponent(codccu)}`, { cache: "no-store", signal: abortar.signal })
      .then(async (r) => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || "Não foi possível carregar os custos deste contrato."); if (!abortar.signal.aborted) setCusto({ codccu, estado: "ok", dados: j }); })
      .catch((e) => { if (!abortar.signal.aborted) setCusto({ codccu, estado: "erro", mensagem: e.message || "Não foi possível carregar os custos." }); });
    return () => abortar.abort();
  }, [codccu]);

  const estado = custo.codccu === codccu ? custo : { codccu, estado: "carregando" as const };
  const dados = estado.estado === "ok" ? estado.dados : null;
  const mesAtual = medicao.estado === "ok" ? medicao.dados.mesAtual : dados ? chaveMes(dados.mesCorrente) : new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" }).slice(0, 7);
  const competencia = params.get("base") === "competencia" && !!dados?.temCompetencia;
  const mesesDisponiveis = useMemo(() => dados ? (competencia && dados.mesesCompetencia ? dados.mesesCompetencia : dados.meses).map(chaveMes).sort() : [], [dados, competencia]);
  const per = periodoDasCurvas(periodo.de, periodo.ate, mesAtual, mesesDisponiveis);
  const pronto = estado.estado !== "carregando" && medicao.estado !== "carregando";
  useEffect(() => {
    if (pronto && (periodo.de !== per.de || periodo.ate !== per.ate || !params.get("de") || !params.get("ate"))) onPeriodo(per.de, per.ate);
  }, [pronto, periodo.de, periodo.ate, per.de, per.ate, params, onPeriodo]);

  const contrato = dados ? contratosNaBase(dados.contratos, competencia ? "competencia" : "pagamento").find((c) => c.codccu === codccu) : undefined;
  const tipoParam = params.get("tipo");
  const tipo: TipoCusto = tipoParam === "proprio" || tipoParam === "reembolsavel" ? tipoParam : "todos";
  const grupo = params.get("grupo") ?? "todos", busca = params.get("q") ?? "";
  const meses = mesesDisponiveis.filter((m) => m >= per.de && m <= per.ate);
  const valores = contrato ? serieDeCustoContrato(contrato, { ...per, tipo, grupo }, meses, busca) : [];
  const vinculo = medicao.estado === "ok" ? medicao.dados : null;
  const parcial = per.ate === mesAtual;

  return <div className="space-y-5">
    <section className="space-y-3 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Período das curvas do contrato">
      <h2 className="text-[15px] font-semibold text-gray-900">Período da análise</h2>
      <SeletorPeriodo de={per.de} ate={per.ate} mesAtual={mesAtual} modo="passado" atalhos={[...atalhosDePeriodo("passado", mesAtual), { rotulo: "Últimos 12 meses", de: somaMes(mesAtual, -11), ate: mesAtual }]} onMudar={(de, ate) => { const p = periodoDasCurvas(de, ate, mesAtual, mesesDisponiveis); onPeriodo(p.de, p.ate); }} />
      <p className="text-xs text-gray-500">O mesmo período vale para a receita e o custo. {mesesDisponiveis[0] && `Custos disponíveis a partir de ${mesLongo(mesesDisponiveis[0])}. `}A composição da receita, as medições e os recebimentos ficam na aba Receita e Medição.</p>
    </section>
    {!pronto ? <div className="h-80 animate-pulse rounded-2xl bg-gray-100" aria-label="Carregando curvas do contrato" aria-busy /> : vinculo?.contratos.length ? <ReceitaContrato numCtr={vinculo.contratos[0].numCtr} de={per.de} ate={per.ate} somenteCurva /> : <section className="rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Faturamento mensal do contrato"><h2 className="text-[15px] font-semibold text-gray-900">Faturamento mensal do contrato</h2><p className="mt-2 text-sm text-gray-500" role={medicao.estado === "erro" ? "alert" : undefined}>{medicao.estado === "erro" || medicao.estado === "negado" ? medicao.mensagem : "Ainda não há medição do Senior vinculada a este centro de custo."}</p></section>}
    <section className="space-y-4 rounded-2xl border border-gray-100 bg-white p-5 shadow-soft" aria-label="Custo mensal do contrato" aria-busy={estado.estado === "carregando"}>
      <header><h2 className="text-[15px] font-semibold text-gray-900">Custo mensal do contrato</h2><p className="mt-1 text-[13px] leading-relaxed text-gray-500">{competencia ? "Custo quitado por competência da compra" : "Custo por data de pagamento"}, com os mesmos dados e filtros da aba Custos. Recebimentos e faturamento são acompanhados separadamente.</p></header>
      {(tipo !== "todos" || grupo !== "todos" || busca) && <p className="text-xs text-gray-500">Filtros de Custos: {tipo === "proprio" ? "custo próprio" : tipo === "reembolsavel" ? "reembolsável" : "todos os tipos"}{grupo !== "todos" ? ` · grupo ${grupo}` : ""}{busca ? ` · busca “${busca}”` : ""}.</p>}
      {estado.estado === "carregando" ? <div className="h-72 animate-pulse rounded-xl bg-gray-100" aria-label="Carregando custo mensal" /> : estado.estado === "erro" ? <p className="rounded-xl bg-gray-50 px-4 py-5 text-sm text-gray-600" role="alert">{estado.mensagem}</p> : !contrato ? <p className="rounded-xl border border-dashed border-gray-200 px-4 py-8 text-center text-sm text-gray-500">Não há custos disponíveis para este centro de custo no escopo autorizado.</p> : <>
        {dados?.atualizacao.emCurso && <p className="rounded-lg bg-sky-50 px-4 py-2 text-xs text-sky-900">Há uma atualização de custos em andamento. A curva mostra a última leitura concluída.</p>}
        {!dados?.atualizacao.ultimaOk && <p className="rounded-lg bg-amber-50 px-4 py-2 text-xs text-amber-900">A primeira atualização de custos ainda não foi concluída.</p>}
        <LinhaAcompanhamento meses={meses} valores={valores} mesParcial={parcial ? mesAtual : undefined} modo="mensal" mostrarMedia mostrarMediaMovel rotuloAcessivel="Linha de acompanhamento do custo mensal do contrato" />
        <LegendaLinha modo="mensal" mostrarMedia mostrarMediaMovel temMeta={false} />
        <p className="text-xs text-gray-500">O mês em andamento fica fora das médias. A média móvel considera o mês e os dois anteriores do recorte. {dados?.atualizacao.ultimaOk ? `Custos da leitura de ${dataHoraCurta(dados.atualizacao.ultimaOk.finalizadoEm)}.` : ""}</p>
      </>}
    </section>
  </div>;
}
