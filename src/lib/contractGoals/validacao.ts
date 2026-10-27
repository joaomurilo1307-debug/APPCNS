import { z } from "zod";
import { alvoPorVariacao, configuracaoCoerente } from "./calculo";

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const data = z.string().datetime().nullable();
export const dadosMeta = z.object({
  title: z.string().trim().min(2).max(200), description: z.string().max(4000).nullable().optional(),
  category: z.enum(["CUSTO", "GLOSA", "FALTAS", "MEDICAO", "RESULTADOS", "GERAL"]),
  kind: z.enum(["INDICADOR", "PLANO"]).default("INDICADOR"),
  unit: z.string().trim().min(1).max(40).nullable().default(null), baselineValue: z.number().finite().nullable().default(null), targetValue: z.number().finite().nullable().default(null), direction: z.enum(["REDUZIR", "AUMENTAR", "ATINGIR", "MANTER"]).nullable().default(null),
  source: z.enum(["MANUAL", "CUSTO", "FATURAMENTO", "MEDICAO"]).default("MANUAL"), sourceAccount: z.string().max(100).nullable().optional(),
  sourceCcu: z.string().regex(/^\d+$/).nullable().optional(), metricName: z.string().trim().min(2).max(200).nullable().optional(),
  parentGoalId: z.string().min(1).nullable().optional(), contributionWeight: z.number().finite().gt(0).max(100).nullable().optional(),
  periodStart: mes.nullable().optional(), periodEnd: mes.nullable().optional(),
  evaluationMode: z.enum(["ACUMULADO", "PERIODICO"]).default("ACUMULADO"),
  frequency: z.enum(["MENSAL", "TRIMESTRAL", "SEMESTRAL", "ANUAL"]).default("MENSAL"),
  baselinePeriodStart: mes.nullable().optional(), baselinePeriodEnd: mes.nullable().optional(),
  targetMode: z.enum(["ABSOLUTO", "PERCENTUAL"]).default("ABSOLUTO"), targetChange: z.number().finite().min(0).nullable().optional(),
  tolerance: z.number().finite().min(0).default(0),
  dueDate: data.optional(), ownerId: z.string().nullable().optional(), status: z.enum(["ATIVA", "PAUSADA", "CONCLUIDA", "ARQUIVADA"]).default("ATIVA"),
});
export function erroConfiguracao(meta: z.infer<typeof dadosMeta>): string | null {
  if (meta.kind === "PLANO") return meta.source !== "MANUAL" || meta.baselineValue !== null || meta.targetValue !== null || meta.unit !== null || meta.direction !== null ? "O plano livre usa ações, sem valores ou fonte financeira." : null;
  if (meta.baselineValue === null || meta.targetValue === null || meta.unit === null || meta.direction === null) return "Informe unidade, linha de base, alvo e direção do indicador.";
  if (!configuracaoCoerente(meta.baselineValue, meta.targetValue, meta.direction)) return "O alvo deve respeitar a direção escolhida em relação à linha de base.";
  if (meta.targetMode === "PERCENTUAL") {
    if (!["REDUZIR", "AUMENTAR"].includes(meta.direction) || meta.targetChange === null || meta.targetChange === undefined) return "Informe o percentual de aumento ou redução desejado.";
    if (meta.baselineValue === 0) return "A referência zero não define uma variação percentual. Escolha um alvo em valor absoluto.";
    const calculado = alvoPorVariacao(meta.baselineValue, meta.targetChange, meta.direction);
    if (calculado === null) return "Percentual inválido para a direção escolhida.";
    if (Math.abs(calculado - meta.targetValue) > 1e-7 * Math.max(1, Math.abs(calculado))) return "O alvo deve corresponder ao percentual aplicado à linha de base.";
  }
  if (meta.source !== "MANUAL" && (!meta.periodStart || !meta.periodEnd)) return "Informe o período da fonte automática.";
  if (meta.source !== "MANUAL" && meta.unit !== "R$") return "As fontes financeiras automáticas usam valores em R$.";
  if (meta.source !== "MANUAL" && ["GLOSA", "FALTAS"].includes(meta.category)) return "Glosas e faltas usam medição manual.";
  if (meta.sourceAccount && meta.source !== "CUSTO") return "Conta financeira é um recorte exclusivo da fonte de custos.";
  if (meta.evaluationMode === "PERIODICO" && (!meta.periodStart || !meta.periodEnd)) return "Informe o início e o fim do acompanhamento periódico.";
  if (!!meta.baselinePeriodStart !== !!meta.baselinePeriodEnd) return "Informe o início e o fim do período de referência.";
  for (const [inicio, fim] of [[meta.periodStart, meta.periodEnd], [meta.baselinePeriodStart, meta.baselinePeriodEnd]]) {
    if (inicio && fim && inicio > fim) return "O mês inicial deve ser anterior ao mês final.";
    if (!inicio || !fim) continue;
    const indice = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5));
    if (indice(fim) - indice(inicio) >= 48) return "Selecione no máximo 48 meses.";
  }
  if (meta.evaluationMode === "PERIODICO" && meta.source !== "MANUAL" && meta.baselinePeriodStart && meta.baselinePeriodEnd) {
    const indice = (valor: string) => Number(valor.slice(0, 4)) * 12 + Number(valor.slice(5));
    const meses = { MENSAL: 1, TRIMESTRAL: 3, SEMESTRAL: 6, ANUAL: 12 }[meta.frequency];
    if (indice(meta.baselinePeriodEnd) - indice(meta.baselinePeriodStart) + 1 !== meses) return "O período de referência deve ter a mesma duração de cada avaliação.";
    if (meta.periodStart && meta.baselinePeriodEnd >= meta.periodStart) return "A referência deve terminar antes do início do acompanhamento periódico.";
  }
  return null;
}
export const novaMeta = dadosMeta.extend({ codccu: z.string().regex(/^\d+$/).nullable().optional() });
export const medicaoMeta = z.object({ operation: z.literal("measurement"), value: z.number().finite(), measuredAt: z.string().datetime(), period: mes.nullable().optional(), note: z.string().max(4000).nullable().optional() });
export const acaoMeta = z.object({ operation: z.literal("action"), title: z.string().trim().min(2).max(250), description: z.string().max(4000).nullable().optional(), ownerId: z.string().nullable().optional(), dueDate: data.optional(), status: z.enum(["A_FAZER", "EM_ANDAMENTO", "BLOQUEADA", "CONCLUIDA", "CANCELADA"]).default("A_FAZER") });
export const alterarAcao = z.object({ operation: z.literal("updateAction"), actionId: z.string(), title: z.string().trim().min(2).max(250).optional(), description: z.string().max(4000).nullable().optional(), ownerId: z.string().nullable().optional(), dueDate: data.optional(), status: z.enum(["A_FAZER", "EM_ANDAMENTO", "BLOQUEADA", "CONCLUIDA", "CANCELADA"]) });
