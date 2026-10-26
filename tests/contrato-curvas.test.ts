import { test } from "node:test";
import assert from "node:assert/strict";
import { periodoDasCurvas, serieDeCustoContrato } from "../src/lib/contratos/curvas";
import { contratosNaBase, type ContratoCusto } from "../src/lib/custos/agregacao";

const meses = ["2026-01", "2026-02", "2026-03"];
const contrato: ContratoCusto = {
  codccu: "230", contrato: "230 - Contrato", nome: "Contrato", teamId: null, teamName: null, projectName: null, totalGeral: 370, ultimaCompetencia: "2026-03",
  contas: [
    { contaFinanceira: "Materiais", codigo: 1, grupoCodigo: "materiais", grupoNome: "Materiais", reembolsavel: false, total: 300, meses: [{ competencia: "2026-01-01", valor: 100 }, { competencia: "2026-03-01", valor: 200 }], mesesCompetencia: [{ competencia: "2026-02-01", valor: 300 }] },
    { contaFinanceira: "Transporte reembolsável", codigo: 2, grupoCodigo: "transporte", grupoNome: "Transporte", reembolsavel: true, total: 70, meses: [{ competencia: "2026-01-01", valor: 20 }, { competencia: "2026-02-01", valor: 50 }], mesesCompetencia: [{ competencia: "2026-01-01", valor: 70 }] },
  ],
};

test("curva de custo mantém soma por mês, zeros sem lançamentos e filtros da aba de custos", () => {
  const f = { de: "2026-01", ate: "2026-03", tipo: "todos" as const, grupo: "todos" };
  assert.deepEqual(serieDeCustoContrato(contrato, f, meses), [120, 50, 200]);
  assert.deepEqual(serieDeCustoContrato(contrato, { ...f, tipo: "proprio" }, meses), [100, 0, 200]);
  assert.deepEqual(serieDeCustoContrato(contrato, { ...f, tipo: "reembolsavel" }, meses), [20, 50, 0]);
  assert.deepEqual(serieDeCustoContrato(contrato, { ...f, grupo: "transporte" }, meses), [20, 50, 0]);
  assert.deepEqual(serieDeCustoContrato(contrato, f, meses, "materiais"), [100, 0, 200]);
  assert.deepEqual(serieDeCustoContrato(contrato, f, ["2026-02"]), [50]);
});

test("curva usa a base de competência já existente sem alterar ou contar as duas bases juntas", () => {
  const original = JSON.stringify(contrato);
  const convertido = contratosNaBase([contrato], "competencia")[0];
  assert.deepEqual(serieDeCustoContrato(convertido, { de: "2026-01", ate: "2026-03", tipo: "todos", grupo: "todos" }, meses), [70, 300, 0]);
  assert.equal(JSON.stringify(contrato), original);
});

test("período comum limita futuro e 48 meses, preserva o recorte e respeita o início dos dados de custo", () => {
  assert.deepEqual(periodoDasCurvas("2025-11", "2026-10", "2026-10", meses), { de: "2026-01", ate: "2026-10" });
  assert.deepEqual(periodoDasCurvas("2025-01", "2025-10", "2026-10", meses), { de: "2026-01", ate: "2026-01" });
  assert.deepEqual(periodoDasCurvas("2026-09", "2027-01", "2026-10", meses), { de: "2026-09", ate: "2026-10" });
  assert.deepEqual(periodoDasCurvas("2026-08", "2026-10", "2026-10", meses), { de: "2026-08", ate: "2026-10" });
  assert.deepEqual(periodoDasCurvas("2020-01", "2026-10", "2026-10"), { de: "2022-11", ate: "2026-10" });
});

test("sem metadados de custo não reduz o período de receita de um usuário sem acesso a custos", () => {
  assert.deepEqual(periodoDasCurvas(null, null, "2026-10"), { de: "2025-11", ate: "2026-10" });
  assert.deepEqual(periodoDasCurvas("2026-07", "2026-09", "2026-10", []), { de: "2026-07", ate: "2026-09" });
});
