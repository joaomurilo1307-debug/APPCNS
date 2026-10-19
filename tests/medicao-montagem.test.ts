import { test } from "node:test";
import assert from "node:assert/strict";
import { montarMedicao, numero } from "../src/lib/medicao/montagem";
import { montarDetalhe, mesesDe } from "../src/lib/medicao/detalhe";

// ---- fixture que imita o formato real do Senior (virgula decimal, datas dd/mm/aaaa, aditivo com linha zerada)
const contratos = [
  { NUMCTR: "7", NUMOFI: "MRN CT 3687 2023", CODCLI: "54", DATINI: "02/06/2023" },
  { NUMCTR: "58", NUMOFI: "MRN CT 3687 2023 1ºT", CODCLI: "54", DATINI: "02/06/2023" }, // aditivo: contrato vazio
  { NUMCTR: "9", NUMOFI: "SEM PEDIDO", CODCLI: "1", DATINI: "01/01/2026" },
];
const linhas = [
  { NUMCTR: "7", SEQCVS: "2", CODSER: "174", CPLCVS: "SUPERVISOR", UNIMED: "HH", QTDCVS: "80", PREUNI: "18000,14", VLRTOT: "1440011,2", QTDFAT: "3", VLRFAT: "54000,42" },
  { NUMCTR: "7", SEQCVS: "5", CODSER: "429", CPLCVS: "TECNICO", UNIMED: "HH", QTDCVS: "36", PREUNI: "4837,18", VLRTOT: "174138,48", QTDFAT: "0", VLRFAT: "0" },
  { NUMCTR: "58", SEQCVS: "1", CODSER: "792", CPLCVS: "ADITIVO", UNIMED: "UN", QTDCVS: "1", PREUNI: "0", VLRTOT: "0", QTDFAT: "0", VLRFAT: "0" },
  { NUMCTR: "9", SEQCVS: "1", CODSER: "1", CPLCVS: "X", UNIMED: "UN", QTDCVS: "10", PREUNI: "100", VLRTOT: "1000", QTDFAT: "0", VLRFAT: "0" },
];
const itens = [
  { CODFIL: "1", NUMPED: "384", SEQISP: "1", CTRCVS: "7", SEQCTR: "2", QTDPED: "1", VLRBRU: "18000,14", PEDCLI: "BM35 01.2026" },
  { CODFIL: "1", NUMPED: "400", SEQISP: "1", CTRCVS: "7", SEQCTR: "2", QTDPED: "1", VLRBRU: "18000,14", PEDCLI: "BM36 02.2026" },
  { CODFIL: "1", NUMPED: "414", SEQISP: "1", CTRCVS: "7", SEQCTR: "2", QTDPED: "1", VLRBRU: "18000,14", PEDCLI: "" }, // sem boletim: cai na emissao
];
const pedidos = [
  { CODFIL: "1", NUMPED: "384", DATEMI: "10/02/2026", SITPED: "1" },
  { CODFIL: "1", NUMPED: "400", DATEMI: "11/03/2026", SITPED: "1" },
  { CODFIL: "1", NUMPED: "414", DATEMI: "08/04/2026", SITPED: "1" },
];
const rateios = [
  { CODFIL: "1", NUMPED: "384", SEQISP: "1", CODCCU: "230", VLRRAT: "18000,14" },
  { CODFIL: "1", NUMPED: "400", SEQISP: "1", CODCCU: "230", VLRRAT: "18000,14" },
  { CODFIL: "1", NUMPED: "414", SEQISP: "1", CODCCU: "240", VLRRAT: "18000,14" }, // um item rateado para outro CCU
];

test("numero do Senior: virgula decimal e ponto de milhar", () => {
  assert.equal(numero("18000,14"), 18000.14);
  assert.equal(numero("1.440.011,2"), 1440011.2);
  assert.equal(numero(""), 0);
  assert.equal(numero(undefined), 0);
});

test("so' entram contratos com linha de valor; aditivo vazio fica de fora", () => {
  const r = montarMedicao({ contratos, linhas, itens, pedidos, rateios });
  assert.deepEqual(r.contratos.map((c) => c.numCtr).sort(), ["7", "9"]);
  assert.equal(r.linhas.length, 3); // 2 do contrato 7 + 1 do 9; a linha zerada do aditivo nao conta
});

test("contrato: valores, centro de custo dominante pelo rateio e aviso de mais de um CCU", () => {
  const r = montarMedicao({ contratos, linhas, itens, pedidos, rateios });
  const c = r.contratos.find((x) => x.numCtr === "7")!;
  assert.equal(c.codccu, "230");
  assert.equal(c.codccusItens, "230,240");
  assert.equal(c.valorContratado, 1440011.2 + 174138.48);
  assert.equal(c.valorMedido, 54000.42);
  assert.deepEqual(r.resumo.contratosComMaisDeUmCcu, [{ numCtr: "7", ccus: "230,240" }]);
});

test("contrato sem pedido nao tem centro de custo e e' contado a parte", () => {
  const r = montarMedicao({ contratos, linhas, itens, pedidos, rateios });
  const c9 = r.contratos.find((x) => x.numCtr === "9")!;
  assert.equal(c9.codccu, null);
  assert.equal(r.resumo.contratosSemPedido, 1);
  assert.equal(r.resumo.contratosSemCentroDeCusto, 1);
});

