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

// ---- e-mail IGUAL ao e-mail do usuario no Senior (E099USU.INTNET), 25/10/2026
const comEmail = [
  { codigo: "10", nome: "reinaldo.a", email: "reinaldo.almeida@consominas.com.br" }, // login diferente do e-mail, mas e-mail igual e unico
  { codigo: "28", nome: "alexandre.paiva", email: "diretoria@consominas.com.br" }, // caixa compartilhada por varios logins
  { codigo: "80", nome: "inacio.maia", email: "diretoria@consominas.com.br" },
  { codigo: "193", nome: "anna.silva", email: "anna.silva@consominas.com.br" }, // e-mail compartilhado, mas o login e' o dono
  { codigo: "206", nome: "anna.dantas", email: "anna.silva@consominas.com.br" },
  { codigo: "300", nome: "carlos.souza", email: null }, // sem e-mail no Senior: vale o login
];

test("e-mail igual ao do Senior vincula, mesmo com o login diferente da parte antes do @", () => {
  assert.deepEqual(acharSeniorPorEmail("Reinaldo.Almeida@consominas.com.br", comEmail), { codigo: "10", nome: "reinaldo.a" });
  assert.deepEqual(acharSeniorPorEmail("  reinaldo.almeida@consominas.com.br ", comEmail), { codigo: "10", nome: "reinaldo.a" }, "espacos e maiusculas nao atrapalham");
});

test("e-mail compartilhado por varios logins: so' vale o de login igual; senao nao vincula ninguem", () => {
  assert.deepEqual(acharSeniorPorEmail("anna.silva@consominas.com.br", comEmail), { codigo: "193", nome: "anna.silva" });
  assert.equal(acharSeniorPorEmail("diretoria@consominas.com.br", comEmail), null, "caixa de grupo: ambiguo");
});

test("sem e-mail igual, cai no login igual a parte antes do @", () => {
  assert.deepEqual(acharSeniorPorEmail("carlos.souza@consominas.com.br", comEmail), { codigo: "300", nome: "carlos.souza" });
  assert.equal(acharSeniorPorEmail("outra.pessoa@consominas.com.br", comEmail), null);
});

test("o resultado nunca expoe o e-mail do Senior (so' codigo e nome)", () => {
  assert.deepEqual(Object.keys(acharSeniorPorEmail("reinaldo.almeida@consominas.com.br", comEmail)!).sort(), ["codigo", "nome"]);
});
