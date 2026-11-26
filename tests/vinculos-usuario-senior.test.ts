import { test } from "node:test";
import assert from "node:assert/strict";
import { casarPorNome, indicePorNome, vinculosSuspeitos } from "../src/lib/senior/vinculosUsuario";

const contas = [
  { id: "u1", name: "Emily Sousa" },
  { id: "u2", name: "Pedro Henrique Andrade" },
  { id: "u3", name: "Geizi Silva" },
  { id: "u4", name: "Pedro Ferreira" },
];
const lig = (codigo: string, nome: string, user: { id: string; name: string } | null) => ({ codigo, nome, userId: user?.id ?? null, user: user && { ...user, email: "fiscal@consominas.com.br" } });

test("casar: so' por nome; e-mail igual de outra conta nao liga ninguem", () => {
  const porNome = indicePorNome(contas);
  assert.equal(casarPorNome({ nome: "emily.sousa", login: "emily.sousa" }, porNome), "u1");
  // item com e-mail de uma conta, mas nome que nao existe: nao casa (antes casava pelo e-mail)
  assert.equal(casarPorNome({ nome: "maria.inexistente", login: "maria.inexistente", ...{ email: "fiscal@consominas.com.br" } } as any, porNome), null);
  // nome repetido entre contas = ambiguo = nao casa
  assert.equal(casarPorNome({ nome: "Ana Lima" }, indicePorNome([{ id: "a", name: "Ana Lima" }, { id: "b", name: "Ana Lima" }])), null);
});

test("suspeitos: Emily ligada a Pedro Henrique e' apontada e a proposta e' a conta da Emily", () => {
  const r = vinculosSuspeitos([lig("218", "Emily Sousa", contas[1])], contas);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].codigo, r[0].proposta?.id], ["218", "u1"]);
});

test("suspeitos: pedro.ferreira ligado a Pedro Henrique tambem (mesmo primeiro nome nao basta)", () => {
  const r = vinculosSuspeitos([lig("159", "Pedro Ferreira", contas[1])], contas);
  assert.deepEqual([r.length, r[0].proposta?.id], [1, "u4"]);
});

test("suspeitos: vinculo normal nao e' apontado (login so' com primeiro nome, nome igual)", () => {
  const ok = [lig("177", "Geizi", contas[2]), lig("218", "Emily Sousa", contas[0])];
  assert.deepEqual(vinculosSuspeitos(ok, contas), []);
});

test("suspeitos: sem conta de nome igual, a proposta e' desvincular (null)", () => {
  const r = vinculosSuspeitos([lig("300", "Carlos Souza", contas[1])], contas);
  assert.deepEqual([r.length, r[0].proposta], [1, null]);
});
