import test from "node:test";
import assert from "node:assert/strict";
import { acharSeniorPorEmail, chaveLogin } from "../prisma/achar-senior";

const senior = [
  { codigo: "58", nome: "Breno Lana" },
  { codigo: "54", nome: "Bruno Teixeira" },
  { codigo: "85", nome: "Bruno Novais" },
  { codigo: "125", nome: "elaine" },
  { codigo: "46", nome: "elaine.carvalho" },
  { codigo: "200", nome: "Joao Silva" },
  { codigo: "201", nome: "joao.silva" },
];

test("login do Senior: bruno.teixeira e 'Bruno Teixeira' sao o mesmo; acento e pontuacao nao atrapalham", () => {
  assert.equal(chaveLogin("bruno.teixeira"), chaveLogin("Bruno Teixeira"));
  assert.equal(chaveLogin("José_da-Silva"), "JOSE DA SILVA");
});

test("e-mail -> usuario do Senior: acha pelo login antes do @, maiusculas e minusculas valem", () => {
  assert.deepEqual(acharSeniorPorEmail("breno.lana@consominas.com.br", senior), { codigo: "58", nome: "Breno Lana" });
  assert.deepEqual(acharSeniorPorEmail("Bruno.Teixeira@Consominas.com.br", senior), { codigo: "54", nome: "Bruno Teixeira" });
  assert.deepEqual(acharSeniorPorEmail("elaine@consominas.com.br", senior), { codigo: "125", nome: "elaine" });
  assert.deepEqual(acharSeniorPorEmail("elaine.carvalho@consominas.com.br", senior), { codigo: "46", nome: "elaine.carvalho" });
});

test("e-mail -> usuario do Senior: na duvida devolve null (nao chuta)", () => {
  assert.equal(acharSeniorPorEmail("bruno@consominas.com.br", senior), null, "primeiro nome sozinho nao vale se o login e' outro");
  assert.equal(acharSeniorPorEmail("joao.silva@consominas.com.br", senior), null, "dois logins iguais: ambiguo");
  assert.equal(acharSeniorPorEmail("ninguem.assim@consominas.com.br", senior), null);
  assert.equal(acharSeniorPorEmail("ab@x.com", senior), null, "login curto demais");
  assert.equal(acharSeniorPorEmail("", senior), null);
});
