import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriaDoTitulo, chaveDaSerie, montarPrevisao, somaMeses, tiposDeValorDasSeries, type TituloPrevisao } from "../src/lib/contratos/previsao";

const base = { numTit: "1", tipo: "NF", fornecedorNome: "FORNECEDOR QUALQUER", descricao: null, numOcp: null, numNfc: null };
const t = (o: Partial<TituloPrevisao> & { vencimento: string; valorAberto: number }): TituloPrevisao => ({ ...base, ...o });

test("categoria: PRV e' recorrente, a nao ser que o texto indique veiculo ou TI", () => {
  assert.equal(categoriaDoTitulo({ ...base, tipo: "PRV", fornecedorNome: "ALUGUEL EXEMPLO" }), "RECORRENTE");
  assert.equal(categoriaDoTitulo({ ...base, tipo: "PRV", fornecedorNome: "LOCALIZA FROTAS" }), "VEICULO");
  assert.equal(categoriaDoTitulo({ ...base, tipo: "PRV", fornecedorNome: "DELL COMPUTADORES" }), "TI");
});

test("categoria: veiculo, TI, aquisicao e demais", () => {
  assert.equal(categoriaDoTitulo({ ...base, fornecedorNome: "LOCALIZA FLEET" }), "VEICULO");
  assert.equal(categoriaDoTitulo({ ...base, descricao: "Parcela 03/12 caminhonete Hilux" }), "VEICULO");
  assert.equal(categoriaDoTitulo({ ...base, descricao: "PARC 2/10 NOTEBOOK DELL" }), "TI");
  assert.equal(categoriaDoTitulo({ ...base, numOcp: "5521" }), "AQUISICAO");
  assert.equal(categoriaDoTitulo({ ...base, numNfc: "889" }), "AQUISICAO");
  assert.equal(categoriaDoTitulo({ ...base, numOcpVinculada: "7001" }), "AQUISICAO");
  assert.equal(categoriaDoTitulo({ ...base }), "DEMAIS");
});

test("categoria: nao classifica por palavra solta de outro sentido (monitoramento, servidor publico, financiamento)", () => {
  assert.equal(categoriaDoTitulo({ ...base, descricao: "Monitoramento ambiental mensal" }), "DEMAIS");
  assert.equal(categoriaDoTitulo({ ...base, descricao: "Taxa servidor publico" }), "DEMAIS");
  assert.equal(categoriaDoTitulo({ ...base, descricao: "Financiamento de maquinas" }), "DEMAIS");
});

test("somaMeses vira o ano", () => {
  assert.equal(somaMeses("2026-11", 3), "2027-02");
  assert.equal(somaMeses("2026-01", 0), "2026-01");
});

test("montarPrevisao: vencidos, meses da janela, alem da janela, totais", () => {
  const r = montarPrevisao(
    [
      t({ tipo: "PRV", vencimento: "2026-10-25", valorAberto: 1000 }), // mes corrente
      t({ tipo: "PRV", vencimento: "2026-12-05", valorAberto: 1000 }),
      t({ tipo: "PRV", vencimento: "2026-10-01", valorAberto: 500 }), // vencido
      t({ numOcp: "9", vencimento: "2028-01-10", valorAberto: 300 }), // alem da janela de 12 meses
      t({ vencimento: "2026-11-30", valorAberto: 200 }),
    ],
    "2026-10-19"
  );
  assert.equal(r.meses.length, 12);
  assert.equal(r.meses[0], "2026-10");
  assert.equal(r.meses[11], "2027-09");
  const rec = r.grupos.find((g) => g.chave === "RECORRENTE")!;
  assert.equal(rec.total, 2500);
  assert.equal(rec.vencidos, 500);
  assert.equal(rec.porMes["2026-10"], 1000);
  assert.equal(rec.porMes["2026-12"], 1000);
  assert.equal(rec.quantidade, 3);
  assert.deepEqual(rec.titulos.map((x) => x.vencimento), ["2026-10-01", "2026-10-25", "2026-12-05"]);
  const aq = r.grupos.find((g) => g.chave === "AQUISICAO")!;
  assert.equal(aq.depois, 300);
  assert.equal(r.total, 3000);
  assert.equal(r.quantidade, 5);
});

