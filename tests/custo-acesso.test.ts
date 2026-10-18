import { test } from "node:test";
import assert from "node:assert/strict";
import { escopoDeCustos, lerListaDeAcessos, montarEscopo, podeVerCcu } from "../src/lib/custos/acesso";

const bancoFalso = (usuario: any) => ({ user: { findUnique: async () => usuario } }) as any;

test("escopo: todos, varios, um e nenhum", () => {
  assert.deepEqual([montarEscopo(true, []).tipo, montarEscopo(true, []).quantidade], ["todos", null]);
  assert.equal(montarEscopo(false, []).tipo, "nenhum");
  assert.equal(montarEscopo(false, ["190"]).tipo, "um");
  assert.equal(montarEscopo(false, ["190", "230", "190"]).tipo, "varios");
  assert.equal(montarEscopo(false, ["190", "230", "190"]).quantidade, 2);
});

test("podeVerCcu: so' o que foi liberado; todos ve tudo", () => {
  const e = montarEscopo(false, ["190", "230"]);
  assert.ok(podeVerCcu(e, "190"));
  assert.ok(!podeVerCcu(e, "270"));
  assert.ok(podeVerCcu(montarEscopo(true, []), "qualquer"));
  assert.ok(!podeVerCcu(montarEscopo(false, []), "190"));
});

test("escopoDeCustos: ADMIN/DIRETOR ve tudo sem consultar; verTodosCustos ve tudo", async () => {
  assert.equal((await escopoDeCustos(bancoFalso(null), { id: "1", role: "ADMIN" })).tipo, "todos");
  assert.equal((await escopoDeCustos(bancoFalso(null), { id: "1", role: "DIRETOR" })).tipo, "todos");
  const e = await escopoDeCustos(bancoFalso({ verTodosCustos: true, acessosCentroCusto: [], teams: [] }), { id: "2", role: "APROVADOR" });
  assert.equal(e.tipo, "todos");
});

test("escopoDeCustos: soma os CCUs liberados e os das equipes; ignora equipe sem CCU", async () => {
  const usuario = { verTodosCustos: false, acessosCentroCusto: [{ codccu: "190" }, { codccu: "230" }], teams: [{ team: { codccu: "230" } }, { team: { codccu: "102235" } }, { team: { codccu: null } }] };
  const e = await escopoDeCustos(bancoFalso(usuario), { id: "3", role: "COLABORADOR" });
  assert.equal(e.tipo, "varios");
  assert.deepEqual(Array.from(e.ccus).sort(), ["102235", "190", "230"]);
  assert.equal((await escopoDeCustos(bancoFalso({ verTodosCustos: false, acessosCentroCusto: [{ codccu: "190" }], teams: [] }), { id: "4", role: "COLABORADOR" })).tipo, "um");
  assert.equal((await escopoDeCustos(bancoFalso({ verTodosCustos: false, acessosCentroCusto: [], teams: [{ team: { codccu: null } }] }), { id: "5", role: "COLABORADOR" })).tipo, "nenhum");
  assert.equal((await escopoDeCustos(bancoFalso(null), { id: "6", role: "COLABORADOR" })).tipo, "nenhum", "usuario inexistente: nenhum acesso");
});

test("lista de acessos: formatos aceitos e erros claros", () => {
  const r = lerListaDeAcessos(`
# comentario
Maria@Consominas.com.br;190, 230  102235
joao@consominas.com.br\ttodos
ana@consominas.com.br,270
sem-arroba;190
bruno@consominas.com.br;abc
`);
  assert.deepEqual(r.linhas, [
    { email: "maria@consominas.com.br", todos: false, ccus: ["190", "230", "102235"] },
    { email: "joao@consominas.com.br", todos: true, ccus: [] },
    { email: "ana@consominas.com.br", todos: false, ccus: ["270"] },
  ]);
  assert.equal(r.erros.length, 2);
  assert.match(r.erros[0], /linha 6/);
  assert.match(r.erros[1], /não é um número/);
});