test("mes de cada item: boletim quando ha, emissao menos 1 mes quando nao ha", () => {
  const r = montarMedicao({ contratos, linhas, itens, pedidos, rateios });
  const mes = (p: string) => r.itens.find((i) => i.numPed === p)!;
  assert.equal(mes("384").competencia, "2026-01");
  assert.equal(mes("384").origem, "BOLETIM");
  assert.equal(mes("384").boletim, "BM35");
  assert.equal(mes("414").competencia, "2026-03"); // emitido 08/04, sem boletim
  assert.equal(mes("414").origem, "EMISSAO");
  assert.equal(r.resumo.itensPorBoletim, 2);
  assert.equal(r.resumo.itensPorEmissao, 1);
});

test("conferencia com o Senior: a soma dos pedidos deve fechar com QTDFAT/VLRFAT da linha", () => {
  const r = montarMedicao({ contratos, linhas, itens, pedidos, rateios });
  // a fixture tem 3 itens de 18000,14 na linha 2 mas o Senior diz faturado 54000,42 / 3: fecha
  assert.equal(r.resumo.totalLinhasQueNaoBatem, 0);
  const errada = montarMedicao({ contratos, linhas: linhas.map((l) => (l.SEQCVS === "2" ? { ...l, VLRFAT: "100" } : l)), itens, pedidos, rateios });
  assert.equal(errada.resumo.totalLinhasQueNaoBatem, 1);
  assert.equal(errada.resumo.linhasQueNaoBatem[0].seqCvs, 2);
});

// ---------------------------------------------------------------- detalhe
const montado = montarMedicao({ contratos, linhas, itens, pedidos, rateios });
const L = montado.linhas.filter((l) => l.numCtr === "7");
const I = montado.itens.filter((i) => i.numCtr === "7");

test("detalhe: saldo, medido por mes, antes do periodo e acumulado", () => {
  const d = montarDetalhe(L, I, "2026-02", "2026-04", "2026-10");
  const l2 = d.linhas.find((l) => l.seqCvs === 2)!;
  assert.equal(l2.antes.valor, 18000.14); // janeiro fica antes do periodo
  assert.equal(l2.porMes["2026-02"].valor, 18000.14);
  assert.equal(l2.porMes["2026-03"].valor, 18000.14);
  assert.equal(l2.saldoQtd, 77);
  assert.equal(Math.round(l2.saldoValor * 100), Math.round((1440011.2 - 54000.42) * 100));
  const t = d.totais;
  assert.equal(t.medido, 54000.42);
  assert.equal(t.contratado, 1440011.2 + 174138.48);
  assert.equal(Math.round((t.contratado - t.medido) * 100), Math.round(t.saldo * 100));
  // acumulado: antes + meses
  assert.equal(t.porMes[0].acumuladoValor, 36000.28); // janeiro + fevereiro
  assert.equal(t.porMes[2].acumuladoValor, 54000.42);
});

test("detalhe: contratado - antes - periodo - depois = saldo (a conta fecha)", () => {
  const d = montarDetalhe(L, I, "2026-02", "2026-02", "2026-10");
  const noPeriodo = d.totais.porMes.reduce((s, m) => s + m.valor, 0);
  assert.equal(Math.round((d.totais.contratado - d.totais.antes - noPeriodo - d.totais.depois - d.totais.saldo) * 100), 0);
});

test("detalhe: detalhe de uma celula (linha x mes) lista os pedidos com o boletim", () => {
  const d = montarDetalhe(L, I, "2026-01", "2026-04", "2026-10", { seqCvs: 2, mes: "2026-01" });
  assert.equal(d.drill!.qtdItens, 1);
  assert.equal(d.drill!.itens[0].numPed, "384");
  assert.equal(d.drill!.itens[0].boletim, "BM35");
  assert.equal(d.drill!.itens[0].linha, "SUPERVISOR");
  assert.equal(d.drill!.total.valor, 18000.14);
  assert.equal(montarDetalhe(L, I, "2026-02", "2026-04", "2026-10", { mes: "antes" }).drill!.itens.length, 1);
});

test("detalhe: alerta de mes com medicao muito abaixo da media (provavel medicao nao lancada)", () => {
  const fx = (mes: string, valor: number) => ({ seqCvs: 2, numPed: mes, seqIsp: 1, dataEmissao: `${mes}-10`, competencia: mes, origem: "BOLETIM", boletim: "BM1", pedCli: null, situacao: "1", qtd: 1, valor, codccu: "230" });
  const itens2 = [fx("2026-01", 100000), fx("2026-02", 100000), fx("2026-03", 100000), fx("2026-04", 17), fx("2026-05", 100000)];
  const d = montarDetalhe(L, itens2, "2026-01", "2026-05", "2026-10");
  assert.deepEqual(d.alertas.map((a) => a.mes), ["2026-04"]);
  // o mes atual ainda esta em andamento: nunca gera alerta
  assert.equal(montarDetalhe(L, itens2, "2026-01", "2026-05", "2026-04").alertas.length, 0);
});

test("meses entre dois meses", () => {
  assert.deepEqual(mesesDe("2026-11", "2027-01"), ["2026-11", "2026-12", "2027-01"]);
  assert.equal(mesesDe("2020-01", "2030-01").length, 48);
});
