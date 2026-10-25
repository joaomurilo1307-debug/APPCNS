import { test } from "node:test";
import assert from "node:assert/strict";
import { aplicarAcompanhamentoAoEscopo, aplicarSelecaoAoEscopo, ccusForaDosResultados, escopoDeCustos, escopoDeVisao, lerListaDeAcessos, limparCacheDeAcompanhamento, montarEscopo, podeVerCcu } from "../src/lib/custos/acesso";

const bancoFalso = (usuario: any, fora: string[] = []) => {
  limparCacheDeAcompanhamento();
  return { user: { findUnique: async () => usuario }, contrato: { findMany: async () => fora.map((codccu) => ({ codccu })) } } as any;
};

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

test("situacao e acompanhamento nao retiram permissoes de consulta do historico", async () => {
  const admin = await escopoDeCustos(bancoFalso(null, ["190"]), { id: "1", role: "ADMIN" });
  assert.ok(podeVerCcu(admin, "190"), "admin continua vendo o encerrado");
  const diretor = await escopoDeCustos(bancoFalso(null, ["190"]), { id: "2", role: "DIRETOR" });
  assert.ok(podeVerCcu(diretor, "190") && podeVerCcu(diretor, "230"), "diretor continua consultando o historico");
  assert.equal(diretor.tipo, "todos");
  const todosCustos = await escopoDeCustos(bancoFalso({ verTodosCustos: true, acessosCentroCusto: [], teams: [] }, ["190"]), { id: "3", role: "APROVADOR" });
  assert.ok(podeVerCcu(todosCustos, "190") && podeVerCcu(todosCustos, "270"));
  const liberado = await escopoDeCustos(bancoFalso({ verTodosCustos: false, acessosCentroCusto: [{ codccu: "190", area: "AMBOS" }, { codccu: "230", area: "AMBOS" }], teams: [{ team: { codccu: "270" } }] }, ["190", "270"]), { id: "4", role: "COLABORADOR" });
  assert.deepEqual(Array.from(liberado.ccus).sort(), ["190", "230", "270"], "acessos explicitos e equipes continuam valendo");
  assert.equal(liberado.tipo, "varios");
  assert.ok(!podeVerCcu(liberado, "999"), "historico nao concede acesso a outro contrato");
});

test("acompanhamento: selecao temporaria nao traz excluido de volta nem altera a ACL", () => {
  const acl = montarEscopo(true, []);
  const e = aplicarAcompanhamentoAoEscopo(acl, ["190"]);
  assert.ok(!podeVerCcu(aplicarSelecaoAoEscopo(e, ["190", "230"]), "190"));
  assert.ok(podeVerCcu(aplicarSelecaoAoEscopo(e, ["190", "230"]), "230"));
  assert.deepEqual(Array.from(aplicarSelecaoAoEscopo(e, ["190", "230"]).ccus), ["230"]);
  assert.equal(aplicarSelecaoAoEscopo(e, null), e, "sem selecao: o mesmo escopo");
  assert.ok(podeVerCcu(acl, "190"), "a permissao de consulta nao foi alterada");
  const restrito = aplicarSelecaoAoEscopo(aplicarAcompanhamentoAoEscopo(montarEscopo(false, ["190", "230"]), ["190"]), ["190", "230", "999"]);
  assert.deepEqual([...restrito.ccus], ["230"], "selecao nao amplia permissao");
});

test("acompanhamento: cada requisicao reflete a escolha atual sem depender do processo", async () => {
  const db1 = bancoFalso(null, []);
  assert.equal((await ccusForaDosResultados(db1)).size, 0);
  let consultas = 0;
  const db2 = { user: { findUnique: async () => null }, contrato: { findMany: async () => { consultas++; return [{ codccu: "190" }]; } } } as any;
  assert.equal((await ccusForaDosResultados(db2)).size, 1, "a escolha atual nao depende de um cache anterior");
  assert.equal(consultas, 1);
  limparCacheDeAcompanhamento();
  assert.equal((await ccusForaDosResultados(db2)).size, 1);
  await ccusForaDosResultados(db2);
  assert.equal(consultas, 3, "cada chamada consulta o estado atual");
});

test("relatorios incluem encerrado acompanhado e excluem ativo nao acompanhado", async () => {
  limparCacheDeAcompanhamento();
  const contratos = [
    { codccu: "1", status: "ATIVO", acompanharResultados: true },
    { codccu: "2", status: "ENCERRADO", acompanharResultados: true },
    { codccu: "3", status: "ATIVO", acompanharResultados: false },
    { codccu: "4", status: "ENCERRADO", acompanharResultados: false },
  ];
  const db = { contrato: { findMany: async ({ where }: any) => contratos.filter((c) => c.acompanharResultados === where.acompanharResultados) } } as any;
  const relatorio = await escopoDeVisao(montarEscopo(true, []), { ignorarSelecao: true }, db);
  assert.deepEqual(contratos.filter((c) => podeVerCcu(relatorio, c.codccu)).map((c) => c.codccu), ["1", "2"]);
  const historico = await escopoDeVisao(montarEscopo(false, ["2", "3"]), { incluirForaDosResultados: true, ignorarSelecao: true }, db);
  assert.deepEqual(contratos.filter((c) => podeVerCcu(historico, c.codccu)).map((c) => c.codccu), ["2", "3"]);
});
