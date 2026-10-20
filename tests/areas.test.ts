import { test } from "node:test";
import assert from "node:assert/strict";
import { AREAS, AREA_POR_CCU, CENTROS, areaDoCentro, ccusDaArea, filtrarTitulosPorSelecao, lerArea, lerSelecao } from "../src/lib/areas";
import { aplicarSelecaoAoEscopo, escopoDeCustos, escopoDeVisao, montarEscopo, podeVerCcu } from "../src/lib/custos/acesso";

const todos = (codigos: string[], area: string) => codigos.forEach((c) => assert.equal(areaDoCentro(c), area, `CC ${c} deveria ser ${area}`));

test("areas: as regras do Joao (20/10/2026) estao no mapa", () => {
  // Engenharia: AGA (todos), MRN 4337 e 4343, Jaguar, Del Rey, SVPM, solos (MRN 3581), MRN 3484 e 215703, ALCOA PR 041 e PR 100
  todos(["140", "150", "160", "170", "102185", "102195", "102205"], "ENGENHARIA");
  todos(["102335", "102345", "102415", "102425", "102355", "280", "430", "102445", "240", "20", "102045", "330", "70"], "ENGENHARIA");
  // Ambiental: ALCOA (demais), AMG, MRN 3686 com BAQ/PLT02/PMRE, 3687, 3748, 3728, 4353, 4362
  todos(["110", "102215", "102435", "100", "350", "410", "102085", "102275", "102365", "102375"], "AMBIENTAL");
  todos(["190", "210", "220", "230", "310", "102225", "102235", "102245", "102385", "102395"], "AMBIENTAL");
  // SUDECAP como o financeiro: DJ 029 e 114 Civil; DJ 011 e 050 Ambiental
  todos(["90", "370"], "ENGENHARIA");
  todos(["130", "180"], "AMBIENTAL");
  // MACFROTAS e centros administrativos (os ADM tambem podem ser filtrados)
  todos(["102325", "11", "12", "13", "14", "15", "102265", "102315"], "ADMINISTRATIVO");
  todos(["102295"], "ENGENHARIA"); // ADM Engenharia
  todos(["102285"], "AMBIENTAL"); // ADM Meio Ambiente
});

test("areas: 101 centros de custo com nome, cada um em uma area so'; centro desconhecido = sem area", () => {
  assert.equal(CENTROS.length, 101);
  assert.equal(new Set(CENTROS.map((c) => c.ccu)).size, 101);
  assert.ok(CENTROS.every((c) => c.nome.length > 2 && !c.nome.includes("\ufffd")), "todo centro tem nome legivel");
  assert.equal(Object.keys(AREA_POR_CCU).length, 101);
  for (const a of AREAS) assert.ok(ccusDaArea(a.valor).length > 0, a.valor);
  assert.equal(AREAS.reduce((s, a) => s + ccusDaArea(a.valor).length, 0), 101);
  assert.equal(CENTROS.filter((c) => c.area === "ADMINISTRATIVO").length, 21); // os ADM aparecem na lista para marcar
  assert.equal(areaDoCentro("999999"), null);
  assert.equal(areaDoCentro(null), null);
  assert.equal(areaDoCentro(" 190 "), "AMBIENTAL");
});

test("areas: lerArea e lerSelecao aceitam so' o que e' valido; o resto e' sem filtro", () => {
  assert.equal(lerArea("engenharia"), "ENGENHARIA");
  for (const v of ["", "TODAS", "lixo", undefined, null, "ENG"]) assert.equal(lerArea(v as string | null | undefined), null);
  assert.deepEqual(lerSelecao("190,102185"), ["190", "102185"]);
  assert.deepEqual(lerSelecao(" 190 , 190, abc, 12x, 102185 "), ["190", "102185"]); // sem lixo, sem repetir
  for (const v of ["", "abc", ",,", undefined, null]) assert.equal(lerSelecao(v as string | null | undefined), null);
  assert.equal(lerSelecao(Array.from({ length: 500 }, (_, i) => String(i + 1)).join(","))!.length, 300);
});

test("filtro de contratos no escopo: quem ve tudo passa a ver so' os escolhidos; quem ve uma lista, a intersecao; sem escolha nao muda nada", () => {
  const admin = montarEscopo(true, []);
  const so = aplicarSelecaoAoEscopo(admin, ["102185", "190"]);
  assert.equal(so.todos, false);
  assert.equal(podeVerCcu(so, "102185"), true);
  assert.equal(podeVerCcu(so, "190"), true);
  assert.equal(podeVerCcu(so, "170"), false);
  assert.equal(so.quantidade, 2);
  const eng = aplicarSelecaoAoEscopo(admin, ccusDaArea("ENGENHARIA")); // "so' Engenharia" = marcar todos os centros da area
  assert.equal(eng.quantidade, 48);
  const lista = montarEscopo(false, ["190", "102185", "999999"]);
  assert.deepEqual([...aplicarSelecaoAoEscopo(lista, ["190", "170"]).ccus], ["190"]);
  assert.equal(aplicarSelecaoAoEscopo(lista, ["170"]).tipo, "nenhum"); // nenhum dos escolhidos esta na lista da pessoa
  assert.equal(aplicarSelecaoAoEscopo(admin, null), admin);
  assert.equal(aplicarSelecaoAoEscopo(admin, []), admin);
  assert.equal(aplicarSelecaoAoEscopo(lista, null), lista);
});

test("o acesso NAO muda: escopoDeCustos continua igual; a escolha so' estreita a visao de uma lista", async () => {
  const banco = { user: { findUnique: async () => null } } as never;
  const admin = await escopoDeCustos(banco, { id: "1", role: "ADMIN" });
  assert.equal(admin.tipo, "todos"); // permissao, detalhe, exportacao e demanda seguem usando este escopo
  assert.equal(admin.todos, true);
  assert.equal(await escopoDeVisao(admin), admin); // fora de uma requisicao nao ha cookie: a visao e' a mesma
  const visao = aplicarSelecaoAoEscopo(admin, ["190"]);
  assert.equal(podeVerCcu(visao, "190"), true);
  assert.equal(podeVerCcu(visao, "102185"), false);
  assert.equal(admin.todos, true); // o escopo original nao foi alterado
});

test("programacao de pagamento: filtra os titulos pelos centros escolhidos e refaz as somas; sem escolha nada muda; sem centro de custo some quando ha filtro", () => {
  const t = (codccu: string | null, pago: boolean, aberto: number, original: number) => ({ codccu, pago, valorAberto: aberto, valorOriginal: original });
  const lista = [t("102185", false, 100, 100), t("190", false, 50, 50), t("190", true, 0, 30), t("102185", true, 0, 20), t(null, false, 7, 7), t("999999", false, 5, 5)];
  assert.equal(filtrarTitulosPorSelecao(lista, null).titulos.length, 6);
  const eng = filtrarTitulosPorSelecao(lista, ["102185"]);
  assert.equal(eng.titulos.length, 2);
  assert.deepEqual([eng.totalAberto, eng.qtdAberto, eng.qtdPagos, eng.totalPago], [100, 1, 1, 20]);
  const dois = filtrarTitulosPorSelecao(lista, ["102185", "190"]);
  assert.deepEqual([dois.totalAberto, dois.qtdAberto, dois.qtdPagos, dois.totalPago], [150, 2, 2, 50]);
  assert.equal(filtrarTitulosPorSelecao(lista, ["102325"]).titulos.length, 0);
});
