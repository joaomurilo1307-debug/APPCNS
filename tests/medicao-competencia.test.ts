import { test } from "node:test";
import assert from "node:assert/strict";
import { competenciaDoPedido, competenciaPorEmissao, lerBoletim, somaMes } from "../src/lib/medicao/competencia";

test("le o boletim e o mes do PEDCLI (formato real do Senior: BM35 01.2026)", () => {
  assert.deepEqual(lerBoletim("BM35 01.2026"), { boletim: "BM35", mes: "2026-01" });
  assert.deepEqual(lerBoletim("BM22 12.2024"), { boletim: "BM22", mes: "2024-12" });
  assert.deepEqual(lerBoletim("bm 7 3/2025"), { boletim: "BM7", mes: "2025-03" });
  assert.deepEqual(lerBoletim("MEDIÇÃO 10 - 03-2026"), { boletim: "BM10", mes: "2026-03" });
  assert.deepEqual(lerBoletim("Medicao no 04 04.2026"), { boletim: "BM4", mes: "2026-04" });
});

test("PEDCLI sem mes reconhecivel nao inventa mes", () => {
  assert.deepEqual(lerBoletim(""), { boletim: null, mes: null });
  assert.deepEqual(lerBoletim(null), { boletim: null, mes: null });
  assert.deepEqual(lerBoletim("PEDIDO 4500123"), { boletim: null, mes: null });
  assert.equal(lerBoletim("BM40 13.2026").mes, null); // mes 13 nao existe
  assert.equal(lerBoletim("NF 2026").mes, null);
});

test("competencia vem do boletim quando ele e' coerente com a emissao (pedidos reais do CT 3687)", () => {
  // emitido 10/02/2026, BM35 01.2026 -> janeiro/2026 (o pedido 384 = R$ 804.466,52 do faturamento de janeiro)
  assert.deepEqual(competenciaDoPedido({ pedCli: "BM35 01.2026", dataEmissao: "10/02/2026", ccu: "230" }), { competencia: "2026-01", origem: "BOLETIM", boletim: "BM35", inconsistente: false });
  // emitido 10/01/2025, BM22 12.2024 -> dezembro/2024 (cruza o ano)
  assert.equal(competenciaDoPedido({ pedCli: "BM22 12.2024", dataEmissao: "10/01/2025", ccu: "230" })!.competencia, "2024-12");
});

test("sem mes no PEDCLI cai na regra da emissao (menos 1 mes) e fica marcado", () => {
  const c = competenciaDoPedido({ pedCli: "", dataEmissao: "10/02/2026", ccu: "230" })!;
  assert.equal(c.competencia, "2026-01");
  assert.equal(c.origem, "EMISSAO");
  assert.equal(c.inconsistente, false);
});

test("corte de dia por contrato: AGA MSG (170) dia >= 24 fica no mesmo mes; PM Contagem (270) sempre o mesmo mes", () => {
  assert.equal(competenciaPorEmissao("25/03/2026", "170"), "2026-03");
  assert.equal(competenciaPorEmissao("23/03/2026", "170"), "2026-02");
  assert.equal(competenciaPorEmissao("05/03/2026", "270"), "2026-03");
  assert.equal(competenciaPorEmissao("22/03/2026", "370"), "2026-03");
  assert.equal(competenciaPorEmissao("21/03/2026", "370"), "2026-02");
  assert.equal(competenciaPorEmissao("31/03/2026", "999"), "2026-02"); // CCU sem regra propria: sempre menos 1 mes
  assert.equal(competenciaPorEmissao("15/01/2026", null), "2025-12"); // vira o ano
});

test("boletim incoerente (depois da emissao ou muito antigo) e' ignorado e sinalizado", () => {
  const futuro = competenciaDoPedido({ pedCli: "BM40 12.2026", dataEmissao: "10/02/2026", ccu: "230" })!;
  assert.equal(futuro.origem, "EMISSAO");
  assert.equal(futuro.inconsistente, true);
  assert.equal(futuro.competencia, "2026-01");
  const antigo = competenciaDoPedido({ pedCli: "BM1 01.2020", dataEmissao: "10/02/2026", ccu: "230" })!;
  assert.equal(antigo.origem, "EMISSAO");
  assert.equal(antigo.inconsistente, true);
});

test("data invalida nao quebra", () => {
  assert.equal(competenciaDoPedido({ pedCli: "BM1 01.2026", dataEmissao: "", ccu: null }), null);
  assert.equal(competenciaDoPedido({ pedCli: null, dataEmissao: "31/12/1900", ccu: null })!.competencia, "1900-11");
});

test("somaMes", () => {
  assert.equal(somaMes("2026-01", -1), "2025-12");
  assert.equal(somaMes("2026-11", 3), "2027-02");
});
