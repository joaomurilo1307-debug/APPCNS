// Busca automatica de titulos e OCs na Senior, de 10 em 10 minutos (12/11/2026) -- no lugar do agendamento do n8n, que rodava
// os scripts do VPS. Uma rodada busca os titulos e depois as OCs; a proxima so' comeca 10 min depois do fim da anterior (nunca
// sobrepoe). Titulos vao pela busca RAPIDA; a COMPLETA (historico de pagos inteiro, ~15 min) roda quando nunca rodou, quando a
// ultima tem mais de 24 h ou, de madrugada (1h-5h), quando tem mais de 12 h -- assim, depois do primeiro dia, ela fica a noite.
// A primeira rodada depois de subir e' sempre rapida (o botao nao fica preso atras de uma completa logo apos o reinicio).
// Ligado em src/instrumentation-node.ts (so' producao). SENIOR_SYNC_AUTO=0 desliga; SENIOR_SYNC_INTERVALO_MIN muda o intervalo
// (minimo 5).

import { aguardarSincronizacao, iniciarSincronizacao, ultimaBuscaCompleta, type ModoTitulos } from "./execucao";

/** Hora (0-23) em Sao Paulo. */
const horaSaoPaulo = (d: Date) => Number(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", hour: "numeric", hourCycle: "h23" }).format(d));

/** `primeira`: rodada logo depois de subir -- sempre rapida, para os abertos chegarem em minutos; a completa vem na seguinte. */
export function modoDaRodada(ultimaCompleta: Date | null, agora = new Date(), primeira = false): ModoTitulos {
  if (primeira) return "rapida";
  if (!ultimaCompleta) return "completa";
  const horas = (agora.getTime() - ultimaCompleta.getTime()) / 3_600_000;
  if (horas >= 24) return "completa";
  const hora = horaSaoPaulo(agora);
  return hora >= 1 && hora < 5 && horas >= 12 ? "completa" : "rapida";
}

export function iniciarAgendadorSincronizacao() {
  const g = globalThis as { __agendadorSeniorSync?: boolean };
  if (g.__agendadorSeniorSync) return;
  g.__agendadorSeniorSync = true;
  if (!process.env.SENIOR_WS_SAPIENS_USER || !process.env.SENIOR_WS_SAPIENS_PASSWORD) {
    console.error("[senior-sync] agendador desligado: credencial da Senior (SENIOR_WS_SAPIENS_USER/PASSWORD) ausente");
    return;
  }
  const intervaloMs = Math.max(5, Number(process.env.SENIOR_SYNC_INTERVALO_MIN) || 10) * 60_000;

  let primeira = true;
  const rodada = async () => {
    try {
      const modo = modoDaRodada(await ultimaBuscaCompleta(), new Date(), primeira);
      primeira = false;
      iniciarSincronizacao("titulos", "AGENDADOR", null, undefined, modo);
      await aguardarSincronizacao("titulos");
      iniciarSincronizacao("ocs", "AGENDADOR");
      await aguardarSincronizacao("ocs");
    } catch (e) {
      console.error("[senior-sync] rodada automatica falhou", (e as Error)?.message ?? e);
    }
    setTimeout(rodada, intervaloMs);
  };
  // Primeira rodada ~1,5 min depois de subir (deixa o servidor terminar de abrir).
  setTimeout(rodada, 90_000);
  console.log(`[senior-sync] agendador ligado: titulos e OCs a cada ${intervaloMs / 60_000} min`);
}
