import { test } from "node:test";
import assert from "node:assert/strict";
import { consolidarFaturamento, normalizarPeriodoConsolidado, type ItemConsolidado } from "../src/lib/medicao/consolidado";
import type { DocConc } from "../src/lib/medicao/conciliacao";

const contrato = (numCtr: string, codccu: string | null) => ({ numCtr, codccu });
const item = (numCtr: string, numPed: string, competencia: string, valor: number): ItemConsolidado => ({
  numCtr, numPed, competencia, valor, qtd: 1, origem: "BOLETIM", boletim: null, situacao: "4", dataEmissao: "2026-10-01",
});
const doc = (numero: string, codccu: string, competencia: string, valor: number, extra: Partial<DocConc> = {}): DocConc => ({
  chave: `NF|1|A26|${numero}|${codccu}`, tipo: "NF", numero, filial: "1", serie: "A26", dataEmissao: "2026-10-01", valor, valorLiquido: valor, valorDoc: valor,
  codccu, competencia, origem: "EMISSAO", pedidos: null, situacao: "2", duplicadaDe: null, vencimento: null, dataPagamento: null, valorAberto: null, ...extra,
});
const base = { de: "2026-08", ate: "2026-10", hoje: "2026-10-25", ccusPermitidos: new Set(["230", "240"]) };

test("faturamento geral soma NF e ND; medido sem nota continua separado, sem entrar no faturamento", () => {
  const c = consolidarFaturamento({ ...base,
    contratos: [contrato("1", "230"), contrato("2", "240")],
    itens: [item("1", "10", "2026-08", 1000), item("2", "20", "2026-09", 400)],
    docs: [doc("100", "230", "2026-08", 1000, { pedidos: "10" }), doc("ND5", "230", "2026-09", 75, { tipo: "ND" })],
  });
  assert.deepEqual(c.meses.map((m) => [m.mes, m.faturado, m.medido, m.semNota, m.receita]), [
    ["2026-08", 1000, 1000, 0, 1000], ["2026-09", 75, 400, 400, 475], ["2026-10", 0, 0, 0, 0],
  ]);
  assert.deepEqual(c.totais, { faturado: 1075, nf: 1000, nd: 75, medido: 1400, semNota: 400, receita: 1475 });
  assert.equal(c.quantidadeCentros, 2);
  assert.equal(c.semFaturamento, false);
});

test("contratos no mesmo CCU entram juntos uma unica vez e notas duplicadas nao somam", () => {
  const c = consolidarFaturamento({ ...base,
    contratos: [contrato("1", "230"), contrato("2", "230")],
    itens: [item("1", "10", "2026-08", 100), item("2", "20", "2026-08", 200)],
    docs: [doc("100", "230", "2026-08", 300, { pedidos: "10,20" }), doc("101", "230", "2026-08", 300, { duplicadaDe: "100" })],
  });
  assert.equal(c.quantidadeCentros, 1);
  assert.equal(c.totais.faturado, 300);
  assert.equal(c.totais.medido, 300);
  assert.equal(c.totais.semNota, 0);
});

test("recorte respeita competencia realocada; nota fora do periodo pode faturar pedido dentro dele", () => {
  const entrada = {
    ...base, de: "2026-08", ate: "2026-08",
    contratos: [contrato("1", "230")],
    itens: [item("1", "10", "2026-08", 1500), item("1", "20", "2026-07", 700)],
    docs: [doc("100", "230", "2026-10", 1500), doc("101", "230", "2026-08", 700)],
  };
  const c = consolidarFaturamento(entrada);
  assert.deepEqual(c.meses, [{ mes: "2026-08", faturado: 1500, nf: 1500, nd: 0, medido: 1500, semNota: 0, receita: 1500 }]);
  assert.equal(c.totais.faturado, 1500); // os 700 passam para julho e nao ficam em agosto
  assert.equal(entrada.docs[0].competencia, "2026-10"); // conciliacao nao altera os dados de entrada
});

test("restricao por CCU exclui contrato e documento nao autorizado antes da conciliacao", () => {
  const c = consolidarFaturamento({ ...base, ccusPermitidos: new Set(["230"]),
    contratos: [contrato("1", "230"), contrato("2", "999"), contrato("3", null)],
    itens: [item("1", "10", "2026-08", 100), item("2", "20", "2026-08", 900), item("3", "30", "2026-08", 700)],
    docs: [doc("100", "230", "2026-08", 100), doc("SECRETO", "999", "2026-08", 900)],
  });
  assert.equal(c.quantidadeCentros, 1);
  assert.equal(c.totais.faturado, 100);
  assert.equal(c.totais.medido, 100);
  assert.doesNotMatch(JSON.stringify(c), /SECRETO|999/);
});

test("nenhum acesso ou dados mantem todo o periodo zerado sem sinalizar documentos fora do escopo", () => {
  const c = consolidarFaturamento({ ...base, ccusPermitidos: new Set(),
    contratos: [contrato("1", "230")], itens: [item("1", "10", "2026-08", 100)], docs: [doc("100", "230", "2026-08", 100)],
  });
  assert.equal(c.meses.length, 3);
  assert.ok(c.meses.every((m) => m.faturado === 0 && m.medido === 0 && m.receita === 0));
  assert.deepEqual(c.totais, { faturado: 0, nf: 0, nd: 0, medido: 0, semNota: 0, receita: 0 });
  assert.equal(c.quantidadeCentros, 0);
  assert.equal(c.semFaturamento, true);
  const vazio = consolidarFaturamento({ ...base, contratos: [], itens: [], docs: [] });
  assert.deepEqual(vazio, c);
});

test("cargas acumuladas nao entram nos meses e pagamento em outro mes nao gera faturamento novamente", () => {
  const c = consolidarFaturamento({ ...base,
    contratos: [contrato("1", "230")],
    itens: [item("1", "0", "0000-00", 10000), item("1", "10", "2026-08", 100)],
    docs: [doc("0", "230", "0000-00", 10000, { origem: "ACUMULADO" }), doc("100", "230", "2026-08", 100, { pedidos: "10", valorAberto: 0, dataPagamento: "2026-10-15" })],
  });
  assert.equal(c.totais.faturado, 100);
  assert.equal(c.totais.medido, 100);
  assert.equal(c.meses[2].faturado, 0);
});

test("periodo usa ultimos 12 meses, normaliza invertido e limita intervalo a 48 meses", () => {
  assert.deepEqual(normalizarPeriodoConsolidado(null, null, "2026-10"), { de: "2025-11", ate: "2026-10" });
  assert.deepEqual(normalizarPeriodoConsolidado("2026-10", "2026-08", "2026-10"), { de: "2026-08", ate: "2026-10" });
  assert.deepEqual(normalizarPeriodoConsolidado("2020-01", "2026-10", "2026-10"), { de: "2022-11", ate: "2026-10" });
  assert.deepEqual(normalizarPeriodoConsolidado("2026-13", "invalido", "2026-10"), { de: "2025-11", ate: "2026-10" });
  assert.deepEqual(normalizarPeriodoConsolidado(null, "2027-08", "2026-10"), { de: "2025-11", ate: "2026-10" });
  assert.deepEqual(normalizarPeriodoConsolidado("2027-01", "2027-08", "2026-10"), { de: "2026-10", ate: "2026-10" });
  assert.deepEqual(normalizarPeriodoConsolidado("2027-01", "2026-08", "2026-10"), { de: "2026-08", ate: "2026-10" });
});
