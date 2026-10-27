import test from "node:test";
import assert from "node:assert/strict";
import { homologacaoLocalSegura } from "../src/lib/ambienteHomologacao";

test("homologação de Metas exige banco, porta, host local e integrações simuladas exatos", () => {
  const env: NodeJS.ProcessEnv = { NODE_ENV: "test", APP_ENV: "homologacao", DATABASE_URL: "postgresql://localtest@127.0.0.1:55439/consominas_metas_homologacao", SENIOR_WS_SAPIENS_URL: "http://127.0.0.1:3099/leitura", SENIOR_WS_BAIXA_URL: "http://127.0.0.1:3099/baixa" };
  assert.equal(homologacaoLocalSegura(env), true);
  for (const change of [
    { APP_ENV: "production" }, { DATABASE_URL: "postgresql://localtest@exemplo.invalid:55439/consominas_metas_homologacao" },
    { DATABASE_URL: "postgresql://localtest@127.0.0.1:5432/consominas_metas_homologacao" },
    { DATABASE_URL: "postgresql://localtest@127.0.0.1:55439/consominas_gestao" },
    { SENIOR_WS_BAIXA_URL: "https://exemplo.invalid/erp" },
  ]) assert.equal(homologacaoLocalSegura({ ...env, ...change }), false);
});
