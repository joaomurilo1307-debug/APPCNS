import test from "node:test";
import assert from "node:assert/strict";
import { alvoPorReducao, configuracaoCoerente, podeAlterarMeta, progressoIndicador, validarVinculosMetas } from "../src/lib/contractGoals/calculo";
import { dadosMeta, erroConfiguracao } from "../src/lib/contractGoals/validacao";

test("indicadores medem a distancia desde a baseline, inclusive zero e valores negativos", () => {
  assert.equal(progressoIndicador(100, 80, 90, "REDUZIR"), 0.5);
  assert.equal(progressoIndicador(0, 100, 25, "AUMENTAR"), 0.25);
  assert.equal(progressoIndicador(5, 0, 2.5, "REDUZIR"), 0.5);
  assert.equal(progressoIndicador(-10, -20, -15, "REDUZIR"), 0.5);
  assert.equal(progressoIndicador(-20, -10, -15, "AUMENTAR"), 0.5);
  assert.equal(progressoIndicador(0, 0, 0, "REDUZIR"), 1);
  assert.equal(progressoIndicador(0, 0, 1, "REDUZIR"), 0);
  assert.equal(progressoIndicador(100, 80, 200, "REDUZIR"), 0);
  assert.equal(progressoIndicador(100, 80, 50, "REDUZIR"), 1);
  assert.equal(progressoIndicador(100, 80, null, "REDUZIR"), null);
  assert.equal(progressoIndicador(100, 80, Number.NaN, "REDUZIR"), null);
  assert.equal(progressoIndicador(10, 20, 15, "REDUZIR"), null);
  assert.equal(configuracaoCoerente(10, 20, "REDUZIR"), false);
  assert.equal(alvoPorReducao(1000, 12.5), 875);
  assert.equal(alvoPorReducao(0, 10), 0);
  assert.equal(alvoPorReducao(-100, 10), -110);
  assert.equal(alvoPorReducao(100, 101), null);
  assert.equal(alvoPorReducao(Number.NaN, 10), null);
});

test("editar exige simultaneamente modulo, CCU e gerencia ou responsabilidade; perfil de consulta nunca escreve", () => {
  const acesso = { role: "GESTOR_PROJETO", userId: "gestor", hasModuleWrite: true, hasCcu: true };
  assert.equal(podeAlterarMeta(acesso), true);
  assert.equal(podeAlterarMeta({ ...acesso, hasCcu: false }), false);
  assert.equal(podeAlterarMeta({ ...acesso, hasModuleWrite: false }), false);
  assert.equal(podeAlterarMeta({ ...acesso, role: "COLABORADOR" }), false);
  assert.equal(podeAlterarMeta({ ...acesso, role: "COLABORADOR", ownerId: "gestor" }), true);
  assert.equal(podeAlterarMeta({ ...acesso, role: "VISUALIZADOR", ownerId: "gestor" }), false);
  assert.equal(podeAlterarMeta({ ...acesso, role: "CLIENTE", ownerId: "gestor" }), false);
});

test("vinculos repetidos sao unicos e nao aceitam outro CCU, meta inativa ou inexistente", () => {
  const metas = [{ id: "meta", codccu: "230", status: "ATIVA" }];
  assert.deepEqual(validarVinculosMetas(["meta", "meta"], metas, "230"), ["meta"]);
  assert.throws(() => validarVinculosMetas(["meta"], metas, "240"));
  assert.throws(() => validarVinculosMetas(["meta"], metas, null));
  assert.throws(() => validarVinculosMetas(["outra"], metas, "230"));
  assert.throws(() => validarVinculosMetas(["meta"], [{ ...metas[0], status: "ARQUIVADA" }], "230"));
});

test("plano livre dispensa numeros, enquanto indicador e fonte automatica exigem configuracao coerente", () => {
  const plano = dadosMeta.parse({ title: "Organizar a rotina", category: "GERAL", kind: "PLANO" });
  assert.equal(erroConfiguracao(plano), null);
  assert.equal(plano.baselineValue, null); assert.equal(plano.targetValue, null); assert.equal(plano.unit, null);
  assert.ok(erroConfiguracao({ ...plano, baselineValue: 0 }));
  assert.ok(erroConfiguracao({ ...plano, kind: "INDICADOR" }));
  const financeiro = dadosMeta.parse({ ...plano, kind: "INDICADOR", unit: "R$", baselineValue: 1000, targetValue: 900, direction: "REDUZIR", source: "CUSTO", periodStart: "2026-01", periodEnd: "2026-10" });
  assert.equal(erroConfiguracao(financeiro), null);
  assert.equal(erroConfiguracao({ ...financeiro, source: "MANUAL", unit: "dias úteis" }), null);
  assert.ok(erroConfiguracao({ ...financeiro, unit: "%" }));
  assert.ok(erroConfiguracao({ ...financeiro, category: "FALTAS" }));
  assert.ok(erroConfiguracao({ ...financeiro, periodStart: "2026-11" }));
  assert.equal(dadosMeta.safeParse({ ...financeiro, targetValue: Number.POSITIVE_INFINITY }).success, false);
});
