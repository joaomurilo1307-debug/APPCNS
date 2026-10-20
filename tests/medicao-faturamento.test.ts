import { test } from "node:test";
import assert from "node:assert/strict";
import { montarFaturamento } from "../src/lib/medicao/faturamento";
import { conciliar, type DocConc, type ItemConc } from "../src/lib/medicao/conciliacao";

// ---- dados reais do Senior (19/10/2026), formato do GetDBInfo: virgula decimal, datas dd/mm/aaaa
const notas = [
  { CODFIL: "1", CODSNF: "A25", NUMNFV: "68", DATEMI: "22/05/2025", CODCLI: "63", VLRBSE: "156243,25", SITNFV: "2" }, // SUDECAP, nasceu do pedido 140
  { CODFIL: "1", CODSNF: "A25", NUMNFV: "69", DATEMI: "22/05/2025", CODCLI: "63", VLRBSE: "26522,14", SITNFV: "2" }, // pedido 141
  { CODFIL: "2", CODSNF: "A24", NUMNFV: "266", DATEMI: "17/07/2026", CODCLI: "54", VLRBSE: "818045,02", SITNFV: "2" }, // MRN, filial 2, sem pedido
  { CODFIL: "2", CODSNF: "A24", NUMNFV: "261", DATEMI: "19/06/2026", CODCLI: "54", VLRBSE: "257623,65", SITNFV: "3" }, // cancelada e reemitida
  { CODFIL: "2", CODSNF: "A24", NUMNFV: "262", DATEMI: "03/07/2026", CODCLI: "54", VLRBSE: "257623,65", SITNFV: "2" }, // a substituta
  { CODFIL: "1", CODSNF: "A25", NUMNFV: "70", DATEMI: "01/06/2025", CODCLI: "63", VLRBSE: "0", SITNFV: "1" }, // rascunho sem valor
];
const itensNota = [
  { CODFIL: "1", CODSNF: "A25", NUMNFV: "68", NUMPED: "140", CODCCU: "", VLRBRU: "156243,25" },
  { CODFIL: "1", CODSNF: "A25", NUMNFV: "69", NUMPED: "141", CODCCU: "", VLRBRU: "26522,14" },
  { CODFIL: "2", CODSNF: "A24", NUMNFV: "266", NUMPED: "0", CODCCU: "230", VLRBRU: "818045,02" },
  { CODFIL: "2", CODSNF: "A24", NUMNFV: "262", NUMPED: "0", CODCCU: "190", VLRBRU: "257623,65" },
];
const titulos = [
  { NUMTIT: "68A1", CODFIL: "1", CODTPT: "NF", CODCLI: "63", SITTIT: "LQ", DATEMI: "22/05/2025", VLRORI: "144056,27", CODCCU: "370", FILNFV: "1", CODSNF: "A25", NUMNFV: "68" },
  { NUMTIT: "69A1", CODFIL: "1", CODTPT: "NF", CODCLI: "63", SITTIT: "LQ", DATEMI: "22/05/2025", VLRORI: "24453,42", CODCCU: "370", FILNFV: "1", CODSNF: "A25", NUMNFV: "69" },
  { NUMTIT: "ND31", CODFIL: "2", CODTPT: "ND", CODCLI: "54", SITTIT: "AB", DATEMI: "20/07/2026", VLRORI: "571996,93", CODCCU: "", FILNFV: "0", CODSNF: "", NUMNFV: "0" },
  { NUMTIT: "ND99", CODFIL: "2", CODTPT: "ND", CODCLI: "54", SITTIT: "CA", DATEMI: "20/07/2026", VLRORI: "1000", CODCCU: "230", FILNFV: "0", CODSNF: "", NUMNFV: "0" }, // cancelada
];
const rateios = [
  { NUMTIT: "68A1", CODFIL: "1", CODCCU: "370", PERRAT: "100", VLRRAT: "156243,25" },
  { NUMTIT: "69A1", CODFIL: "1", CODCCU: "370", PERRAT: "100", VLRRAT: "26522,14" },
  { NUMTIT: "ND31", CODFIL: "2", CODCCU: "230", PERRAT: "60", VLRRAT: "343198,16" },
  { NUMTIT: "ND31", CODFIL: "2", CODCCU: "240", PERRAT: "40", VLRRAT: "228798,77" },
];
// competencia dos pedidos 140 e 141 (boletim BM30 04.2025), como sai da montagem da medicao
const itensMedicao = [
  { numPed: "140", competencia: "2025-04", origem: "BOLETIM" as const, valor: 156243.25 },
  { numPed: "141", competencia: "2025-04", origem: "BOLETIM" as const, valor: 26522.14 },
];