test("montarPrevisao: o total de cada grupo = vencidos + meses + depois (nada some)", () => {
  const r = montarPrevisao([t({ vencimento: "2026-01-01", valorAberto: 10 }), t({ vencimento: "2026-10-19", valorAberto: 20 }), t({ vencimento: "2030-05-05", valorAberto: 30 })], "2026-10-19");
  for (const g of r.grupos) assert.equal(Math.round((g.vencidos + g.depois + Object.values(g.porMes).reduce((a, b) => a + b, 0)) * 100), Math.round(g.total * 100));
});

test("serie recorrente: valor fixo x variavel, pela tolerancia de 2%", () => {
  const prv = (num: string, valor: number, forn = "ALUGUEL EXEMPLO", cod = "5") => t({ tipo: "PRV", numTit: num, codFor: cod, fornecedorNome: forn, vencimento: "2026-11-10", valorAberto: valor });
  assert.equal(chaveDaSerie(prv("COPASA_05", 1)), "5|COPASA");
  assert.equal(chaveDaSerie(prv("COPASA_06", 1)), chaveDaSerie(prv("COPASA_05", 1)));
  const tipos = tiposDeValorDasSeries([prv("ALUGUEL_01", 1000), prv("ALUGUEL_02", 1010), prv("COPASA_01", 800, "COPASA", "7"), prv("COPASA_02", 1200, "COPASA", "7"), prv("SOZINHA_01", 50, "SOZINHA", "8")]);
  assert.equal(tipos.get("5|ALUGUEL"), "FIXO");
  assert.equal(tipos.get("7|COPASA"), "VARIAVEL");
  assert.equal(tipos.has("8|SOZINHA"), false); // uma previsao so': nao da para dizer se e' fixa
});

test("montarPrevisao: totais de recorrentes por tipo de valor somam o total do grupo", () => {
  const prv = (num: string, valor: number, forn: string, cod: string) => t({ tipo: "PRV", numTit: num, codFor: cod, fornecedorNome: forn, vencimento: "2026-11-10", valorAberto: valor });
  const r = montarPrevisao([prv("A_01", 100, "A", "1"), prv("A_02", 100, "A", "1"), prv("B_01", 10, "B", "2"), prv("B_02", 30, "B", "2"), prv("C_01", 7, "C", "3")], "2026-10-19");
  const g = r.grupos.find((x) => x.chave === "RECORRENTE")!;
  assert.deepEqual(g.porTipoValor, { FIXO: 200, VARIAVEL: 40, SEM_SERIE: 7 });
  assert.equal(g.porTipoValor.FIXO + g.porTipoValor.VARIAVEL + g.porTipoValor.SEM_SERIE, g.total);
  assert.equal(g.titulos.find((x) => x.numTit === "B_01")?.valorTipo, "VARIAVEL");
});

test("OC programada: categoria propria, e OC sem data de previsao cai em 'sem data' sem sumir do total", () => {
  assert.equal(categoriaDoTitulo({ ...base, tipo: "OC", fornecedorNome: "LOCALIZA FROTAS" }), "OC_PROGRAMADA"); // a OC manda mesmo que o texto cite veiculo
  const r = montarPrevisao([t({ tipo: "OC", vencimento: "2026-11-20", valorAberto: 500 }), t({ tipo: "OC", vencimento: "", valorAberto: 300 }), t({ tipo: "OC", vencimento: "2026-09-01", valorAberto: 100 })], "2026-10-19");
  const g = r.grupos.find((x) => x.chave === "OC_PROGRAMADA")!;
  assert.equal(g.total, 900);
  assert.equal(g.semData, 300);
  assert.equal(g.vencidos, 100);
  assert.equal(g.porMes["2026-11"], 500);
  assert.equal(Math.round((g.vencidos + g.depois + g.semData + Object.values(g.porMes).reduce((a, b) => a + b, 0)) * 100), 90000);
});
