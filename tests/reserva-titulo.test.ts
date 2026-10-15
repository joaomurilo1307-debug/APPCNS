import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirReserva, RESERVA_RECENTE_MS } from "../src/lib/senior/reservaTitulo";

const agora = Date.parse("2026-10-15T12:00:00Z");
const ha = (ms: number) => new Date(agora - ms);

test("titulo existe na Senior: a reserva vale e bloqueia novo titulo", () => {
  assert.equal(decidirReserva(ha(60 * 60_000), true, agora), "vale");
  assert.equal(decidirReserva(ha(1000), true, agora), "vale");
});

test("caso real TESTE1510: reserva antiga sem titulo na Senior e' orfa (libera)", () => {
  assert.equal(decidirReserva(ha(RESERVA_RECENTE_MS + 1000), false, agora), "orfa");
});

test("falha 1: reserva recente sem titulo ainda pode estar gravando -> nao mexe", () => {
  assert.equal(decidirReserva(ha(30_000), false, agora), "em-andamento");
});

test("falha 2: nao deu pra conferir na Senior -> nunca libera (evita titulo duplicado)", () => {
  assert.equal(decidirReserva(ha(60 * 60_000), null, agora), "indeterminado");
});
