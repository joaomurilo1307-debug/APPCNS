import { test } from "node:test";
import assert from "node:assert/strict";
import { montarMedicao, numero, valorDoItem } from "../src/lib/medicao/montagem";
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

// ---------------------------------------------------------------- consumo fisico x financeiro e conferencia com o Senior
const LA = { seqCvs: 1, descricao: "A", unidade: "HH", qtdContratada: 100, precoUnit: 10, valorContratado: 1000, qtdFaturada: 50, valorFaturado: 500 };
const LB = { seqCvs: 2, descricao: "B", unidade: "UN", qtdContratada: 10, precoUnit: 900, valorContratado: 9000, qtdFaturada: 10, valorFaturado: 4500 };
const it2 = (seq: number, mes: string, qtd: number, valor: number, ped: string) => ({ seqCvs: seq, numPed: ped, seqIsp: 1, dataEmissao: `${mes}-10`, competencia: mes, origem: "BOLETIM", boletim: "BM1", pedCli: null, situacao: "1", qtd, valor, codccu: "230" });
const ITS = [it2(1, "2026-01", 25, 250, "1"), it2(1, "2026-02", 25, 250, "2"), it2(2, "2026-02", 10, 4500, "3")];

test("consumo: financeiro (valor) e fisico (quantidade ponderada pelo valor contratado)", () => {
  const d = montarDetalhe([LA, LB], ITS, "2026-01", "2026-02", "2026-10");
  assert.equal(d.consumo.financeiroPct, 0.5); // (500 + 4500) / 10000
  assert.equal(d.consumo.fisicoPct, 0.95); // (50% x 1000 + 100% x 9000) / 10000
  assert.equal(d.consumo.linhasEsgotadas, 1); // B consumiu toda a quantidade
  assert.equal(d.consumo.linhasComDivergencia, 1); // B: 100% da quantidade, 50% do valor
  const b = d.linhas.find((l) => l.seqCvs === 2)!;
  assert.equal(b.pctQtd, 1);
  assert.equal(b.pctValor, 0.5);
  assert.equal(Math.round(b.divergenciaPp!), 50);
  assert.equal(d.linhas.find((l) => l.seqCvs === 1)!.divergenciaPp, 0);
});

test("consumo: cada linha conta no maximo 100% no fisico (linha medida alem do contratado)", () => {
  const acima = { ...LB, qtdFaturada: 30 }; // 300% da quantidade
  const d = montarDetalhe([LA, acima], ITS, "2026-01", "2026-02", "2026-10");
  assert.equal(d.consumo.fisicoPct, 0.95);
  assert.equal(d.consumo.linhasAcima100, 1);
});

test("avanco acumulado mes a mes, fisico e financeiro", () => {
  const d = montarDetalhe([LA, LB], ITS, "2026-01", "2026-02", "2026-10");
  assert.equal(d.totais.porMes[0].acumuladoFisicoPct, 0.025); // janeiro: 25% da linha A (peso 1000/10000)
  assert.equal(d.totais.porMes[0].acumuladoPct, 0.025); // 250 / 10000
  assert.equal(d.totais.porMes[1].acumuladoFisicoPct, 0.95);
  assert.equal(d.totais.porMes[1].acumuladoPct, 0.5);
});

test("conferencia: a soma dos pedidos fecha (ou nao) com o faturado do Senior, linha a linha", () => {
  const ok = montarDetalhe([LA, LB], ITS, "2026-01", "2026-02", "2026-10");
  assert.deepEqual(ok.conferencia, { linhas: 2, conferem: 2, naoConferem: 0, difValorAbsoluta: 0 });
  const dif = montarDetalhe([{ ...LA, valorFaturado: 600 }, LB], ITS, "2026-01", "2026-02", "2026-10");
  assert.equal(dif.conferencia.naoConferem, 1);
  assert.equal(dif.conferencia.difValorAbsoluta, 100);
  const a = dif.linhas.find((l) => l.seqCvs === 1)!;
  assert.equal(a.confere, false);
  assert.equal(a.difValor, 100); // Senior 600 - pedidos 500
  assert.equal(a.saldoValor, 400); // o saldo segue o Senior
});

