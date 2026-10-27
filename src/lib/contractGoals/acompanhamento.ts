import { progressoIndicador, variacaoPercentual } from "./calculo";
import { lerIndicadoresFinanceiros, type DependenciasIndicador, type IndicadorFinanceiro, type MetaComFonte, type UsuarioIndicador } from "./financial";
import { hojeBR } from "@/lib/financeiro/alertas";

export type FrequenciaMeta = "MENSAL" | "TRIMESTRAL" | "SEMESTRAL" | "ANUAL";
export type EstadoPeriodo = "FUTURO" | "ABERTO" | "FECHADO";
export type JanelaAvaliacao = { period: string; start: string; end: string; state: EstadoPeriodo; partial: boolean };
export type PeriodoAvaliado = JanelaAvaliacao & {
  value: number | null; target: number | null; progress: number | null;
  updatedAt: string | null; error: string | null; changePercent: number | null;
};
export type MedicaoParaAcompanhamento = {
  value: number; measuredAt: Date | string; period?: string | null; createdAt?: Date | string;
};
export type MetaParaAcompanhamento = MetaComFonte & {
  kind?: string; baselineValue?: number | null; targetValue?: number | null; direction?: string | null;
  tolerance?: number | null; evaluationMode?: string; frequency?: string;
  baselinePeriodStart?: string | null; baselinePeriodEnd?: string | null;
  measurements?: readonly MedicaoParaAcompanhamento[];
};
export type AcompanhamentoMeta = {
  periods: PeriodoAvaliado[]; currentPeriod: string | null; currentState: EstadoPeriodo | null;
  currentValue: number | null; baselineValue: number | null; targetValue: number | null;
  fraction: number | null; sourceUpdatedAt: string | null; sourceError: string | null;
};

const MES = /^\d{4}-(0[1-9]|1[0-2])$/;
const MESES: Record<FrequenciaMeta, number> = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 };
const indice = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5, 7)) - 1;
const doIndice = (valor: number) => `${Math.floor(valor / 12).toString().padStart(4, "0")}-${(valor % 12 + 1).toString().padStart(2, "0")}`;
const iso = (valor: Date | string) => typeof valor === "string" ? valor : valor.toISOString();

/** Janelas ancoradas no começo escolhido, não no trimestre civil presumido. */
export function periodosAvaliacao(inicio: string, fim: string, frequencia = "MENSAL", hoje = hojeBR()): JanelaAvaliacao[] {
  if (!MES.test(inicio) || !MES.test(fim) || inicio > fim || indice(fim) - indice(inicio) >= 48) return [];
  if (!(frequencia in MESES)) return [];
  const passo = MESES[frequencia as FrequenciaMeta], atual = hoje.slice(0, 7);
  const periodos: JanelaAvaliacao[] = [];
  for (let cursor = indice(inicio); cursor <= indice(fim); cursor += passo) {
    const start = doIndice(cursor), end = doIndice(Math.min(cursor + passo - 1, indice(fim)));
    periodos.push({ period: start, start, end, partial: indice(end) - cursor + 1 < passo, state: start > atual ? "FUTURO" : end < atual ? "FECHADO" : "ABERTO" });
  }
  return periodos;
}

/** Várias revisões da mesma competência permanecem no histórico; a mais recente representa o valor. */
export function ultimaMedicaoDoPeriodo(medicoes: readonly MedicaoParaAcompanhamento[], inicio?: string | null, fim?: string | null): MedicaoParaAcompanhamento | null {
  return [...medicoes].filter((medicao) => {
    if (!Number.isFinite(medicao.value)) return false;
    const mes = medicao.period || iso(medicao.measuredAt).slice(0, 7);
    return MES.test(mes) && (!inicio || mes >= inicio) && (!fim || mes <= fim);
  }).sort((a, b) => {
    const competenciaA = a.period || iso(a.measuredAt).slice(0, 7), competenciaB = b.period || iso(b.measuredAt).slice(0, 7);
    return competenciaB.localeCompare(competenciaA) || iso(b.measuredAt).localeCompare(iso(a.measuredAt)) || iso(b.createdAt ?? b.measuredAt).localeCompare(iso(a.createdAt ?? a.measuredAt));
  })[0] ?? null;
}

/** Prévia explícita: a leitura não muda a base ou o alvo salvos na meta. */
export async function lerLinhaBaseFinanceira(meta: MetaParaAcompanhamento, usuario: UsuarioIndicador, dependencias: DependenciasIndicador = {}): Promise<IndicadorFinanceiro> {
  if (meta.source === "MANUAL") return { valor: null, atualizadoEm: null, erro: "Indicadores próprios usam a linha de base informada pelo responsável." };
  const id = `${meta.id}:referencia`;
  const leitura = await lerIndicadoresFinanceiros([{ ...meta, id, periodStart: meta.baselinePeriodStart, periodEnd: meta.baselinePeriodEnd }], usuario, dependencias);
  return leitura.get(id) ?? { valor: null, atualizadoEm: null, erro: "Período de referência indisponível." };
}

