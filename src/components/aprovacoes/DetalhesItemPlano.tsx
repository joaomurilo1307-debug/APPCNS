import type { DetalhesItemPlano as Detalhes } from "@/lib/contractGoals/tipos";
const data = (value?: string | null) => value ? value.slice(0, 10).split("-").reverse().join("/") : null;
export default function DetalhesItemPlano({ details, startDate, actualEndedAt, dueDate, canonical = false, status }: { details?: Detalhes | null; startDate?: string | null; actualEndedAt?: string | null; dueDate?: string | null; canonical?: boolean; status: string }) {
  if (!details && !startDate && !actualEndedAt) return null;
  const entries = [
    ["Competência", details?.competence ? details.competence.split("-").reverse().join("/") : null],
    ["Item", details?.item], ["Pacote/Conta Financeira", details?.account], ["Fato", details?.fact],
    ["Medida Corretiva", details?.correctiveMeasure], ["Como? (Corretiva)", details?.correctiveHow],
    ["Medida Preventiva", details?.preventiveMeasure], ["Como? (Preventiva)", details?.preventiveHow],
    ["Data de início", data(canonical ? startDate : startDate ?? details?.plannedStart)], ["Prazo de término", data(details?.originalDueDate)],
    ["Prazo reprogramado", data(canonical ? dueDate?.slice(0, 10) !== details?.originalDueDate ? dueDate : null : details?.replannedDueDate)], ["Prazo realizado", status === "CONCLUIDA" ? data(canonical ? actualEndedAt : actualEndedAt ?? details?.actualCompletion) : null], ["Observações", details?.notes],
  ].filter(([,value]) => value);
  return <dl className="mt-3 grid gap-3 border-t border-gray-200 pt-3 sm:grid-cols-2">{entries.map(([label,value]) => <div key={label} className={label === "Fato" || label === "Observações" ? "sm:col-span-2" : ""}><dt className="text-xs font-medium text-gray-500">{label}</dt><dd className="mt-1 whitespace-pre-wrap break-words text-sm text-gray-700">{value}</dd></div>)}</dl>;
}