test("faturamento: nota de pedido usa o mes do pedido; nota sem pedido usa a regra da emissao; centro de custo vem do rateio do titulo", () => {
  const docs = montarFaturamento({ notas, itensNota, titulos, rateios }, itensMedicao);
  const nf68 = docs.find((d) => d.numero === "68")!;
  assert.equal(nf68.valor, 156243.25);
  assert.equal(nf68.codccu, "370"); // o item da nota nao tem CCU: vale o rateio do titulo
  assert.equal(nf68.competencia, "2025-04");
  assert.equal(nf68.origem, "PEDIDO");
  assert.equal(nf68.pedidos, "140");
  const nf266 = docs.find((d) => d.numero === "266")!;
  assert.equal(nf266.codccu, "230"); // sem titulo: CCU do item da nota
  assert.equal(nf266.competencia, "2026-06"); // emitida em 17/07 -> emissao menos 1 mes
  assert.equal(nf266.origem, "EMISSAO");
});

test("faturamento: cancelada e reemitida conta uma vez, rascunho sem valor e ND cancelada ficam de fora", () => {
  const docs = montarFaturamento({ notas, itensNota, titulos, rateios }, itensMedicao);
  assert.equal(docs.filter((d) => d.tipo === "NF" && d.numero === "261").length, 0);
  assert.equal(docs.filter((d) => d.tipo === "NF" && d.numero === "262").length, 1);
  assert.equal(docs.filter((d) => d.numero === "70").length, 0);
  assert.equal(docs.filter((d) => d.numero === "ND99").length, 0);
});

test("faturamento: ND rateada em dois centros de custo reparte o valor sem perder centavo", () => {
  const docs = montarFaturamento({ notas, itensNota, titulos, rateios }, itensMedicao).filter((d) => d.tipo === "ND");
  assert.equal(docs.length, 2);
  assert.equal(Math.round(docs.reduce((s, d) => s + d.valor, 0) * 100), 57199693);
  assert.deepEqual(docs.map((d) => d.codccu).sort(), ["230", "240"]);
  assert.equal(docs[0].competencia, "2026-06");
});

// ---------------------------------------------------------------- conciliacao (o contrato vale pelos seus pedidos; as notas pelo CC principal)
const item = (numPed: string, competencia: string, valor: number, extra: Partial<ItemConc> = {}): ItemConc => ({ numPed, competencia, origem: "BOLETIM", boletim: "BM41", situacao: "ABERTO", qtd: 1, valor, dataEmissao: "2026-07-10", ...extra });
const doc = (numero: string, competencia: string, valor: number, extra: Partial<DocConc> = {}): DocConc => ({ chave: `NF|2|A24|${numero}|230`, tipo: "NF", numero, filial: "2", serie: "A24", dataEmissao: "2026-07-17", valor, valorLiquido: valor, valorDoc: valor, codccu: "230", competencia, origem: "EMISSAO", pedidos: null, situacao: "AUTORIZADA", ...extra });

test("receita do mes = medicao em NF + notas de debito; as linhas dos pedidos fecham com ela (MRN 3748, janeiro: pedido 386 = NF 243, pedido 387 = ND 09/2026)", () => {
  const itens = [item("386", "2026-01", 250769.62), item("387", "2026-01", 19308.64)];
  const docs = [doc("243", "2026-01", 250769.62), doc("ND 09/2026", "2026-01", 19308.64, { tipo: "ND", chave: "ND|2|09|230" })];
  const c = conciliar(itens, docs, [], "2026-01", "2026-01");
  const m = c.meses[0];
  assert.equal(m.nf, 250769.62);
  assert.equal(m.nd, 19308.64);
  assert.equal(m.faturado, 270078.26); // receita bruta
  assert.equal(m.medido, 270078.26); // soma das linhas dos pedidos
  assert.equal(m.dif, 0);
  assert.equal(m.ndAvulsa, 0); // a ND e' o pedido 387: nao soma duas vezes
  assert.deepEqual(c.pedidos.map((p) => p.documentos[0].tipo).sort(), ["ND", "NF"]);
});

