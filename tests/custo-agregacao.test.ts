import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COR_DEMAIS,
  PALETA_GRUPOS,
  agruparPorGrupo,
  chaveMes,
  coresDosGrupos,
  contaPassa,
  escalaBonita,
  linhasDoContrato,
  linhasDoPortfolio,
  mesesDoPeriodo,
  serieDaConta,
  variacao,
  type ContaDoContrato,
  type ContratoCusto,
  type Filtros,
} from "../src/lib/custos/agregacao";
import { montarCsv } from "../src/lib/custos/csv";
import { haQuantoTempo, mesCurto, mesLongo, moedaCompacta, variacaoTexto } from "../src/lib/custos/formato";

const conta = (nome: string, grupoCodigo: string, reembolsavel: boolean, valores: Record<string, number>): ContaDoContrato => ({
  contaFinanceira: nome,
  codigo: 1,
  grupoCodigo,
  grupoNome: "G" + grupoCodigo,
  reembolsavel,
  total: Object.values(valores).reduce((s, v) => s + v, 0),
  meses: Object.entries(valores).map(([m, valor]) => ({ competencia: `${m}-01T00:00:00.000Z`, valor })),
});
const contrato = (codccu: string, nome: string, contas: ContaDoContrato[]): ContratoCusto => ({
  codccu,
  contrato: `${codccu} - ${nome}`,
  nome,
  teamId: null,
  teamName: null,
  projectName: null,
  totalGeral: contas.reduce((s, c) => s + c.total, 0),
  ultimaCompetencia: null,
  contas,
});
const MESES = ["2026-01", "2026-02", "2026-03", "2026-04"];
const todos: Filtros = { de: "2026-01", ate: "2026-04", tipo: "todos", grupo: "todos" };

const A = contrato("190", "Flora", [
  conta("Combustível", "205", false, { "2026-01": 100, "2026-02": 200 }),
  conta("R - Combustivel", "205", true, { "2026-02": 50, "2026-04": 25 }),
  conta("Internet", "207", false, { "2026-03": 10 }),
]);
const B = contrato("270", "AGA", [conta("Internet", "207", false, { "2026-01": 5 })]);

test("periodo: filtra os meses disponiveis entre de e ate", () => {
  assert.deepEqual(mesesDoPeriodo(MESES, "2026-02", "2026-03"), ["2026-02", "2026-03"]);
  assert.deepEqual(mesesDoPeriodo(MESES, "2026-04", "2026-01"), []);
  assert.equal(chaveMes("2026-04-01T00:00:00.000Z"), "2026-04");
});

test("serie da conta: alinhada aos meses, zero onde nao ha lancamento", () => {
  assert.deepEqual(serieDaConta(A.contas[0], MESES), [100, 200, 0, 0]);
});

test("filtro tipo/grupo: proprio, reembolsavel e grupo", () => {
  const [comb, r, net] = A.contas;
  assert.ok(contaPassa(comb, { tipo: "proprio", grupo: "todos" }));
  assert.ok(!contaPassa(r, { tipo: "proprio", grupo: "todos" }));
  assert.ok(contaPassa(r, { tipo: "reembolsavel", grupo: "todos" }));
  assert.ok(!contaPassa(comb, { tipo: "reembolsavel", grupo: "todos" }));
  assert.ok(contaPassa(net, { tipo: "todos", grupo: "207" }));
  assert.ok(!contaPassa(comb, { tipo: "todos", grupo: "207" }));
});

test("linhas do contrato: ordena por total, descarta conta zerada no periodo, busca por nome", () => {
  const l = linhasDoContrato(A, todos, MESES);
  assert.deepEqual(l.map((x) => x.conta.contaFinanceira), ["Combustível", "R - Combustivel", "Internet"]);
  assert.deepEqual(l.map((x) => x.total), [300, 75, 10]);
  assert.equal(linhasDoContrato(A, todos, MESES, "intern").length, 1);
  assert.equal(linhasDoContrato(A, { ...todos, tipo: "reembolsavel" }, MESES).length, 1);
  assert.equal(linhasDoContrato(A, todos, ["2026-04"]).length, 1); // so' a conta R tem valor em abril
});

