export type RotinaFrequencia = "DIARIA" | "SEMANAL" | "MENSAL";

const MAX_OCCURRENCES = 366;

/**
 * Gera as datas de ocorrência de uma rotina (diária/semanal/mensal) entre o início e uma data
 * limite, inclusive nas duas pontas. Limitado a 366 ocorrências por segurança (evita gerar uma
 * quantidade absurda de tarefas se alguém digitar uma data-limite muito distante por engano).
 */
export function generateRotinaOccurrences(opts: {
  startDate: Date;
  untilDate: Date;
  frequencia: RotinaFrequencia;
}): Date[] {
  const { startDate, untilDate, frequencia } = opts;
  if (untilDate < startDate) return [];

  const dates: Date[] = [];
  const cursor = new Date(startDate);
  while (cursor <= untilDate && dates.length < MAX_OCCURRENCES) {
    dates.push(new Date(cursor));
    if (frequencia === "DIARIA") cursor.setUTCDate(cursor.getUTCDate() + 1);
    else if (frequencia === "SEMANAL") cursor.setUTCDate(cursor.getUTCDate() + 7);
    else cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return dates;
}
