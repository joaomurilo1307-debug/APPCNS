import { z } from "zod";
import { configuracaoCoerente } from "./calculo";

const mes = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
const data = z.string().datetime().nullable();
export const dadosMeta = z.object({
  title: z.string().trim().min(2).max(200), description: z.string().max(4000).nullable().optional(),
  category: z.enum(["CUSTO", "GLOSA", "FALTAS", "MEDICAO", "RESULTADOS", "GERAL"]),
  kind: z.enum(["INDICADOR", "PLANO"]).default("INDICADOR"),
  unit: z.string().trim().min(1).max(40).nullable().default(null), baselineValue: z.number().finite().nullable().default(null), targetValue: z.number().finite().nullable().default(null), direction: z.enum(["REDUZIR", "AUMENTAR"]).nullable().default(null),
  source: z.enum(["MANUAL", "CUSTO", "FATURAMENTO", "MEDICAO"]).default("MANUAL"), sourceAccount: z.string().max(100).nullable().optional(),
  periodStart: mes.nullable().optional(), periodEnd: mes.nullable().optional(),
  dueDate: data.optional(), ownerId: z.string().nullable().optional(), status: z.enum(["ATIVA", "PAUSADA", "CONCLUIDA", "ARQUIVADA"]).default("ATIVA"),
});
export function erroConfiguracao(meta: z.infer<typeof dadosMeta>): string | null {
  if (meta.kind === "PLANO") return meta.source !== "MANUAL" || meta.baselineValue !== null || meta.targetValue !== null || meta.unit !== null || meta.direction !== null ? "O plano livre usa ações, sem valores ou fonte financeira." : null;
  if (meta.baselineValue === null || meta.targetValue === null || meta.unit === null || meta.direction === null) return "Informe unidade, linha de base, alvo e direção do indicador.";
  if (!configuracaoCoerente(meta.baselineValue, meta.targetValue, meta.direction)) return "O alvo deve respeitar a direção escolhida em relação à linha de base.";
  if (meta.source !== "MANUAL" && (!meta.periodStart || !meta.periodEnd)) return "Informe o período da fonte automática.";
  if (meta.source !== "MANUAL" && meta.unit !== "R$") return "As fontes financeiras automáticas usam valores em R$.";
  if (meta.source !== "MANUAL" && ["GLOSA", "FALTAS"].includes(meta.category)) return "Glosas e faltas usam medição manual.";
  if (meta.periodStart && meta.periodEnd && meta.periodStart > meta.periodEnd) return "O mês inicial deve ser anterior ao mês final.";
  if (meta.periodStart && meta.periodEnd) {
    const indice = (mes: string) => Number(mes.slice(0, 4)) * 12 + Number(mes.slice(5));
    if (indice(meta.periodEnd) - indice(meta.periodStart) >= 48) return "Selecione no máximo 48 meses.";
  }
  return null;
}
export const novaMeta = dadosMeta.extend({ codccu: z.string().regex(/^\d+$/) });
export const medicaoMeta = z.object({ operation: z.literal("measurement"), value: z.number().finite(), measuredAt: z.string().datetime(), period: mes.nullable().optional(), note: z.string().max(4000).nullable().optional() });
export const acaoMeta = z.object({ operation: z.literal("action"), title: z.string().trim().min(2).max(250), description: z.string().max(4000).nullable().optional(), ownerId: z.string().nullable().optional(), dueDate: data.optional(), status: z.enum(["A_FAZER", "EM_ANDAMENTO", "BLOQUEADA", "CONCLUIDA", "CANCELADA"]).default("A_FAZER") });
export const alterarAcao = z.object({ operation: z.literal("updateAction"), actionId: z.string(), title: z.string().trim().min(2).max(250).optional(), description: z.string().max(4000).nullable().optional(), ownerId: z.string().nullable().optional(), dueDate: data.optional(), status: z.enum(["A_FAZER", "EM_ANDAMENTO", "BLOQUEADA", "CONCLUIDA", "CANCELADA"]) });
