import { test } from "node:test";
import assert from "node:assert/strict";
import {
  agruparPorArea, curvaDoResultado, gerarInsights, indicesDoPeriodo, margemDe, mesDoCentro, resumir, seloDoCentro, somarSeries,
  type LinhaDoResultado, type Opcoes, type SeriesDoCentro,
} from "../src/lib/resultado/calculo";
import { montarLinhas, type CentroDaApi } from "../src/lib/resultado/montar";
import { juntarCentros } from "../src/lib/resultado/calculo";
import type { ContratoCusto } from "../src/lib/custos/agregacao";
import { alinharAosMeses, receitaPorCentro } from "../src/lib/resultado/receitaPorCentro";
import { consolidarFaturamento, type ItemConsolidado } from "../src/lib/medicao/consolidado";
import type { DocConc } from "../src/lib/medicao/conciliacao";

const LIQ: Opcoes = { liquida: true, comPessoal: true };
const BRUTA: Opcoes = { liquida: false, comPessoal: true };
const SEM_PESSOAL: Opcoes = { liquida: true, comPessoal: false };

const serie = (p: Partial<SeriesDoCentro> = {}): SeriesDoCentro => ({ receita: [1000, 2000], retencoes: [100, 200], custo: [300, 500], pessoal: [200, 400], ...p });

test("mes do centro: receita bruta - retencoes = liquida; resultado = liquida - custo - pessoal; margem sobre a liquida", () => {
  const m = mesDoCentro(serie(), 0, LIQ);
  assert.deepEqual([m.receita, m.retencoes, m.receitaLiquida, m.custo, m.pessoal, m.resultado], [1000, 100, 900, 300, 200, 400]);
  assert.equal(m.margem, 400 / 900);
});

test("pela receita bruta as retencoes nao entram; sem pessoal (ou sem acesso) o resultado e' antes do pessoal", () => {
  assert.equal(mesDoCentro(serie(), 0, BRUTA).resultado, 500);
  assert.equal(mesDoCentro(serie(), 0, BRUTA).margem, 500 / 1000);
  assert.equal(mesDoCentro(serie(), 0, SEM_PESSOAL).resultado, 600);
  assert.equal(mesDoCentro(serie({ pessoal: null }), 0, LIQ).pessoal, 0, "pessoal null = sem acesso: nada e' subtraido");
  assert.equal(mesDoCentro(serie({ pessoal: null }), 0, LIQ).resultado, 600);
});

test("sem receita nao existe margem (nunca divide por zero) e o resultado e' so' o custo negativo", () => {
  const m = mesDoCentro(serie({ receita: [0, 0], retencoes: [0, 0] }), 0, LIQ);
  assert.equal(m.margem, null);
  assert.equal(m.resultado, -500);
  assert.equal(margemDe(10, 0), null);
  assert.equal(margemDe(-50, 200), -0.25);
});

test("resumir soma o periodo e varios centros; centavos nao acumulam erro de ponto flutuante", () => {
  const a = serie({ receita: [0.1, 0.2], retencoes: [0, 0], custo: [0, 0], pessoal: [0, 0] });
  assert.equal(resumir([a], [0, 1], LIQ).receita, 0.3);
  const r = resumir([serie(), serie()], [0, 1], LIQ);
  assert.deepEqual([r.receita, r.retencoes, r.custo, r.pessoal, r.resultado], [6000, 600, 1600, 1200, 2600]); // 5.400 liquida - 1.600 - 1.200
  assert.equal(r.base, 5400);
  assert.equal(resumir([serie()], [1], LIQ).resultado, 900); // 2.000 - 200 - 500 - 400
});

test("somar series e curva do resultado com acumulado", () => {
  const s = somarSeries([serie(), serie({ pessoal: null })], 2);
  assert.deepEqual(s.receita, [2000, 4000]);
  assert.deepEqual(s.pessoal, [200, 400], "centro sem pessoal soma zero; o total so' tem pessoal se algum centro tem");
  assert.equal(somarSeries([serie({ pessoal: null })], 2).pessoal, null);
  const c = curvaDoResultado(serie(), 2, LIQ);
  assert.deepEqual(c.meses.map((m) => m.resultado), [400, 900]);
  assert.deepEqual(c.acumulado, [400, 1300]);
});

