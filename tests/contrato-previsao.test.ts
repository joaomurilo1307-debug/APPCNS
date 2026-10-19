import { test } from "node:test";
import assert from "node:assert/strict";
import { categoriaDoTitulo, montarPrevisao, somaMeses, type TituloPrevisao } from "../src/lib/contratos/previsao";

const base = { numTit: "1", tipo: "NF", fornecedorNome: "FORNECEDOR QUALQUER", descricao: null, numOcp: null, numNfc: null };
const t = (o: Partial<TituloPrevisao> & { vencimento: string; valorAberto: number }): TituloPrevisao => ({ ...base, ...o });

test("categoria: PRV e' sempre recorrente, mesmo que o texto cite veiculo", () => {
  assert.equal(categoriaDoTitulo({ ...base, tipo: "PRV", fornecedorNome: "LOCALIZA FROTAS" }), "RECORRENTE");
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
