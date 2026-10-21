// Agendador interno da geracao automatica de dossies (a logica esta em automatico.ts): o proprio servidor do app
// confere a cada ~5 min se alguma OC esta sem dossie, com dossie desatualizado ou com falha a repetir, e gera.
// Janela: segunda a sabado, 06h-21h (horario de Sao Paulo) -- a mesma do agendador do Custo por Contrato, porque as duas
// leituras disputam o mesmo web service da Senior. Interruptor: DOSSIE_AUTO=0 desliga. Nunca roda em desenvolvimento nem
// em homologacao (src/instrumentation.ts); la' so' o botao "Verificar agora" dispara um ciclo.

import { dispararCiclo, estadoAutomatico } from "./automatico";

export const INTERVALO_VERIFICACAO_MS = 5 * 60_000;
const HORA_INICIAL = 6;
const HORA_FINAL = 21; // ultima hora cheia em que ainda dispara (21:xx)

/** Dia da semana (0=domingo) e hora no fuso de Sao Paulo. */
export function relogioSaoPaulo(agora: Date): { diaSemana: number; hora: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(agora);
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  return { diaSemana: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dia), hora };
}

/** PURA: dentro da janela de funcionamento (seg-sab, 06h-21h59)? */
export function dentroDaJanela(agora: Date): boolean {
  const { diaSemana, hora } = relogioSaoPaulo(agora);
  return diaSemana !== 0 && hora >= HORA_INICIAL && hora <= HORA_FINAL;
}

function verificar() {
  try {
    if (!dentroDaJanela(new Date())) return;
    if (estadoAutomatico().emCurso) return;
    dispararCiclo("agendador do sistema");
  } catch {
    /* nunca derruba o servidor por causa do agendador */
  }
}

export function iniciarAgendadorDossies() {
  const g = globalThis as unknown as { __agendadorDossies?: ReturnType<typeof setInterval> };
  if (g.__agendadorDossies) return; // um so' por processo (HMR/recarga)
  g.__agendadorDossies = setInterval(verificar, INTERVALO_VERIFICACAO_MS);
  g.__agendadorDossies.unref?.();
  setTimeout(verificar, 120_000).unref?.(); // 1a checagem logo depois do boot (ex.: apos um deploy), depois do agendador do custo
}