test("selo e' relativo a carteira: prejuizo, acima/abaixo da margem media, so' custo, sem custo", () => {
  const r = (receita: number, custo: number, pessoal = 0) => resumir([{ receita: [receita], retencoes: [0], custo: [custo], pessoal: [pessoal] }], [0], LIQ);
  assert.equal(seloDoCentro(r(1000, 1500), 0.3), "prejuizo");
  assert.equal(seloDoCentro(r(1000, 500), 0.3), "acima");
  assert.equal(seloDoCentro(r(1000, 800), 0.3), "abaixo");
  assert.equal(seloDoCentro(r(0, 800), 0.3), "sem-receita");
  assert.equal(seloDoCentro(r(1000, 0), null), "abaixo", "sem margem de referencia nao ha 'acima'");
  assert.equal(seloDoCentro(r(0, 0), 0.3), "sem-custo");
});

const ficha = (codccu: string, nome: string, extra: Partial<LinhaDoResultado> = {}): LinhaDoResultado => ({
  codccu, nome, tipo: "CONTRATO", status: "ATIVO", area: "ENGENHARIA", cliente: null, numero: null, objeto: null, vigenciaInicio: null, vigenciaFim: null, valorContrato: null, ...serie(), ...extra,
});

test("grupos por area na ordem Engenharia, Ambiental, Administrativo, Sem area; indices do periodo", () => {
  const g = agruparPorArea([ficha("1", "A", { area: "AMBIENTAL" }), ficha("2", "B"), ficha("3", "C", { area: null }), ficha("4", "D", { area: "ADMINISTRATIVO" })]);
  assert.deepEqual(g.map((x) => [x.id, x.linhas.map((l) => l.codccu)]), [["ENGENHARIA", ["2"]], ["AMBIENTAL", ["1"]], ["ADMINISTRATIVO", ["4"]], ["SEM", ["3"]]]);
  assert.deepEqual(indicesDoPeriodo(["2026-01", "2026-02", "2026-03"], "2026-02", "2026-03"), [1, 2]);
  assert.deepEqual(indicesDoPeriodo(["2026-01"], "2027-01", "2027-02"), []);
});

test("insights: prejuizo, concentracao, vencimento e carteira vazia sem quebrar", () => {
  const meses = ["2026-01", "2026-02"];
  assert.deepEqual(gerarInsights([], meses, [0, 1], LIQ, "2026-03-01"), []);
  assert.deepEqual(gerarInsights([ficha("1", "A")], meses, [], LIQ, "2026-03-01"), []);
  const linhas = [
    ficha("1", "Contrato Ruim", { receita: [100, 100], retencoes: [0, 0], custo: [900, 900], pessoal: null }),
    ficha("2", "Contrato Bom 1", { receita: [5000, 5000], retencoes: [0, 0], custo: [1000, 1000], pessoal: null, vigenciaFim: "2026-04-10", status: "ATIVO" }),
    ficha("3", "Contrato Bom 2", { receita: [4000, 4000], retencoes: [0, 0], custo: [1000, 1000], pessoal: null }),
    ficha("4", "Contrato Bom 3", { receita: [3000, 3000], retencoes: [0, 0], custo: [1000, 1000], pessoal: null }),
    ficha("5", "Contrato Bom 4", { receita: [200, 200], retencoes: [0, 0], custo: [100, 100], pessoal: null }),
    ficha("9", "Estrutura ADM", { tipo: "ADMINISTRATIVO", receita: [0, 0], retencoes: [0, 0], custo: [9999, 9999], pessoal: null }),
  ];
  const ins = gerarInsights(linhas, meses, [0, 1], SEM_PESSOAL, "2026-03-01");
  const por = (id: string) => ins.find((i) => i.id === id);
  assert.match(por("prejuizo")!.titulo, /1 contrato com prejuízo/);
  assert.match(por("prejuizo")!.texto, /Contrato Ruim/);
  assert.ok(por("concentracao"), "5 contratos positivos: o top 3 concentra o resultado");
  assert.match(por("vencendo")!.titulo, /1 contrato termina em até 90 dias/);
  assert.ok(!ins.some((i) => i.texto.includes("Estrutura ADM")), "centro administrativo nao entra nos insights de contrato");
});