test("receita bruta e liquida: a NF tem retencoes, a ND nao tem", () => {
  const itens = [item("481", "2026-06", 818045.02), item("482", "2026-06", 571996.93)];
  const docs = [doc("266", "2026-06", 818045.02, { valorLiquido: 726833 }), doc("ND 31/2026", "2026-06", 571996.93, { tipo: "ND", chave: "ND|2|31|230" })];
  const m = conciliar(itens, docs, [], "2026-06", "2026-06").meses[0];
  assert.equal(m.faturado, 1390041.95); // bruta
  assert.equal(m.retencoes, 91212.02); // so' da NF
  assert.equal(m.liquido, 1298829.93);
  assert.equal(m.dif, 0);
});

test("pedido dividido entre centros de custo no rateio do Senior nao e' problema: o contrato vale pelo pedido inteiro (pedido 308 = NF 227)", () => {
  // o item de R$ 10.088,24 esta rateado para o CC 240 no Senior, mas o pedido e' do contrato: 692.433,74 = NF 227
  const itens = [item("308", "2025-10", 682345.5), item("308", "2025-10", 10088.24)];
  const c = conciliar(itens, [doc("227", "2025-11", 692433.74)], [], "2025-10", "2025-11");
  assert.equal(c.docs[0].vinculo, "VALOR");
  assert.equal(c.docs[0].competencia, "2025-10"); // a nota volta para o mes do trabalho
  assert.equal(c.meses[0].dif, 0);
  assert.equal(c.totais.saldoAcum, 0);
});

test("mes que fecha, mes com pedido incompleto e saldo do periodo (MRN 3687, julho: nota de R$ 793 mil e pedido de R$ 17)", () => {
  const itens = [item("481", "2026-05", 800000), item("482", "2026-06", 818045.02), item("503", "2026-07", 17.08)];
  const docs = [doc("255", "2026-05", 800000), doc("266", "2026-06", 818045.02), doc("274", "2026-07", 793568.85)];
  const c = conciliar(itens, docs, [], "2026-05", "2026-07");
  assert.equal(c.inicio, "2026-05");
  assert.equal(c.meses[0].dif, 0);
  assert.equal(c.meses[1].dif, 0);
  assert.equal(c.meses[2].medido, 17.08);
  assert.equal(c.meses[2].faturado, 793568.85);
  assert.equal(c.meses[2].dif, -793551.77);
  assert.equal(c.totais.saldoAcum, -793551.77);
  assert.equal(c.totais.mesesComDiferenca, 1);
});

test("pedido recebe a nota pelo vinculo do Senior ou, sem ele, pelo mesmo valor ao centavo", () => {
  const itens = [item("481", "2026-06", 818045.02), item("140", "2026-04", 156243.25, { situacao: "FATURADO" }), item("999", "2026-06", 12.34)];
  const docs = [doc("266", "2026-06", 818045.02), doc("68", "2026-04", 156243.25, { chave: "NF|1|A25|68|230", pedidos: "140", origem: "PEDIDO" })];
  const c = conciliar(itens, docs, [], "2026-04", "2026-06");
  const p = (n: string) => c.pedidos.find((x) => x.numPed === n)!;
  assert.deepEqual({ n: p("140").documentos[0].numero, como: p("140").documentos[0].como }, { n: "68", como: "NOTA" });
  assert.deepEqual({ n: p("481").documentos[0].numero, como: p("481").documentos[0].como }, { n: "266", como: "VALOR" });
  assert.equal(p("999").documentos.length, 0); // ainda sem nota
  assert.equal(c.totais.pedidosSemNota, 1);
});

test("nota emitida meses depois, de mesmo valor, volta para o mes do pedido (faturamento em lote da SUDECAP)", () => {
  const itens = [item("367", "2025-10", 180405.84), item("368", "2025-11", 164018.7), item("369", "2025-12", 178516.05)];
  const docs = [doc("27", "2026-02", 180405.84), doc("28", "2026-02", 164018.7), doc("29", "2026-02", 178516.05)];
  const c = conciliar(itens, docs, [], "2025-10", "2026-02");
  assert.deepEqual(c.meses.map((m) => m.dif), [0, 0, 0, 0, 0]);
  assert.equal(c.totais.saldoAcum, 0);
  assert.equal(c.docs.find((d) => d.numero === "27")!.competenciaOriginal, "2026-02"); // o mes da emissao fica visivel
  assert.equal(c.docs.find((d) => d.numero === "27")!.competencia, "2025-10");
});

