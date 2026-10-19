import { test } from "node:test";
import assert from "node:assert/strict";
import { devoAtualizarAgora, relogioSaoPaulo } from "../src/lib/custos/agendador";

// Sao Paulo = UTC-3 (sem horario de verao desde 2019). 2026-10-19 e' segunda-feira.
const brt = (iso: string) => new Date(iso + "-03:00");

test("relogio de Sao Paulo: dia da semana e hora", () => {
  assert.deepEqual(relogioSaoPaulo(brt("2026-10-19T10:30:00")), { diaSemana: 1, hora: 10 });
  assert.deepEqual(relogioSaoPaulo(brt("2026-10-18T23:59:00")), { diaSemana: 0, hora: 23 });
  assert.deepEqual(relogioSaoPaulo(new Date("2026-10-20T01:00:00Z")), { diaSemana: 1, hora: 22 }); // 01:00Z = 22:00 de segunda em SP
});

test("agendador: janela segunda a sabado, 06h a 21h59", () => {
  assert.equal(devoAtualizarAgora(brt("2026-10-19T05:59:00"), null), false);
  assert.equal(devoAtualizarAgora(brt("2026-10-19T06:00:00"), null), true);
  assert.equal(devoAtualizarAgora(brt("2026-10-19T21:59:00"), null), true);
  assert.equal(devoAtualizarAgora(brt("2026-10-19T22:00:00"), null), false);
  assert.equal(devoAtualizarAgora(brt("2026-10-24T12:00:00"), null), true); // sabado
  assert.equal(devoAtualizarAgora(brt("2026-10-18T12:00:00"), null), false); // domingo
});

test("agendador: so' repete quando a ultima leitura OK tem mais de ~28 min", () => {
  const agora = brt("2026-10-19T14:00:00");
  assert.equal(devoAtualizarAgora(agora, new Date(agora.getTime() - 10 * 60_000)), false);
  assert.equal(devoAtualizarAgora(agora, new Date(agora.getTime() - 27 * 60_000)), false);
  assert.equal(devoAtualizarAgora(agora, new Date(agora.getTime() - 29 * 60_000)), true);
  assert.equal(devoAtualizarAgora(agora, null), true);
});