/** Só leitura: uma consulta financeira em lote para todas as competências, sem sincronizar o ERP. */
export async function lerAcompanhamentoMetas(metas: readonly MetaParaAcompanhamento[], usuario: UsuarioIndicador, dependencias: DependenciasIndicador = {}): Promise<Map<string, AcompanhamentoMeta>> {
  const hoje = dependencias.hoje ?? hojeBR();
  const janelas = new Map<string, JanelaAvaliacao[]>();
  const consultas: MetaComFonte[] = [];
  metas.forEach((meta) => {
    if (meta.kind === "PLANO") { janelas.set(meta.id, []); return; }
    const periodos = meta.evaluationMode === "PERIODICO" ? periodosAvaliacao(meta.periodStart ?? "", meta.periodEnd ?? "", meta.frequency ?? "MENSAL", hoje) : [];
    janelas.set(meta.id, periodos);
    if (meta.source !== "MANUAL") {
      if (meta.evaluationMode === "PERIODICO") {
        periodos.forEach((periodo, i) => { if (periodo.state !== "FUTURO") consultas.push({ ...meta, id: `${meta.id}:p:${i}`, periodStart: periodo.start, periodEnd: periodo.end }); });
      } else consultas.push(meta);
    }
  });
  const financeiros = await lerIndicadoresFinanceiros(consultas, usuario, dependencias);
  const resultado = new Map<string, AcompanhamentoMeta>();
  metas.forEach((meta) => {
    const baselineValue = meta.baselineValue ?? null, targetValue = meta.targetValue ?? null;
    const calcular = (valor: number | null) => meta.kind === "PLANO" ? null : progressoIndicador(baselineValue, targetValue, valor, meta.direction ?? null, meta.tolerance ?? 0);
    const periods = (janelas.get(meta.id) ?? []).map((janela, i): PeriodoAvaliado => {
      const leitura = financeiros.get(`${meta.id}:p:${i}`);
      const manual = meta.source === "MANUAL" && janela.state !== "FUTURO" ? ultimaMedicaoDoPeriodo(meta.measurements ?? [], janela.start, janela.end) : null;
      const value = janela.state === "FUTURO" ? null : meta.source === "MANUAL" ? manual?.value ?? null : leitura?.valor ?? null;
      return { ...janela, value, target: targetValue, progress: janela.partial ? null : calcular(value), updatedAt: manual ? iso(manual.measuredAt) : leitura?.atualizadoEm ?? null, error: janela.state === "FUTURO" ? null : meta.source === "MANUAL" ? value === null ? "Sem medição registrada para este período." : null : leitura?.erro ?? (value === null ? "Fonte indisponível para este período." : null), changePercent: variacaoPercentual(baselineValue, value) };
    });
    // Meses em andamento ficam visíveis, mas não são comparados como se já estivessem encerrados.
    const atual = [...periods].reverse().find((p) => p.state === "FECHADO" && !p.partial) ?? [...periods].reverse().find((p) => p.state === "ABERTO") ?? [...periods].reverse().find((p) => p.state === "FECHADO");
    const leitura = financeiros.get(meta.id);
    const manual = meta.source === "MANUAL" ? ultimaMedicaoDoPeriodo(meta.measurements ?? [], meta.periodStart, meta.periodEnd) : null;
    const periodico = meta.evaluationMode === "PERIODICO";
    const currentValue = meta.kind === "PLANO" ? null : periodico ? atual?.value ?? null : meta.source === "MANUAL" ? manual?.value ?? null : leitura?.valor ?? null;
    resultado.set(meta.id, {
      periods, baselineValue, targetValue, currentPeriod: periodico ? atual?.period ?? null : manual?.period ?? null,
      currentState: periodico ? atual?.state ?? null : null, currentValue,
      fraction: periodico ? atual?.state === "FECHADO" && !atual.partial ? atual.progress : null : calcular(currentValue),
      sourceUpdatedAt: periodico ? atual?.updatedAt ?? null : manual ? iso(manual.measuredAt) : leitura?.atualizadoEm ?? null,
      sourceError: meta.kind === "PLANO" ? null : periodico ? atual ? atual.error ?? (atual.partial ? "Janela parcial: confira o mesmo intervalo antes de avaliar o alvo." : null) : periods.length === 0 ? "Configure o período e a frequência do acompanhamento." : "O acompanhamento ainda não possui um período iniciado." : meta.source === "MANUAL" ? null : leitura?.erro ?? (currentValue === null ? "Fonte indisponível para este indicador ou acesso." : null),
    });
  });
  return resultado;
}
