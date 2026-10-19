import { test } from "node:test";
import assert from "node:assert/strict";
import { montarMensal, prepararItens } from "../src/lib/contratos/previsaoMensal";
import { chaveDaDim, montarPlanilha, rotuloDoFornecedor } from "../src/lib/contratos/previsaoPlanilha";
import type { TituloPrevisao } from "../src/lib/contratos/previsao";

const base: TituloPrevisao & { ccu: string | null } = { numTit: "1", tipo: "NFS", fornecedorNome: "FORN A", descricao: null, numOcp: null, numNfc: null, vencimento: "2026-11-10", valorAberto: 100, ccu: "10", ctaFin: "5", codFor: "9" };
const it = (o: Partial<typeof base>) => ({ ...base, ...o });
const itens = prepararItens([
  it({ numTit: "A", vencimento: "2026-10-05", valorAberto: 100 }),
  it({ numTit: "B", vencimento: "2026-11-10", valorAberto: 200, fornecedorNome: "FORN B", codFor: "8" }),
  it({ numTit: "C", vencimento: "2026-11-20", valorAberto: 50, ctaFin: "6", ccu: "20" }),
  it({ numTit: "ALUGUEL_01", tipo: "PRV", fornecedorNome: "IMOB", vencimento: "2026-11-10", valorAberto: 1000, codFor: "7", ctaFin: "6" }),
  it({ numTit: "ALUGUEL_02", tipo: "PRV", fornecedorNome: "IMOB", vencimento: "2026-12-10", valorAberto: 1000, codFor: "7", ctaFin: "6" }),
  it({ numTit: "PRVDIV 11/26_13", tipo: "PRV", fornecedorNome: "FORNECEDORES DIVERSOS", vencimento: "2026-12-28", valorAberto: 500, codFor: "3", ctaFin: "6" }),
  it({ numTit: "D", vencimento: "2026-08-01", valorAberto: 40 }), // antes do periodo
  it({ numTit: "E", vencimento: "2027-05-01", valorAberto: 70 }), // depois
  it({ numTit: "OC 10", tipo: "OC", vencimento: "", valorAberto: 25, numOcp: "10" }), // sem data
]);
const f = { de: "2026-10", ate: "2027-01" };
const nomes = { ccu: (c: string) => `CC ${c}`, conta: (c: string) => `Conta ${c}` };

test("planilha por linha de custo: valores por mes, total e faixas", () => {
  const p = montarPlanilha(itens, f, "conta", nomes);
  const l5 = p.linhas.find((l) => l.chave === "5")!;
  assert.equal(l5.porMes["2026-10"], 100);
  assert.equal(l5.porMes["2026-11"], 200);
  assert.equal(l5.total, 300);
  assert.equal(l5.antes, 40);
  assert.equal(l5.depois, 70);
  assert.equal(l5.rotulo, "Conta 5");
  const l6 = p.linhas.find((l) => l.chave === "6")!;
  assert.equal(l6.previsto, 2500);
  assert.equal(l6.programado, 50);
  assert.deepEqual(p.meses, ["2026-10", "2026-11", "2026-12", "2027-01"]);
});

test("planilha: o total geral bate com a tabela mes a mes e nada some", () => {
  const p = montarPlanilha(itens, f, "conta", nomes);
  const r = montarMensal(itens, f);
  assert.equal(p.totais.total, r.totais.total);
  assert.equal(p.totais.antes, r.antes.total);
  assert.equal(p.totais.depois, r.depois.total);
  assert.equal(p.totais.semData, r.semData.total);
  for (const m of p.meses) assert.equal(p.totais.porMes[m] ?? 0, r.meses.find((x) => x.mes === m)!.total);
  assert.equal(Math.round(p.linhas.reduce((s, l) => s + l.total, 0) * 100), Math.round(p.totais.total * 100)); // soma das linhas = total
});

test("cada linha abre nos fornecedores e a soma dos filhos fecha com a linha", () => {
  const p = montarPlanilha(itens, f, "conta", nomes);
  for (const l of p.linhas) {
    assert.ok(l.filhos && l.filhos.length > 0);
    assert.equal(Math.round(l.filhos!.reduce((s, c) => s + c.total, 0) * 100), Math.round(l.total * 100));
    assert.equal(Math.round(l.filhos!.reduce((s, c) => s + c.semData + c.antes + c.depois, 0) * 100), Math.round((l.semData + l.antes + l.depois) * 100));
  }
  const l6 = p.linhas.find((l) => l.chave === "6")!;
  assert.deepEqual(l6.filhos!.map((c) => c.rotulo).sort(), ["FORN A", "IMOB", "PRVDIV (FORNECEDORES DIVERSOS)"]);
  assert.equal(l6.filhos!.find((c) => c.rotulo === "IMOB")!.tipoValor, "FIXO");
});

test("agrupar por outras dimensoes e fornecedor diversos pela serie", () => {
  assert.deepEqual(montarPlanilha(itens, f, "ccu", nomes).linhas.map((l) => l.chave).sort(), ["10", "20"]);
  assert.ok(montarPlanilha(itens, f, "categoria", nomes).linhas.some((l) => l.chave === "RECORRENTE"));
  const pf = montarPlanilha(itens, f, "fornecedor", nomes);
  assert.equal(pf.filhoDim, "conta"); // quando a linha e' o fornecedor, o filho e' a linha de custo
  assert.ok(pf.linhas.some((l) => l.rotulo === "PRVDIV (FORNECEDORES DIVERSOS)"));
  assert.equal(rotuloDoFornecedor({ fornecedorNome: "COPASA", numTit: "COPASA_05", tipo: "PRV", codFor: "1" }), "COPASA");
});

test("os filtros valem para a planilha e linhas demais sao agrupadas", () => {
  assert.equal(montarPlanilha(itens, { ...f, natureza: "PREVISTO" }, "conta", nomes).totais.total, 2500);
  assert.equal(montarPlanilha(itens, { ...f, ccu: "20" }, "conta", nomes).totais.total, 50);
  const muitos = prepararItens(Array.from({ length: 6 }, (_, k) => it({ numTit: `N${k}`, ctaFin: String(100 + k), valorAberto: 10 + k })));
  const p = montarPlanilha(muitos, f, "conta", nomes, 3);
  assert.equal(p.linhas.length, 4);
  assert.equal(p.linhas[3].rotulo, "Demais (3 linhas)");
  assert.equal(p.truncadas, 3);
  assert.equal(Math.round(p.linhas.reduce((s, l) => s + l.total, 0) * 100), Math.round(p.totais.total * 100));
});

test("detalhe de uma celula: so' a linha e o mes escolhidos", () => {
  const celula = (i: (typeof itens)[number]) => chaveDaDim(i, "conta") === "6" && chaveDaDim(i, "fornecedor") === "IMOB";
  const r = montarMensal(itens, f, "2026-11", 1, 50, celula);
  assert.deepEqual(r.drill!.itens.map((i) => i.numTit), ["ALUGUEL_01"]);
  assert.equal(r.drill!.total, 1000);
});
