import { test } from "node:test";
import assert from "node:assert/strict";
import { pendenciaRateio, pendenciasOc, valorDaOc } from "../src/lib/senior/pendenciasOc";
import { paraOc } from "../src/lib/senior/ocsConferencia";

const rateioOk = { linhas: 1, valor: 10, percentual: 100 };
const ok = { sitApr: "APR", numTit: "123", nfs: ["9"], rateio: rateioOk };

test("OC completa nao tem pendencia", () => assert.deepEqual(pendenciasOc(ok), []));

test("cada pendencia e' acusada", () => {
  assert.deepEqual(pendenciasOc({ ...ok, numTit: null }), ["sem título"]);
  assert.deepEqual(pendenciasOc({ ...ok, nfs: [] }), ["sem NF"]);
  assert.deepEqual(pendenciasOc({ ...ok, sitApr: "ANA" }), ["não aprovada"]);
  assert.deepEqual(pendenciasOc({ ...ok, rateio: { linhas: 1, valor: 0, percentual: 0 } }), ["rateio zerado"]);
  assert.deepEqual(pendenciasOc({ ...ok, rateio: { linhas: 0, valor: 0, percentual: 0 } }), ["sem rateio"]);
  assert.deepEqual(pendenciasOc({ sitApr: "REP", numTit: null, nfs: [], rateio: { linhas: 1, valor: 0, percentual: 0 } }), ["não aprovada", "sem título", "sem NF", "rateio zerado"]);
});

test("titulo: vale o apurado na Senior; numero digitado que nao existe e' 'sem titulo'", () => {
  assert.deepEqual(pendenciasOc({ ...ok, numTit: "43=1", temTitulo: false }), ["sem título"]);
  assert.deepEqual(pendenciasOc({ ...ok, numTit: null, temTitulo: true }), []);
});

test("rateio nao conferido (null) nao acusa; cancelada nao acusa nada", () => {
  assert.deepEqual(pendenciasOc({ ...ok, rateio: null }), []);
  assert.deepEqual(pendenciasOc({ sitApr: "CAN", numTit: null, nfs: [], rateio: { linhas: 0, valor: 0, percentual: 0 } }), []);
});

test("OC cancelada na Senior (SITOCP 5) vira CAN mesmo com SITAPR APR (OC 16728)", () => {
  const o = paraOc({ NUMOCP: "16728", CODFIL: "1", CODFOR: "1", SITOCP: "5", SITAPR: "APR", VLRLIQ: "0", VLRORI: "0", USU_DATVECT: "27/11/2026" });
  assert.equal(o.sitApr, "CAN");
  assert.deepEqual(pendenciasOc({ sitApr: o.sitApr, numTit: null, nfs: [], rateio: null }), []);
  assert.equal(paraOc({ NUMOCP: "1", CODFIL: "1", CODFOR: "1", SITOCP: "1", SITAPR: "APR" }).sitApr, "APR");
});

test("rateio com VLRRAT zerado pela NF mas com percentual NAO e' rateio zerado (OC 16778, 23/11/2026)", () => {
  assert.equal(pendenciaRateio({ linhas: 3, valor: 0, percentual: 100 }), null);
  assert.equal(pendenciaRateio({ linhas: 3, valor: 435.6, percentual: 0 }), null);
});

test("valor: atendida pela NF usa o original (VLRORI); aberta usa o saldo; senao itens e rateio", () => {
  assert.equal(valorDaOc({ sitOcp: "4", vlrLiq: 0, vlrOri: 435.6 }, null, null), 435.6); // OC 16778 liquidada: a tela mostrava R$ 0,00
  assert.equal(valorDaOc({ sitOcp: "2", vlrLiq: 262.5, vlrOri: 725.5 }, null, null), 725.5); // OC 16337 atendida em parte
  assert.equal(valorDaOc({ sitOcp: "9", vlrLiq: 13145, vlrOri: 0 }, null, null), 13145); // OC 16652 nao fechada
  assert.equal(valorDaOc({ sitOcp: "1", vlrLiq: 181.06, vlrOri: 181.06 }, 999, 999), 181.06);
  assert.equal(valorDaOc({ sitOcp: "5", vlrLiq: 0, vlrOri: 0 }, 537, 100), 537); // OC 15473: cancelada, so' os itens
  assert.equal(valorDaOc({ sitOcp: "9", vlrLiq: 0, vlrOri: 0 }, null, 6865), 6865);
  assert.equal(valorDaOc({ sitOcp: "9", vlrLiq: 0, vlrOri: 0 }, 0, 0), 0);
});