// ---------------------------------------------------------------- valor do item conforme a situacao (dados reais do Senior, 19/10/2026)
const item = (o: Record<string, string>) => ({ CODFIL: "1", NUMPED: "1", SEQISP: "1", CTRCVS: "7", SEQCTR: "2", PEDCLI: "", ...o });

test("valor do item: aberto e encerrado usam o VLRBRU do Senior", () => {
  const a = valorDoItem(item({ SITISP: "1", QTDPED: "57,04687", QTDCAN: "0", PREUNI: "107,88", VLRBRU: "6154,22" }));
  assert.equal(a.valor, 6154.22);
  assert.equal(a.calculado, false);
  assert.equal(a.situacao, "ABERTO");
  assert.equal(valorDoItem(item({ SITISP: "9", QTDPED: "1", QTDCAN: "0", PREUNI: "5376,05", VLRBRU: "5376,05" })).situacao, "ENCERRADO");
});

test("valor do item: faturado tem VLRBRU zerado no Senior -> quantidade x preco (fecha com a NF 123 = 145.500,49)", () => {
  // itens reais do pedido 237 (SVPM CT 072/2024, boletim 15 de 08/2025), todos SITISP 4 e VLRBRU 0
  const reais = [["2", "14052,35"], ["1", "26116,85"], ["2", "6944,5683333333"], ["2", "21348,37020833"], ["0,967", "23144,21833"], ["2", "1053,67875"], ["2", "2608,00770833"], ["1", "4989,22"]];
  const total = reais.reduce((s, [q, p]) => { const v = valorDoItem(item({ SITISP: "4", QTDPED: q, QTDCAN: "0", PREUNI: p, VLRBRU: "0" })); assert.equal(v.calculado, true); return s + v.valor; }, 0);
  assert.equal(Math.round(total * 100) / 100, 145500.49);
});

test("valor do item: estornado (NF cancelada, item reaberto) nao usa o VLRBRU em dobro", () => {
  const v = valorDoItem(item({ SITISP: "8", QTDPED: "0,5", QTDCAN: "0", PREUNI: "38993,30594", VLRBRU: "38993,31" }));
  assert.equal(v.valor, 19496.65);
  assert.equal(v.situacao, "ESTORNADO");
});

test("valor do item: cancelado nao e' medicao; item aberto sem VLRBRU cai em quantidade x preco; sem SITISP vale o VLRBRU", () => {
  const c = valorDoItem(item({ SITISP: "5", QTDPED: "2", QTDCAN: "2", PREUNI: "14052,35", VLRBRU: "0" }));
  assert.equal(c.cancelado, true);
  assert.equal(c.valor, 0);
  assert.equal(valorDoItem(item({ SITISP: "1", QTDPED: "2", QTDCAN: "0", PREUNI: "10", VLRBRU: "0" })).valor, 20);
  assert.equal(valorDoItem(item({ QTDPED: "1", VLRBRU: "18000,14" })).valor, 18000.14); // fixture antiga, sem SITISP
});

test("montagem: item faturado entra com valor, cancelado fica de fora e a linha confere com o Senior", () => {
  const itensF = [
    item({ NUMPED: "384", SITISP: "4", QTDPED: "2", QTDCAN: "0", PREUNI: "9000,07", VLRBRU: "0", PEDCLI: "BM35 01.2026" }),
    item({ NUMPED: "400", SITISP: "5", QTDPED: "1", QTDCAN: "1", PREUNI: "9000,07", VLRBRU: "0", PEDCLI: "BM36 02.2026" }),
    item({ NUMPED: "414", SITISP: "1", QTDPED: "1", QTDCAN: "0", PREUNI: "18000,14", VLRBRU: "18000,14", PEDCLI: "BM37 03.2026" }),
  ];
  const r = montarMedicao({ contratos, linhas: linhas.map((l) => (l.SEQCVS === "2" ? { ...l, QTDFAT: "3", VLRFAT: "36000,28" } : l)), itens: itensF, pedidos, rateios });
  assert.equal(r.resumo.itensCancelados, 1);
  assert.equal(r.resumo.itensComValorCalculado, 1);
  assert.equal(r.itens.length, 2);
  assert.equal(r.itens.find((i) => i.numPed === "384")!.valor, 18000.14);
  assert.equal(r.itens.find((i) => i.numPed === "384")!.situacao, "FATURADO");
  assert.equal(r.resumo.totalLinhasQueNaoBatem, 0);
});
