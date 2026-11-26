// Conferencia de OC: quando a OC ja' virou titulo na Senior (src/lib/conferenciaOc/titulosDaOc.ts). Casos reais de 23/11/2026.
import { test } from "node:test";
import assert from "node:assert/strict";
import { apurarTitulosDasOcs, chaveOc, type OcParaTitulo, type TituloSenior } from "../src/lib/conferenciaOc/titulosDaOc";
import { consolidarRateio, itensDasTabelas, valoresDoRateioZerado } from "../src/lib/senior/aprovacaoOc";

const oc = (o: Partial<OcParaTitulo> & Pick<OcParaTitulo, "numOcp" | "codFor">): OcParaTitulo => ({
  codFil: "1",
  numTitSenior: null,
  numNfc: null,
  vencimento: "2026-11-23",
  valor: 100,
  ...o,
});
const tit = (t: Partial<TituloSenior> & Pick<TituloSenior, "numTit" | "codFor">): TituloSenior => ({
  codFil: "1",
  codTpt: "NFS",
  situacao: "AB",
  valor: 100,
  aberto: 100,
  vencimento: "2026-11-23",
  numNfc: null,
  numOcp: null,
  ...t,
});
const vazio = { titulos: [] as TituloSenior[], nfs: [], manuais: [], gerados: [] };
const apurar = (ocs: OcParaTitulo[], d: Partial<Parameters<typeof apurarTitulosDasOcs>[1]>) => apurarTitulosDasOcs(ocs, { ...vazio, ...d });

test("OC 16710: a NF de compra 525 tem a OC nos itens e gerou o titulo 525A1 -> ja' tem titulo", () => {
  const o = oc({ numOcp: "16710", codFor: "713616" });
  const r = apurar([o], {
    nfs: [{ codFil: "1", codFor: "713616", numNfc: "525", numOcp: "16710" }],
    titulos: [tit({ numTit: "525A1", codFor: "713616", numNfc: "525" }), tit({ numTit: "527A1", codFor: "713616", numNfc: "527", valor: 150 })],
  }).get(chaveOc(o))!;
  assert.deepEqual(r.titulos.map((t) => [t.numTit, t.origem]), [["525A1", "NF"]]);
  assert.equal(r.provavel, null);
});

test("OC 16778: digitado 4270A1, lancado em outro fornecedor do MESMO grupo e com USU_NUMOCP -> ja' tem titulo", () => {
  const o = oc({ numOcp: "16778", codFor: "711334", numTitSenior: "4270A1", numNfc: "4270", valor: 435.6 });
  const grupos = new Map([["711334", "5"], ["711673", "5"]]);
  const t4270 = tit({ numTit: "4270A1", codFor: "711673", numNfc: "4270", numOcp: "16778", valor: 415.34 });
  const r = apurar([o], { titulos: [t4270], grupos }).get(chaveOc(o))!;
  assert.deepEqual(r.titulos.map((t) => [t.numTit, t.origem]), [["4270A1", "CAMPO_DO_TITULO"]]);
  assert.equal(r.digitadoInexistente, false);
  // sem o USU_NUMOCP, o numero digitado acha o titulo no outro fornecedor do grupo
  const s = apurar([o], { titulos: [{ ...t4270, numOcp: null }], grupos }).get(chaveOc(o))!;
  assert.deepEqual(s.titulos.map((t) => t.origem), ["DIGITADO"]);
  // fora do grupo: nao acha (e acusa o numero digitado como inexistente)
  const n = apurar([o], { titulos: [{ ...t4270, numOcp: null }] }).get(chaveOc(o))!;
  assert.equal(n.titulos.length, 0);
  assert.equal(n.digitadoInexistente, true);
});

test("titulo cancelado nao conta; USU_NUMOCP de fornecedor de outro grupo nao conta", () => {
  const o = oc({ numOcp: "1", codFor: "10", numTitSenior: "77" });
  const r = apurar([o], { titulos: [tit({ numTit: "77", codFor: "10", situacao: "CA" }), tit({ numTit: "88", codFor: "20", numOcp: "1" })] }).get(chaveOc(o))!;
  assert.equal(r.titulos.length, 0);
  assert.equal(r.digitadoInexistente, true);
});

test("vinculo manual (Programacao de Pagamento) e titulo gerado aqui contam; manual para titulo inexistente nao", () => {
  const o = oc({ numOcp: "500", codFor: "9" });
  const manual = apurar([o], { titulos: [tit({ numTit: "X1", codFor: "9" })], manuais: [{ numTit: "X1", codFil: "1", codFor: "9", numOcp: "500" }] }).get(chaveOc(o))!;
  assert.deepEqual(manual.titulos.map((t) => t.origem), ["MANUAL"]);
  const orfao = apurar([o], { manuais: [{ numTit: "SUMIU", codFil: "1", codFor: "9", numOcp: "500" }] }).get(chaveOc(o))!;
  assert.equal(orfao.titulos.length, 0);
  const gerado = apurar([o], { gerados: [{ numOcp: "500", codFil: "1", codFor: "9", numTit: "G1", codTpt: "OUT", valor: 100, vencimento: "2026-11-23" }] }).get(chaveOc(o))!;
  assert.deepEqual(gerado.titulos.map((t) => [t.numTit, t.origem]), [["G1", "GERADO_AQUI"]]);
});