// ------------------------------------------------------------------------------------------------ receita por centro x consolidado

const contrato = (numCtr: string, codccu: string | null) => ({ numCtr, codccu });
const item = (numCtr: string, numPed: string, competencia: string, valor: number): ItemConsolidado => ({ numCtr, numPed, competencia, valor, qtd: 1, origem: "BOLETIM", boletim: null, situacao: "4", dataEmissao: "2026-10-01" });
const doc = (numero: string, codccu: string, competencia: string, valor: number, extra: Partial<DocConc> = {}): DocConc => ({
  chave: `NF|1|A26|${numero}|${codccu}`, tipo: "NF", numero, filial: "1", serie: "A26", dataEmissao: "2026-10-01", valor, valorLiquido: valor, valorDoc: valor,
  codccu, competencia, origem: "EMISSAO", pedidos: null, situacao: "2", duplicadaDe: null, vencimento: null, dataPagamento: null, valorAberto: null, ...extra,
});

const entrada = {
  contratos: [contrato("1", "230"), contrato("2", "240"), contrato("3", "250")],
  itens: [item("1", "10", "2026-08", 1000), item("2", "20", "2026-09", 400), item("3", "30", "2026-09", 600)],
  docs: [doc("100", "230", "2026-08", 1000, { pedidos: "10", valorLiquido: 938.5 }), doc("ND5", "230", "2026-09", 75, { tipo: "ND" }), doc("200", "250", "2026-09", 600, { pedidos: "30", valorLiquido: 561 })],
  ccusPermitidos: new Set(["230", "240", "250"]),
  de: "2026-08", ate: "2026-10", hoje: "2026-10-25",
};

test("receita por centro: a soma de todos os centros e' IDENTICA ao faturamento consolidado (mesma conciliacao)", () => {
  const porCentro = receitaPorCentro(entrada);
  const consolidado = consolidarFaturamento(entrada);
  for (const campo of ["receita", "nf", "nd", "semNota", "faturado"] as const) {
    const somado = Math.round([...porCentro.values()].flat().reduce((s, m) => s + m[campo], 0) * 100) / 100;
    assert.equal(somado, consolidado.totais[campo], campo);
  }
  assert.equal(porCentro.size, consolidado.quantidadeCentros);
  const c230 = porCentro.get("230")!;
  assert.deepEqual(c230.map((m) => [m.mes, m.receita, m.retencoes]), [["2026-08", 1000, 61.5], ["2026-09", 75, 0], ["2026-10", 0, 0]], "retencao = NF bruta - NF liquida; ND sem retencao");
  assert.equal(porCentro.get("240")!.find((m) => m.mes === "2026-09")!.semNota, 400, "medido sem nota conta na receita e nao tem retencao");
});

