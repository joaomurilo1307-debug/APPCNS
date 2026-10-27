import { z } from "zod";

const text = (max = 4000) => z.string().trim().max(max).nullable().optional();
const day = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])-([0-2]\d|3[01])$/).refine((value) => {
  const parsed = new Date(`${value}T12:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Informe uma data válida.").nullable().optional();

/** Campos do formulário FOR 1.0.50; execução e pessoas continuam nos registros canônicos. */
export const detalhesDoPlano = z.object({
  competence: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).nullable().optional(),
  item: text(100), account: text(200), fact: text(),
  correctiveMeasure: text(), correctiveHow: text(), preventiveMeasure: text(), preventiveHow: text(),
  plannedStart: day, originalDueDate: day, replannedDueDate: day, actualCompletion: day, notes: text(),
}).strict().superRefine((value, ctx) => {
  const due = value.replannedDueDate || value.originalDueDate;
  if (value.plannedStart && due && due < value.plannedStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["replannedDueDate"], message: "O prazo deve ser igual ou posterior ao início." });
  if (value.plannedStart && value.actualCompletion && value.actualCompletion < value.plannedStart) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["actualCompletion"], message: "O realizado deve ser igual ou posterior ao início." });
});
export type DetalhesDoPlano = z.infer<typeof detalhesDoPlano>;

export function lerDetalhesDoPlano(value: unknown): DetalhesDoPlano | null {
  const result = detalhesDoPlano.safeParse(value);
  return result.success ? result.data : null;
}
export const dataDoItem = (day: string | null | undefined) => day ? new Date(`${day}T12:00:00.000Z`) : null;
export const diaDoItem = (date: Date | string | null | undefined) => date instanceof Date ? date.toISOString().slice(0, 10) : date?.slice(0, 10) ?? null;

/** O formulário informa o dia: no mesmo dia, não produzir término anterior à hora real de início. */
export function fimRealDoItem(day: string | null | undefined, actualStartedAt?: Date | null) {
  const end = dataDoItem(day);
  return end && actualStartedAt && diaDoItem(actualStartedAt) === day && actualStartedAt > end ? new Date(actualStartedAt) : end;
}
