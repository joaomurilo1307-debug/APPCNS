import { test } from "node:test";
import assert from "node:assert/strict";
import { pendenciasOc, valorTotalOc } from "../src/lib/senior/pendenciasOc";

const ok = { sitApr: "APR", numTit: "123", nfs: ["9"], rateioTotal: 10 };

test("OC completa nao tem pendencia", () => assert.deepEqual(pendenciasOc(ok), []));

test("cada pendencia e' acusada", () => {
  assert.deepEqual(pendenciasOc({ ...ok, numTit: null }), ["sem título"]);
  assert.deepEqual(pendenciasOc({ ...ok, nfs: [] }), ["sem NF"]);
  assert.deepEqual(pendenciasOc({ ...ok, sitApr: "ANA" }), ["não aprovada"]);
  assert.deepEqual(pendenciasOc({ ...ok, rateioTotal: 0 }), ["rateio zerado"]);
  assert.deepEqual(pendenciasOc({ sitApr: "REP", numTit: null, nfs: [], rateioTotal: 0 }), ["não aprovada", "sem título", "sem NF", "rateio zerado"]);
});

test("rateio nao conferido (null) nao acusa; cancelada nao acusa nada", () => {
  assert.deepEqual(pendenciasOc({ ...ok, rateioTotal: null }), []);
  assert.deepEqual(pendenciasOc({ sitApr: "CAN", numTit: null, nfs: [], rateioTotal: 0 }), []);
});

test("valor: VLRLIQ, senao itens, senao rateio", () => {
  assert.equal(valorTotalOc(181.06, 999, 999), 181.06);
  assert.equal(valorTotalOc(0, 537, 100), 537); // OC 15473: cancelada, VLRLIQ 0
  assert.equal(valorTotalOc(0, null, 6865), 6865);
  assert.equal(valorTotalOc(0, 0, 0), 0);
});