test("agrupar por grupo: subtotais por mes e ordenacao por total", () => {
  const l = linhasDoContrato(A, todos, MESES);
  const g = agruparPorGrupo(l, MESES.length);
  assert.deepEqual(g.map((x) => [x.grupoCodigo, x.total]), [["205", 375], ["207", 10]]);
  assert.deepEqual(g[0].serie, [100, 250, 0, 25]);
});

test("portfolio: soma por contrato respeitando filtros e busca; contrato sem valor sai", () => {
  const l = linhasDoPortfolio([A, B], todos, MESES);
  assert.deepEqual(l.map((x) => [x.contrato.codccu, x.total]), [["190", 385], ["270", 5]]);
  assert.deepEqual(linhasDoPortfolio([A, B], { ...todos, tipo: "reembolsavel" }, MESES).map((x) => x.contrato.codccu), ["190"]);
  assert.deepEqual(linhasDoPortfolio([A, B], todos, MESES, "aga").map((x) => x.contrato.codccu), ["270"]);
  assert.deepEqual(linhasDoPortfolio([A, B], todos, MESES, "190").map((x) => x.contrato.codccu), ["190"]);
});

test("variacao: sem base devolve null; sinal correto", () => {
  assert.equal(variacao(10, 0), null);
  assert.equal(variacao(150, 100), 0.5);
  assert.equal(variacao(50, 100), -0.5);
  assert.equal(variacaoTexto(0.5), "▲ 50%");
  assert.equal(variacaoTexto(-0.04), "▼ 4,0%");
  assert.equal(variacaoTexto(null), "—");
  assert.equal(variacaoTexto(0.001), "= estável");
});

test("cores por grupo: fixas pelo volume total, 6 coloridos e o resto cinza (nao repinta ao filtrar)", () => {
  const contas = Array.from({ length: 8 }, (_, i) => conta("c" + i, "g" + i, false, { "2026-01": 1000 - i * 10 }));
  const cores = coresDosGrupos([contrato("1", "X", contas)]);
  assert.equal(cores.get("g0"), PALETA_GRUPOS[0]);
  assert.equal(cores.get("g5"), PALETA_GRUPOS[5]);
  assert.equal(cores.get("g6"), COR_DEMAIS);
  assert.equal(cores.get("g7"), COR_DEMAIS);
  assert.equal(new Set(PALETA_GRUPOS).size, PALETA_GRUPOS.length);
});

test("escala do eixo: topo cobre o maximo com marcas redondas", () => {
  for (const max of [0, 7, 1234, 39_500, 2_040_000]) {
    const { topo, marcas } = escalaBonita(max);
    assert.ok(topo >= max, `topo ${topo} >= ${max}`);
    assert.equal(marcas[0], 0);
    assert.ok(marcas.length >= 2 && marcas.length <= 7, `${marcas.length} marcas`);
  }
  assert.deepEqual(escalaBonita(40_000).marcas, [0, 10_000, 20_000, 30_000, 40_000]);
});

test("formatos: mes, moeda compacta, ha quanto tempo, CSV", () => {
  assert.equal(mesCurto("2026-04"), "abr/26");
  assert.equal(mesLongo("2026-03"), "março de 2026");
  assert.equal(moedaCompacta(1_234_567), "R$ 1,23 mi");
  assert.equal(moedaCompacta(45_300), "R$ 45 mil");
  assert.equal(moedaCompacta(1_500), "R$ 1,5 mil");
  assert.equal(moedaCompacta(950), "R$ 950");
  const agora = Date.parse("2026-10-17T15:00:00Z");
  assert.equal(haQuantoTempo("2026-10-17T14:48:00Z", agora), "há 12 min");
  assert.equal(haQuantoTempo("2026-10-17T10:00:00Z", agora), "há 5 h");
  assert.equal(haQuantoTempo(null, agora), "nunca");
  const csv = montarCsv([["CCU", "Contrato"], ["190", 'Flora; "norte"'], ["270", 1234.5]]);
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes('"Flora; ""norte"""'));
  assert.ok(csv.includes("1234,50"));
});