test("OC 16652: titulo 16355A1 do mesmo fornecedor e vencimento, 2,5% abaixo (retencao), sem ligacao -> so' PROVAVEL", () => {
  const o = oc({ numOcp: "16652", codFor: "713612", vencimento: "2026-11-24", valor: 13145 });
  const r = apurar([o], {
    titulos: [
      tit({ numTit: "16355A1", codFor: "713612", vencimento: "2026-11-24", valor: 12816.38, aberto: 12816.38, numNfc: "16355" }),
      tit({ numTit: "7559A1", codFor: "713612", situacao: "LQ", aberto: 0, vencimento: "2026-05-23", valor: 12816.38 }),
    ],
  }).get(chaveOc(o))!;
  assert.equal(r.titulos.length, 0); // continua na tela: so' uma pessoa confirma
  assert.equal(r.provavel?.numTit, "16355A1");
});

test("provavel: nunca imposto/provisao, nunca titulo ja' ligado a outra OC, nunca quando dois candidatos ou duas OCs disputam", () => {
  const a = oc({ numOcp: "1", codFor: "9" });
  const b = oc({ numOcp: "2", codFor: "9" });
  const igual = (numTit: string, extra: Partial<TituloSenior> = {}) => tit({ numTit, codFor: "9", ...extra });
  assert.equal(apurar([a], { titulos: [igual("P1", { codTpt: "PRV" })] }).get(chaveOc(a))!.provavel, null);
  assert.equal(apurar([a], { titulos: [igual("T1", { numOcp: "999" })] }).get(chaveOc(a))!.provavel, null);
  assert.equal(apurar([a], { titulos: [igual("T1"), igual("T2")] }).get(chaveOc(a))!.provavel, null);
  const disputa = apurar([a, b], { titulos: [igual("T1")] });
  assert.equal(disputa.get(chaveOc(a))!.provavel, null);
  assert.equal(disputa.get(chaveOc(b))!.provavel, null);
  // valor fora da faixa (acima da OC ou abaixo de 80%) ou outro vencimento: nao e' provavel
  assert.equal(apurar([a], { titulos: [igual("T1", { valor: 101 })] }).get(chaveOc(a))!.provavel, null);
  assert.equal(apurar([a], { titulos: [igual("T1", { valor: 79 })] }).get(chaveOc(a))!.provavel, null);
  assert.equal(apurar([a], { titulos: [igual("T1", { vencimento: "2026-11-24" })] }).get(chaveOc(a))!.provavel, null);
  // NF digitada na OC = NUMNFC do titulo vale mesmo com outro vencimento
  const nf = oc({ numOcp: "3", codFor: "9", numNfc: "4455" });
  assert.equal(apurar([nf], { titulos: [igual("T9", { vencimento: "2026-12-30", valor: 50, numNfc: "4455" })] }).get(chaveOc(nf))!.provavel?.numTit, "T9");
});

test("rateio com VLRRAT zerado pela NF: valor de cada CC pelos percentuais do item (OC 16778)", () => {
  const linhas = [
    { SEQRAT: "1", SEQISO: "1", CODCCU: "170", PERRAT: "10,101", VLRRAT: "0" },
    { SEQRAT: "2", SEQISO: "1", CODCCU: "102285", PERRAT: "31,5657", VLRRAT: "0" },
    { SEQRAT: "3", SEQISO: "1", CODCCU: "102205", PERRAT: "58,3333", VLRRAT: "0" },
  ];
  const itens = itensDasTabelas([], [{ SEQISO: "1", QTDPED: "1", PREUNI: "435,6", VLRORI: "435,6", VLRLIQ: "0", VLRBRU: "0" }]);
  assert.equal(itens[0].total, 435.6);
  const valores = valoresDoRateioZerado(linhas, itens, 435.6);
  const ccus = consolidarRateio(linhas, valores);
  assert.deepEqual(ccus.map((c) => [c.codCcu, c.valor, c.percentual]), [["170", 44, 10.1], ["102285", 137.5, 31.57], ["102205", 254.1, 58.33]]);
  // com VLRRAT gravado vale o da Senior
  assert.equal(valoresDoRateioZerado([{ CODCCU: "1", PERRAT: "100", VLRRAT: "5" }], itens, 435.6), null);
});
