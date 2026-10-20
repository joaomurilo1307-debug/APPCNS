import { test } from "node:test";
import assert from "node:assert/strict";
import { competenciaDoPedido, competenciaPorEmissao, lerBoletim, ehCargaAcumulada, COMPETENCIA_ACUMULADO, somaMes } from "../src/lib/medicao/competencia";

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
  const antigo = competenciaDoPedido({ pedCli: "BM1 01.2019", dataEmissao: "10/02/2026", ccu: "230" })!;
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

test("formatos reais encontrados no Senior (ano com 2 digitos, espaco, texto no meio)", () => {
  assert.deepEqual(lerBoletim("BM 21 12.24"), { boletim: "BM21", mes: "2024-12" });
  assert.deepEqual(lerBoletim("BM 15 MSG 02.25"), { boletim: "BM15", mes: "2025-02" });
  assert.deepEqual(lerBoletim("BM08 01 2021"), { boletim: "BM8", mes: "2021-01" });
  assert.deepEqual(lerBoletim("BM02 09.2021"), { boletim: "BM2", mes: "2021-09" });
});

test("PEDCLI que nao e' um mes nao vira mes (acumulados, faixas, produtos, texto solto)", () => {
  for (const v of ["3728 BM01/BM08", "BM01 A BM32", "BM ACUMULADO", "ACUMULADOS", "PRODUTO 06", "PRODUTO 05", "5", "c", "bm 01 teste"]) {
    assert.equal(lerBoletim(v).mes, null, v);
  }
  assert.equal(lerBoletim("BM 21").boletim, "BM21");
});

test("ano de 2 digitos fora da faixa e mes invalido nao passam", () => {
  assert.equal(lerBoletim("BM3 13.24").mes, null);
  assert.equal(lerBoletim("BM3 12.19").mes, null);
});

test("carga historica: boletim de 2021 em pedido emitido anos depois vale o mes do boletim", () => {
  const c = competenciaDoPedido({ pedCli: "BM08 01.2021", dataEmissao: "15/03/2024", ccu: "102035" })!;
  assert.equal(c.competencia, "2021-01");
  assert.equal(c.origem, "BOLETIM");
});

test("carga acumulada: ACUMULADOS, faixa de boletins e BM01/BM08 nao pertencem a um mes", () => {
  for (const v of ["ACUMULADOS", "ACUMULADO", "BM ACUMULADO", "BM01 A BM32", "3728 BM01/BM08", "bm 01 a bm 08", "BM1 ATE BM9"]) assert.equal(ehCargaAcumulada(v), true, v);
  for (const v of ["BM35 01.2026", "BM 21 12.24", "BM 15 MSG 02.25", "REAJ.01 04.2026", "PRODUTO 05", "bm 01 teste", "", null]) assert.equal(ehCargaAcumulada(v), false, String(v));
  const c = competenciaDoPedido({ pedCli: "ACUMULADOS", dataEmissao: "22/08/2025", ccu: "140" })!;
  assert.equal(c.origem, "ACUMULADO");
  assert.equal(c.competencia, COMPETENCIA_ACUMULADO);
  // se o texto traz o mes, o mes vale (BM ACUM 12.2024 e' dezembro/2024)
  assert.equal(competenciaDoPedido({ pedCli: "BM ACUM 12.2024", dataEmissao: "10/01/2025", ccu: "140" })!.origem, "BOLETIM");
});

test("mes de boletim corrigido so' onde a planilha de faturamento do financeiro prova (CCR BM07: Senior diz 07.2026, periodo 11/08 a 10/09 = agosto)", () => {
  const c = competenciaDoPedido({ pedCli: "BM07 07.2026", dataEmissao: "2026-09-11", ccu: "340", numCtr: "68" });
  assert.equal(c?.competencia, "2026-08");
  assert.equal(c?.corrigidoDe, "2026-07");
  assert.equal(c?.origem, "BOLETIM");
  // outro contrato com o mesmo numero de boletim nao e' tocado
  assert.equal(competenciaDoPedido({ pedCli: "BM07 07.2026", dataEmissao: "2026-09-11", ccu: "340", numCtr: "99" })?.competencia, "2026-07");
  // sem numero de contrato (chamada antiga) nada muda
  assert.equal(competenciaDoPedido({ pedCli: "BM07 07.2026", dataEmissao: "2026-09-11", ccu: "340" })?.competencia, "2026-07");
});

test("o Senior estava certo: MRN 3581 BM47 ('BM47 07.2026 C' = complementar de julho, periodo 26/07 a 31/07) e MRN 3728 BM20 ('01 06.2026' = semestre ate junho) NAO sao corrigidos", () => {
  assert.equal(competenciaDoPedido({ pedCli: "BM47 07.2026 C", dataEmissao: "2026-09-11", ccu: "240", numCtr: "12" })?.competencia, "2026-07");
  assert.equal(competenciaDoPedido({ pedCli: "BM20 01 06.2026", dataEmissao: "2026-08-17", ccu: "310", numCtr: "9" })?.competencia, "2026-06");
  assert.equal(competenciaDoPedido({ pedCli: "BM20 06.2026", dataEmissao: "2026-08-17", ccu: "310", numCtr: "9" })?.competencia, "2026-06");
  assert.equal(competenciaDoPedido({ pedCli: "BM21 09.2026", dataEmissao: "2026-10-08", ccu: "310", numCtr: "9" })?.competencia, "2026-09");
});

test("correcao de mes nunca coloca o boletim depois da emissao do pedido", () => {
  // se a emissao fosse antes do mes corrigido, vale o que o Senior diz
  const c = competenciaDoPedido({ pedCli: "BM07 07.2026", dataEmissao: "2026-07-20", ccu: "340", numCtr: "68" });
  assert.equal(c?.competencia, "2026-07");
  assert.equal(c?.corrigidoDe, undefined);
});
