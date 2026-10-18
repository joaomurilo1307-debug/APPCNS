import { test } from "node:test";
import assert from "node:assert/strict";
import { compararItensComDetalhe } from "../src/lib/custos/auditoria";

const item = (codccu: string, conta: string, mes: string, valor: number) => ({ codccu, contaFinanceira: conta, competencia: `${mes}-01`, valor });
const soma = (codccu: string, conta: string, mes: string, v: number) => ({ codccu, contaFinanceira: conta, competencia: `${mes}-01`, soma: v });

test("auditoria: celula igual a soma dos lancamentos nao diverge (tolerancia de 1 centavo)", () => {
  const r = compararItensComDetalhe([item("190", "Internet", "2026-01", 100.1), item("190", "Combustível", "2026-01", 50)], [soma("190", "Internet", "2026-01", 100.1), soma("190", "Combustível", "2026-01", 50.005)]);
  assert.equal(r.divergencias.length, 0);
});

test("auditoria: acusa celula sem lancamento, lancamento sem celula e valor diferente", () => {
  const r = compararItensComDetalhe(
    [item("190", "A", "2026-01", 10), item("190", "B", "2026-01", 20), item("270", "C", "2026-02", 5)],
    [soma("190", "A", "2026-01", 10), soma("190", "B", "2026-01", 19), soma("999", "Z", "2026-03", 7)]
  );
  assert.equal(r.celulasSemLancamento, 1);
  assert.equal(r.lancamentosSemCelula, 1);
  assert.equal(r.divergencias.length, 3);
  const b = r.divergencias.find((d) => d.contaFinanceira === "B")!;
  assert.deepEqual([b.celula, b.lancamentos, b.diferenca], [20, 19, 1]);
});
