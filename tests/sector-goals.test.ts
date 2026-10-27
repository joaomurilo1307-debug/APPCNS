import test from "node:test";
import assert from "node:assert/strict";
import { calcularContribuicoesSetor, erroPesoSetor, validarVinculoSetor } from "../src/lib/contractGoals/sectorGoals";

test("peso80 compõe quarenta pontos com resultado50%; a parcela restante não é renormalizada", () => {
  const sector = calcularContribuicoesSetor([{ id: "epi", weight: 80, fraction: 0.5, executionFraction: 1 }]);
  assert.equal(sector.weightedFraction, 0.4);
  assert.equal(sector.knownFraction, 0.4);
  assert.equal(sector.configuredWeight, 80);
  assert.equal(sector.unconfiguredWeight, 20);
  assert.equal(sector.contributions[0].executionFraction, 1, "Terminar projeto não substitui o resultado medido");
});

test("pesos80/20 compõem resultados diferentes sem somar projetos que referenciam a mesma meta", () => {
  const sector = calcularContribuicoesSetor([{ id: "epi", weight: 80, fraction: 0.5 }, { id: "faltas", weight: 20, fraction: 1 }, { id: "epi", weight: 80, fraction: 0.5 }]);
  assert.equal(sector.contributionCount, 2);
  assert.equal(sector.configuredWeight, 100);
  assert.ok(Math.abs(sector.weightedFraction! - 0.6) < 1e-10);
  assert.equal(sector.unconfiguredWeight, 0);
});

test("fonte sem dado ou contribuição não visível mantém o resultado global pendente sem fabricar zero", () => {
  const hidden = calcularContribuicoesSetor([{ id: "propria", title: "Meta permitida", weight: 20, fraction: 1 }], [{ id: "propria", weight: 20 }, { id: "reservada", weight: 80 }]);
  assert.equal(hidden.weightedFraction, null);
  assert.equal(hidden.knownFraction, 0.2);
  assert.equal(hidden.unevaluatedWeight, 80);
  assert.equal(hidden.hiddenCount, 1);
  assert.deepEqual(hidden.contributions.map((c) => c.id), ["propria"]);
  const unavailable = calcularContribuicoesSetor([{ id: "financeira", weight: 80, fraction: null, executionFraction: 1 }]);
  assert.equal(unavailable.weightedFraction, null);
  assert.equal(unavailable.unevaluatedWeight, 80);
  assert.equal(unavailable.contributions[0].weightedFraction, null);
});

test("peso e soma são validados sem impedir arquivo histórico; zero não é vínculo válido", () => {
  assert.equal(erroPesoSetor("setor", 80, 20), null);
  assert.match(erroPesoSetor("setor", 80.01, 20)!, /100%/);
  assert.match(erroPesoSetor("setor", 0)!, /maior que zero/);
  assert.match(erroPesoSetor("setor", NaN)!, /peso/);
  assert.match(erroPesoSetor(undefined, 80)!, /Escolha/);
  assert.equal(erroPesoSetor("setor", 80, 100, "ARQUIVADA"), null);
  assert.equal(erroPesoSetor(null, null), null);
});

test("edição por cliente anterior não ignora peso já vinculado ao reativar uma meta", async () => {
  const tx = {
    contractGoal: {
      findUnique: async () => ({ parentGoalId: "setor", contributionWeight: 80, status: "ARQUIVADA", kind: "INDICADOR" }),
      aggregate: async () => ({ _sum: { contributionWeight: 80 } }),
    },
    goal: { findFirst: async () => ({ id: "setor" }) },
    $executeRawUnsafe: async () => 1,
  } as any;
  await assert.rejects(() => validarVinculoSetor(tx, { id: "meta", status: "ATIVA" }, { id: "admin", role: "ADMIN" }), /100%/);
  await assert.doesNotReject(() => validarVinculoSetor(tx, { id: "meta", parentGoalId: null, contributionWeight: null }, { id: "admin", role: "ADMIN" }));
});
