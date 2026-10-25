import test from "node:test";
import assert from "node:assert/strict";
import { devoAtualizar } from "../src/lib/atualizarAoVoltar";

test("atualiza so' com a aba visivel e depois do tempo minimo", () => {
  assert.equal(devoAtualizar(100_000, 70_000, 20_000, true), true);
  assert.equal(devoAtualizar(100_000, 85_000, 20_000, true), false, "ainda dentro do tempo minimo");
  assert.equal(devoAtualizar(100_000, 0, 20_000, false), false, "aba escondida nao atualiza");
  assert.equal(devoAtualizar(100_000, 80_000, 20_000, true), true, "no limite exato atualiza");
});
