import test from "node:test";
import assert from "node:assert/strict";
import { chaveSyncValida } from "../src/lib/senior/chaveSync";

test("chave de sync: aceita so' a chave exata e fecha quando nao ha chave configurada", () => {
  const original = process.env.SENIOR_SYNC_KEY;
  try {
    process.env.SENIOR_SYNC_KEY = "segredo-de-teste";
    assert.equal(chaveSyncValida("segredo-de-teste"), true);
    assert.equal(chaveSyncValida("segredo-de-teste "), false);
    assert.equal(chaveSyncValida("outra"), false);
    assert.equal(chaveSyncValida(""), false);
    assert.equal(chaveSyncValida(null), false);
    assert.equal(chaveSyncValida(undefined), false);

    // Sem chave no servidor, nem a chave vazia nem uma qualquer pode passar.
    delete process.env.SENIOR_SYNC_KEY;
    assert.equal(chaveSyncValida("qualquer"), false);
    assert.equal(chaveSyncValida(""), false);
    process.env.SENIOR_SYNC_KEY = "";
    assert.equal(chaveSyncValida(""), false);
  } finally {
    if (original === undefined) delete process.env.SENIOR_SYNC_KEY;
    else process.env.SENIOR_SYNC_KEY = original;
  }
});