test("receita por centro respeita o escopo e alinha aos meses da tela (mes sem movimento = zero)", () => {
  const restrito = receitaPorCentro({ ...entrada, ccusPermitidos: new Set(["230"]) });
  assert.deepEqual([...restrito.keys()], ["230"]);
  const al = alinharAosMeses(restrito.get("230"), ["2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(al.receita, [0, 1000, 75]);
  assert.deepEqual(al.retencoes, [0, 61.5, 0]);
  assert.deepEqual(alinharAosMeses(undefined, ["2026-08"]).receita, [0]);
});

// ------------------------------------------------------------------------------------------------ montagem com o custo da tela de custos e 210 + 230

const conta = (nome: string, valores: number[], reembolsavel = false) => ({
  contaFinanceira: nome, total: valores.reduce((a, b) => a + b, 0), codigo: reembolsavel ? 217 : 100, grupoCodigo: "g", grupoNome: "Grupo", reembolsavel, inativa: false,
  meses: valores.map((valor, i) => ({ competencia: `2026-0${i + 1}-01T00:00:00.000Z`, valor })),
});
const custoDe = (codccu: string, contas: ReturnType<typeof conta>[]) => ({ codccu, contrato: `${codccu} - X`, nome: `Centro ${codccu}`, teamId: null, teamName: null, projectName: null, totalGeral: 0, ultimaCompetencia: null, contas }) as unknown as ContratoCusto;
const centro = (codccu: string, extra: Partial<CentroDaApi> = {}): CentroDaApi => ({
  codccu, nome: `Centro ${codccu}`, tipo: "CONTRATO", status: "ATIVO", area: "AMBIENTAL", cliente: null, numero: null, objeto: null, vigenciaInicio: null, vigenciaFim: null, valorContrato: null,
  receita: [1000, 2000], retencoes: [100, 200], semNota: [0, 0], pessoal: null, ...extra,
});
const MESES = ["2026-01", "2026-02"];

test("montar: o custo vem da tela de custos, com o filtro de tipo e centro so' com custo nao some", () => {
  const custos = [custoDe("190", [conta("Combustivel", [300, 500]), conta("R - Hospedagem", [50, 50], true)]), custoDe("777", [conta("Aluguel", [10, 20])])];
  const todos = montarLinhas([centro("190")], custos, MESES, { base: "pagamento", tipo: "todos" });
  assert.deepEqual(todos.find((l) => l.codccu === "190")!.custo, [350, 550]);
  assert.deepEqual(montarLinhas([centro("190")], custos, MESES, { base: "pagamento", tipo: "proprio" })[0].custo, [300, 500]);
  assert.deepEqual(montarLinhas([centro("190")], custos, MESES, { base: "pagamento", tipo: "reembolsavel" })[0].custo, [50, 50]);
  const so = todos.find((l) => l.codccu === "777")!;
  assert.deepEqual([so.custo, so.receita], [[10, 20], [0, 0]], "centro sem ficha, so' com custo, entra no total");
  assert.deepEqual(montarLinhas([centro("555")], custos, MESES, { base: "pagamento", tipo: "todos" }).find((l) => l.codccu === "555")!.custo, [0, 0], "centro sem custo lido = zero");
});

test("210 + 230 juntos: soma receita, custo e retencoes; so' junta quando as duas existem", () => {
  const custos = [custoDe("210", [conta("Frota", [400, 400])]), custoDe("230", [conta("Frota", [100, 100])])];
  const linhas = montarLinhas([centro("210", { receita: [500, 500], valorContrato: 1000 }), centro("230", { receita: [900, 900], valorContrato: 500, vigenciaFim: "2027-01-31" }), centro("190")], custos, MESES, { base: "pagamento", tipo: "todos" });
  const j = juntarCentros(linhas);
  const m = j.find((l) => l.codccu === "210+230")!;
  assert.ok(m && !j.some((l) => l.codccu === "210" || l.codccu === "230"));
  assert.deepEqual([m.receita, m.custo], [[1400, 1400], [500, 500]]);
  assert.deepEqual([m.valorContrato, m.vigenciaFim], [1500, "2027-01-31"]);
  assert.equal(juntarCentros(linhas.filter((l) => l.codccu !== "230")).some((l) => l.codccu === "210"), true, "so' o 210: nada e' juntado");
  // retencoes somadas: 200 em jan e 400 em fev; resultado = (1400 - 200 - 500) + (1400 - 400 - 500) = 700 + 500
  assert.equal(resumir([m], [0, 1], SEM_PESSOAL).resultado, 1200);
});
