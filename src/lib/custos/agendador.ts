// Agendador interno da atualizacao do Custo por Contrato: o proprio servidor do app re-le o Senior de tempos em tempos,
// para quem abre a tela de manha ja encontrar os numeros frescos (alem do botao Atualizar e da atualizacao ao abrir).
// Janela: segunda a sabado, 06h-21h (horario de Sao Paulo), a cada ~30 min (so' dispara se a ultima leitura OK tem mais que
// isso). Interruptor: variavel de ambiente CUSTOS_AUTO=0 desliga. Nunca roda em desenvolvimento/homologacao.

import { dispararAtualizacao, encerrarExecucoesOrfas, estadoAtualizacao } from "./atualizacaoCusto";

export const INTERVALO_VERIFICACAO_MS = 10 * 60_000;
export const IDADE_MAXIMA_PARA_REPETIR_MS = 28 * 60_000;
const HORA_INICIAL = 6;
const HORA_FINAL = 21; // ultima hora cheia em que ainda dispara (21:xx)

/** Dia da semana (0=domingo) e hora no fuso de Sao Paulo. */
export function relogioSaoPaulo(agora: Date): { diaSemana: number; hora: number } {
  const partes = new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", weekday: "short", hour: "2-digit", hourCycle: "h23" }).formatToParts(agora);
  const dia = partes.find((p) => p.type === "weekday")?.value ?? "Sun";
  const hora = Number(partes.find((p) => p.type === "hour")?.value ?? "0");
  return { diaSemana: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(dia), hora };
}

/** PURA: dentro da janela de funcionamento e com a ultima leitura OK velha (ou inexistente)? */
export function devoAtualizarAgora(agora: Date, ultimaOkEm: Date | null): boolean {
  const { diaSemana, hora } = relogioSaoPaulo(agora);
  if (diaSemana === 0) return false; // domingo
  if (hora < HORA_INICIAL || hora > HORA_FINAL) return false;
  if (!ultimaOkEm) return true;
  return agora.getTime() - ultimaOkEm.getTime() > IDADE_MAXIMA_PARA_REPETIR_MS;
}

async function verificar() {
  try {
    const estado = await estadoAtualizacao();
    if (estado.emCurso) return;
    const ultimaOk = estado.ultimaOk?.finalizadoEm ? new Date(estado.ultimaOk.finalizadoEm) : null;
    // depois de uma falha espera ~30 min antes de tentar de novo (nao martela o Senior se ele estiver fora)
    const falhou = estado.ultimoErro?.finalizadoEm ? new Date(estado.ultimoErro.finalizadoEm) : null;
    if (falhou && Date.now() - falhou.getTime() < 30 * 60_000) return;
    if (devoAtualizarAgora(new Date(), ultimaOk)) await dispararAtualizacao("automático (agendador do sistema)");
  } catch {
    /* nunca derruba o servidor por causa do agendador */
  }
}

export function iniciarAgendadorCustos() {
  const g = globalThis as unknown as { __agendadorCustos?: ReturnType<typeof setInterval> };
  if (g.__agendadorCustos) return; // um so' por processo (HMR/recarga)
  // um reinicio do servidor (deploy) mata a leitura em curso: limpa o registro que ficou "EXECUTANDO" para a tela nao mostrar progresso travado
  void encerrarExecucoesOrfas().catch(() => {});
  g.__agendadorCustos = setInterval(verificar, INTERVALO_VERIFICACAO_MS);
  g.__agendadorCustos.unref?.();
  setTimeout(verificar, 90_000).unref?.(); // 1a checagem logo depois do boot (ex.: apos um deploy)
}
