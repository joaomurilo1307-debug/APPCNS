import { test } from "node:test";
import assert from "node:assert/strict";
import { ANTES, DEPOIS, SEM_DATA, SEM_LINHA, mesesEntre, montarMensal, prepararItens } from "../src/lib/contratos/previsaoMensal";
import type { TituloPrevisao } from "../src/lib/contratos/previsao";

const base: TituloPrevisao & { ccu: string | null } = { numTit: "1", tipo: "NFS", fornecedorNome: "FORN", descricao: null, numOcp: null, numNfc: null, vencimento: "2026-11-10", valorAberto: 100, ccu: "10", ctaFin: "5", codFor: "9" };
const it = (o: Partial<typeof base>) => ({ ...base, ...o });

const itens = prepararItens([
  it({ numTit: "A", vencimento: "2026-10-05", valorAberto: 100 }), // mes corrente
  it({ numTit: "B", vencimento: "2026-11-10", valorAberto: 200 }),
  it({ numTit: "C", vencimento: "2026-11-20", valorAberto: 50, ctaFin: "6", ccu: "20" }),
  it({ numTit: "ALUGUEL_01", tipo: "PRV", fornecedorNome: "IMOB", vencimento: "2026-11-10", valorAberto: 1000, codFor: "7" }),
  it({ numTit: "ALUGUEL_02", tipo: "PRV", fornecedorNome: "IMOB", vencimento: "2026-12-10", valorAberto: 1000, codFor: "7" }),
  it({ numTit: "OC 9", tipo: "OC", vencimento: "2026-12-15", valorAberto: 300, numOcp: "9", ccu: "20" }),
  it({ numTit: "D", vencimento: "2026-08-01", valorAberto: 40 }), // antes do periodo
  it({ numTit: "E", vencimento: "2027-05-01", valorAberto: 70 }), // depois do periodo
  it({ numTit: "OC 10", tipo: "OC", vencimento: "", valorAberto: 25, numOcp: "10" }), // sem data
]);
const periodo = { de: "2026-10", ate: "2027-01" };

test("meses entre dois meses (inclusive) e limite", () => {
  assert.deepEqual(mesesEntre("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.equal(mesesEntre("2020-01", "2030-01").length, 36);
});

test("mes a mes: programado, previsto e total por mes", () => {
  const r = montarMensal(itens, periodo);
  assert.deepEqual(r.meses.map((m) => m.mes), ["2026-10", "2026-11", "2026-12", "2027-01"]);
  const nov = r.meses[1];
  assert.equal(nov.programado, 250);
  assert.equal(nov.previsto, 1000);
  assert.equal(nov.total, 1250);
  assert.equal(nov.qtd, 3);
  assert.equal(r.meses[2].total, 1300); // PRV 1000 + OC 300
  assert.equal(r.meses[3].total, 0);
});

test("variacao de um mes para o outro (valor e percentual)", () => {
  const r = montarMensal(itens, periodo);
  assert.equal(r.meses[0].variacao, null);
  assert.deepEqual(r.meses[1].variacao, { valor: 1150, pct: 11.5 }); // 100 -> 1250
  assert.deepEqual(r.meses[2].variacao, { valor: 50, pct: 0.04 });
  assert.deepEqual(r.meses[3].variacao, { valor: -1300, pct: -1 });
});

test("antes, depois e sem data ficam fora dos meses, mas contados", () => {
  const r = montarMensal(itens, periodo);
  assert.equal(r.antes.total, 40);
  assert.equal(r.depois.total, 70);
  assert.equal(r.semData.total, 25);
  assert.equal(r.totais.total, 100 + 1250 + 1300);
  assert.equal(r.totais.mediaMensal, (100 + 1250 + 1300) / 4);
  assert.deepEqual(r.totais.maiorMes, { mes: "2026-12", total: 1300 });
});

test("nada some: meses + antes + depois + sem data = tudo", () => {
  const r = montarMensal(itens, periodo);
  const soma = r.meses.reduce((s, m) => s + m.total, 0) + r.antes.total + r.depois.total + r.semData.total;
  assert.equal(Math.round(soma * 100), Math.round(itens.reduce((s, i) => s + i.valorAberto, 0) * 100));
});

test("filtros: centro de custo, linha de custo, categoria e natureza", () => {
  assert.equal(montarMensal(itens, { ...periodo, ccu: "20" }).totais.total, 350);
  assert.equal(montarMensal(itens, { ...periodo, conta: "6" }).totais.total, 50);
  assert.equal(montarMensal(itens, { ...periodo, natureza: "PREVISTO" }).totais.total, 2000);
  assert.equal(montarMensal(itens, { ...periodo, categoria: "OC_PROGRAMADA" }).totais.total, 300);
  assert.equal(montarMensal(itens, { ...periodo, q: "imob" }).totais.total, 2000);
  assert.equal(montarMensal(itens, { ...periodo, conta: SEM_LINHA }).totais.total, 0); // todos tem linha de custo
});

test("opcoes dos filtros ignoram o proprio filtro", () => {
  const r = montarMensal(itens, { ...periodo, ccu: "20" });
  assert.deepEqual(r.centros.map((c) => c.ccu).sort(), ["10", "20"]); // escolher um CC nao some com os outros
  assert.ok(r.linhasDeCusto.every((l) => ["6", "5"].includes(l.cod)) === true);
  const c = montarMensal(itens, { ...periodo, categoria: "OC_PROGRAMADA" });
  assert.ok(c.categorias.find((x) => x.chave === "RECORRENTE")!.n > 0); // idem para categorias
});

test("detalhe de um mes: itens, subtotais e paginacao", () => {
  const r = montarMensal(itens, periodo, "2026-11", 1, 2);
  assert.ok(r.drill);
  assert.equal(r.drill!.total, 1250);
  assert.equal(r.drill!.programado, 250);
  assert.equal(r.drill!.previsto, 1000);
  assert.equal(r.drill!.qtd, 3);
  assert.equal(r.drill!.paginas, 2);
  assert.equal(r.drill!.itens.length, 2);
  assert.deepEqual(r.drill!.itens.map((i) => i.vencimento), ["2026-11-10", "2026-11-10"]);
  assert.equal(montarMensal(itens, periodo, "2026-11", 2, 2).drill!.itens.length, 1);
});

test("detalhe das faixas antes, depois e sem data", () => {
  assert.deepEqual(montarMensal(itens, periodo, ANTES).drill!.itens.map((i) => i.numTit), ["D"]);
  assert.deepEqual(montarMensal(itens, periodo, DEPOIS).drill!.itens.map((i) => i.numTit), ["E"]);
  assert.deepEqual(montarMensal(itens, periodo, SEM_DATA).drill!.itens.map((i) => i.numTit), ["OC 10"]);
});

test("natureza: PRV e' previsto; o resto (titulo e OC) e' programado; recorrente fixo x variavel", () => {
  assert.equal(itens.find((i) => i.numTit === "ALUGUEL_01")!.natureza, "PREVISTO");
  assert.equal(itens.find((i) => i.numTit === "OC 9")!.natureza, "PROGRAMADO");
  assert.equal(itens.find((i) => i.numTit === "B")!.natureza, "PROGRAMADO");
  assert.equal(itens.find((i) => i.numTit === "ALUGUEL_01")!.valorTipo, "FIXO");
});
