// Agendador interno da atualizacao do Custo por Contrato: o proprio servidor do app re-le o Senior de tempos em tempos,
// para quem abre a tela de manha ja encontrar os numeros frescos (alem do botao Atualizar e da atualizacao ao abrir).
// Janela: segunda a sabado, 06h-21h (horario de Sao Paulo), a cada ~30 min (so' dispara se a ultima leitura OK tem mais que
// isso). Interruptor: variavel de ambiente CUSTOS_AUTO=0 desliga. Nunca roda em desenvolvimento/homologacao.

import { dispararAtualizacao, encerrarExecucoesOrfas, estadoAtualizacao } from "./atualizacaoCusto";
import { dispararMedicao, estadoMedicao } from "@/lib/medicao/sincronizar";
import { prisma } from "@/lib/prisma";
import { verificarCargas } from "@/lib/vigia/sincronizacao";

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

/** Vigia das cargas de titulos e OCs (ver src/lib/vigia/sincronizacao.ts): avisa os administradores no sino quando o Senior deixa de chegar. */
async function vigiarCargas() {
  try {
    const agora = new Date();
    const { diaSemana, hora } = relogioSaoPaulo(agora);
    await verificarCargas(prisma, agora, diaSemana !== 0 && hora >= HORA_INICIAL && hora <= HORA_FINAL);
  } catch {
    /* nunca derruba o servidor por causa do vigia */
  }
}

async function verificar() {
  await vigiarCargas();
  try {
    const estado = await estadoAtualizacao();
    if (estado.emCurso) return;
    const ultimaOk = estado.ultimaOk?.finalizadoEm ? new Date(estado.ultimaOk.finalizadoEm) : null;
    // depois de uma falha espera ~30 min antes de tentar de novo (nao martela o Senior se ele estiver fora)
    const falhou = estado.ultimoErro?.finalizadoEm ? new Date(estado.ultimoErro.finalizadoEm) : null;
    if (falhou && Date.now() - falhou.getTime() < 30 * 60_000) return;
    if (devoAtualizarAgora(new Date(), ultimaOk)) {
      await dispararAtualizacao("automático (agendador do sistema)");
      return;
    }
    await verificarMedicao(); // o custo nao esta na hora: aproveita para a Medicao (as duas leituras nunca rodam juntas: o Senior atende uma por vez)
  } catch {
    /* nunca derruba o servidor por causa do agendador */
  }
}

/** Medicao (contratos, linhas e pedidos): muda devagar, entao so' relê a cada ~6 h, na mesma janela do custo (seg-sab, 06h-21h). */
async function verificarMedicao() {
  const { diaSemana, hora } = relogioSaoPaulo(new Date());
  if (diaSemana === 0 || hora < HORA_INICIAL || hora > HORA_FINAL) return;
  const m = await estadoMedicao();
  if (m.emCurso || !m.dadosVelhos) return;
  const falhou = m.ultimoErro?.finalizadoEm ? new Date(m.ultimoErro.finalizadoEm) : null;
  if (falhou && Date.now() - falhou.getTime() < 60 * 60_000) return; // depois de uma falha espera 1 h
  await dispararMedicao("automático (agendador do sistema)");
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