test("nota que e' a soma de dois pedidos do mes (e pedido que e' a soma de duas notas)", () => {
  const itens = [item("10", "2026-03", 1000), item("11", "2026-03", 234.56), item("12", "2026-04", 700)];
  const docs = [doc("1", "2026-04", 1234.56), doc("2", "2026-04", 300), doc("3", "2026-04", 400)];
  const c = conciliar(itens, docs, [], "2026-03", "2026-04");
  assert.equal(c.docs.find((d) => d.numero === "1")!.vinculo, "SOMA");
  assert.deepEqual(c.docs.find((d) => d.numero === "1")!.pedidosLigados.sort(), ["10", "11"]);
  assert.equal(c.pedidos.find((p) => p.numPed === "12")!.documentos.length, 2);
  assert.equal(c.totais.saldoAcum, 0);
});

test("pedido sem nota que tem nota do mesmo valor em OUTRO centro de custo recebe o aviso (nunca e' corrigido)", () => {
  const itens = [item("380", "2026-01", 229215.93)];
  const outro = [doc("16", "2026-01", 229215.93, { codccu: "170", chave: "NF|1|A26|16|170" })];
  const c = conciliar(itens, [], outro, "2026-01", "2026-01");
  assert.equal(c.pedidos[0].documentos.length, 0);
  assert.deepEqual(c.pedidos[0].possivelOutroCc && { cc: c.pedidos[0].possivelOutroCc.codccu, n: c.pedidos[0].possivelOutroCc.numero }, { cc: "170", n: "16" });
  assert.equal(c.meses[0].faturado, 0); // o valor continua onde o Senior o deixou
});

test("carga acumulada e nota de antes do primeiro pedido ficam fora do saldo e dos meses", () => {
  const itens = [item("231", "0000-00", 9353971.49, { origem: "ACUMULADO" }), item("482", "2026-06", 100)];
  const docs = [doc("100", "2019-03", 50000), doc("266", "2026-06", 100)];
  const c = conciliar(itens, docs, [], "2026-06", "2026-06");
  assert.equal(c.acumulados.medido, 9353971.49);
  assert.deepEqual(c.notasAntesDoInicio, { qtd: 1, valor: 50000 });
  assert.equal(c.meses.length, 1);
  assert.equal(c.meses[0].medido, 100);
  assert.equal(c.meses[0].faturado, 100);
  assert.equal(c.totais.saldoAcum, 0);
});

test("o saldo do periodo comeca em zero e o saldo desde o inicio da medicao vai a parte", () => {
  const itens = [item("1", "2026-01", 1000), item("2", "2026-03", 500)];
  const docs = [doc("10", "2026-04", 600)]; // janeiro nunca foi faturado; a nota de abril e' de outro pedido (sem pedido)
  const c = conciliar(itens, docs, [], "2026-03", "2026-04");
  assert.deepEqual(c.antes, { medido: 1000, receita: 1000, faturado: 0, saldoAcum: 1000 });
  assert.equal(c.meses[0].saldoAcum, 500); // so' o que aconteceu no periodo
  assert.equal(c.meses[0].saldoDesdeInicio, 1500);
  assert.equal(c.totais.saldoAcum, -100); // 500 - 600
  assert.equal(c.totais.saldoDesdeInicio, 900);
});

test("ND que nao e' pedido (avulsa) soma por cima das linhas; a ND que e' pedido nao soma de novo", () => {
  const itens = [item("481", "2026-06", 818045.02), item("482", "2026-06", 571996.93), item("503", "2026-07", 100000)];
  const docs = [
    doc("266", "2026-06", 818045.02),
    doc("ND 31", "2026-06", 571996.93, { tipo: "ND", chave: "ND|2|31|230" }),
    doc("274", "2026-07", 100000),
    doc("ND 40", "2026-07", 5000, { tipo: "ND", chave: "ND|2|40|230" }), // sem pedido
  ];
  const c = conciliar(itens, docs, [], "2026-06", "2026-07");
  assert.equal(c.meses[0].receita, 1390041.95);
  assert.equal(c.meses[0].ndAvulsa, 0);
  assert.equal(c.meses[0].dif, 0);
  assert.equal(c.meses[1].ndAvulsa, 5000);
  assert.equal(c.meses[1].receita, 105000); // pedido 100.000 + ND avulsa 5.000
  assert.equal(c.meses[1].faturado, 105000); // NF 100.000 + ND 5.000
  assert.equal(c.meses[1].dif, 0);
  assert.equal(c.totais.saldoAcum, 0);
});
