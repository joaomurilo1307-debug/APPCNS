import test from "node:test";
import assert from "node:assert/strict";
import { alvoPorVariacao, progressoIndicador, variacaoPercentual } from "../src/lib/contractGoals/calculo";
import { dadosMeta, erroConfiguracao, novaMeta } from "../src/lib/contractGoals/validacao";
import { lerAcompanhamentoMetas, lerLinhaBaseFinanceira, periodosAvaliacao, ultimaMedicaoDoPeriodo, type MetaParaAcompanhamento } from "../src/lib/contractGoals/acompanhamento";
import { montarEscopo } from "../src/lib/custos/acesso";

const usuario = { id: "responsavel-ficticio", role: "COLABORADOR" };
const hoje = "2026-10-26";
const meta = (id = "indicador"): MetaParaAcompanhamento => ({ id, source: "MANUAL", baselineValue: 100, targetValue: 90, direction: "REDUZIR", evaluationMode: "PERIODICO", frequency: "MENSAL", periodStart: "2026-08", periodEnd: "2026-11", measurements: [] });
const date = (mes: string) => new Date(`${mes}-01T00:00:00Z`);

test("percentual respeita aumento, redução, negativos e base zero sem juros compostos implícitos", () => {
  assert.equal(alvoPorVariacao(100, 15, "AUMENTAR"), 115);
  assert.equal(alvoPorVariacao(100, 15, "REDUZIR"), 85);
  assert.equal(alvoPorVariacao(-100, 15, "AUMENTAR"), -85);
  assert.equal(alvoPorVariacao(-100, 15, "REDUZIR"), -115);
  assert.equal(alvoPorVariacao(0, 15, "REDUZIR"), 0);
  assert.equal(variacaoPercentual(0, 10), null);
  assert.equal(variacaoPercentual(-100, -80), 20);
  assert.equal(alvoPorVariacao(100, 101, "REDUZIR"), null);
  assert.equal(alvoPorVariacao(100, -1, "AUMENTAR"), null);
  assert.equal(alvoPorVariacao(100, 10, "MANTER"), null);
});

test("manter uma faixa não confunde estar fora do alvo com melhoria concluída", () => {
  assert.equal(progressoIndicador(100, 100, 101, "MANTER", 2), 1);
  assert.equal(progressoIndicador(100, 100, 103, "MANTER", 2), 0);
  assert.equal(progressoIndicador(100, 100, null, "MANTER", 2), null);
  assert.equal(progressoIndicador(0, 50, 50, "ATINGIR"), 1);
  assert.equal(progressoIndicador(100, 50, 75, "ATINGIR"), 0.5);
});

test("calendário respeita cadência, atravessa ano e não transforma mês aberto em fechado", () => {
  assert.deepEqual(periodosAvaliacao("2026-09", "2027-02", "TRIMESTRAL", hoje).map((p) => [p.start, p.end, p.state, p.partial]), [["2026-09", "2026-11", "ABERTO", false], ["2026-12", "2027-02", "FUTURO", false]]);
  assert.equal(periodosAvaliacao("2026-01", "2030-01").length, 0);
  assert.equal(periodosAvaliacao("2026-13", "2026-14").length, 0);
  assert.equal(periodosAvaliacao("2026-09", "2026-08").length, 0);
  assert.equal(periodosAvaliacao("2026-09", "2026-10", "TRIMESTRAL", hoje)[0].partial, true);
});

test("meta genérica não exige contrato; valida regra, referência e alvo percentual no servidor", () => {
  const body = { title: "Reduzir retrabalho", metricName: "Horas de retrabalho", category: "GERAL", baselineValue: 100, targetValue: 90, unit: "horas", direction: "REDUZIR", targetMode: "PERCENTUAL", targetChange: 10, evaluationMode: "PERIODICO", periodStart: "2026-09", periodEnd: "2026-12" };
  const parsed = novaMeta.parse(body);
  assert.equal(parsed.codccu, undefined);
  assert.equal(erroConfiguracao(parsed), null);
  assert.match(erroConfiguracao(dadosMeta.parse({ ...body, targetValue: 80 })) ?? "", /percentual/);
  assert.match(erroConfiguracao(dadosMeta.parse({ ...body, baselineValue: 0, targetValue: 0 })) ?? "", /referência zero/);
  const financial = { ...body, source: "CUSTO", sourceCcu: "230", unit: "R$", baselinePeriodStart: "2026-07", baselinePeriodEnd: "2026-08" };
  assert.match(erroConfiguracao(dadosMeta.parse(financial)) ?? "", /mesma duração/);
  assert.equal(erroConfiguracao(dadosMeta.parse({ ...financial, baselinePeriodStart: "2026-08" })), null);
  assert.match(erroConfiguracao(dadosMeta.parse({ ...financial, baselinePeriodStart: "2026-09", baselinePeriodEnd: "2026-09" })) ?? "", /antes do início/);
});

test("histórico manual conserva revisão, usa competência e não leva medição de outro mês para lacuna", async () => {
  const measurements = [
    { value: 95, measuredAt: "2026-09-03T12:00:00Z", period: "2026-08", createdAt: "2026-09-03T12:00:00Z" },
    { value: 90, measuredAt: "2026-09-05T12:00:00Z", period: "2026-08", createdAt: "2026-09-05T12:00:00Z" },
    { value: 50, measuredAt: "2026-10-02T12:00:00Z", period: "2026-10" },
  ];
  assert.equal(ultimaMedicaoDoPeriodo(measurements, "2026-08", "2026-08")?.value, 90);
  const noQueries = new Proxy({}, { get() { throw new Error("Meta própria não consulta o financeiro"); } });
  const result = (await lerAcompanhamentoMetas([{ ...meta(), measurements }], usuario, { hoje, db: noQueries as any })).get("indicador")!;
  assert.equal(result.periods[0].value, 90);
  assert.equal(result.periods[1].value, null);
  assert.match(result.periods[1].error ?? "", /Sem medição/);
  assert.equal(result.periods[2].state, "ABERTO");
  assert.equal(result.periods[3].state, "FUTURO");
  assert.equal(result.currentPeriod, "2026-09");
  assert.equal(result.currentValue, null, "Mês fechado sem aferição não usa o mês aberto como resultado final");
  assert.equal(measurements.length, 3, "Revisões não são consumidas ou removidas");
});

test("custo por CCU/conta alimenta avaliações em lote, separadas da base fixa e do acumulado", async () => {
  let consultas = 0;
  const db = {
    custoContaFinanceira: { async findMany() { consultas++; return [
      { codccu: "230", contaFinanceira: "PJ", competencia: date("2026-07"), valor: 100 },
      { codccu: "230", contaFinanceira: "PJ", competencia: date("2026-08"), valor: 95 },
      { codccu: "230", contaFinanceira: "PJ", competencia: date("2026-09"), valor: 85 },
      { codccu: "230", contaFinanceira: "Outra conta", competencia: date("2026-09"), valor: 900 },
    ]; } }, atualizacaoCusto: { async findFirst() { return { finalizadoEm: new Date("2026-10-01T10:00:00Z") }; } },
  } as any;
  const source = { ...meta(), source: "CUSTO", sourceCcu: "230", sourceAccount: "pj", baselinePeriodStart: "2026-07", baselinePeriodEnd: "2026-07" };
  const deps = { db, hoje, escopo: montarEscopo(false, ["230"]), podeAcessar: async () => true };
  const result = (await lerAcompanhamentoMetas([source, { ...source, id: "segunda" }], usuario, deps)).get("indicador")!;
  assert.equal(consultas, 1);
  assert.deepEqual(result.periods.map((p) => p.value), [95, 85, 0, null]);
  assert.equal(result.currentValue, 85);
  assert.equal(result.fraction, 1);
  assert.equal(result.baselineValue, 100);
  assert.equal(result.targetValue, 90);
  assert.equal(result.sourceError, null);
  assert.equal((await lerLinhaBaseFinanceira(source, usuario, deps)).valor, 100);
  assert.equal(result.targetValue, 90, "Prévia da fonte não altera os valores definidos na meta");
});

test("avaliações financeiras sem permissão mantêm valor ausente; não consultam nem geram zeros", async () => {
  let consultas = 0;
  const db = new Proxy({}, { get() { consultas++; throw new Error("Consulta indevida"); } }) as any;
  const result = (await lerAcompanhamentoMetas([{ ...meta(), source: "CUSTO", sourceCcu: "999" }], usuario, { db, hoje, escopo: montarEscopo(false, ["230"]), podeAcessar: async () => true })).get("indicador")!;
  assert.equal(consultas, 0);
  assert.equal(result.currentValue, null);
  assert.ok(result.periods.filter((p) => p.state !== "FUTURO").every((p) => p.value === null && p.error));
});

test("resultado do mês aberto é preliminar e não declara meta atingida antes do encerramento", async () => {
  const aberta = { ...meta(), periodStart: "2026-10", periodEnd: "2026-12", measurements: [{ value: 80, measuredAt: "2026-10-25T12:00:00Z", period: "2026-10" }] };
  const result = (await lerAcompanhamentoMetas([aberta], usuario, { hoje })).get("indicador")!;
  assert.equal(result.currentValue, 80, "Permite acompanhar a medição em andamento");
  assert.equal(result.currentState, "ABERTO");
  assert.equal(result.periods[0].progress, 1, "A prévia fica identificada na janela aberta");
  assert.equal(result.fraction, null, "Resumo não contabiliza alvo final atingido em mês aberto");
  const encerrado = (await lerAcompanhamentoMetas([aberta], usuario, { hoje: "2026-11-01" })).get("indicador")!;
  assert.equal(encerrado.currentState, "FECHADO");
  assert.equal(encerrado.fraction, 1);
});

test("uma janela trimestral incompleta não compara sua soma parcial com o alvo trimestral", async () => {
  const incompleta = { ...meta(), frequency: "TRIMESTRAL", periodStart: "2026-07", periodEnd: "2026-08", measurements: [{ value: 10, measuredAt: "2026-08-25T12:00:00Z", period: "2026-08" }] };
  const result = (await lerAcompanhamentoMetas([incompleta], usuario, { hoje })).get("indicador")!;
  assert.equal(result.periods[0].partial, true);
  assert.equal(result.periods[0].value, 10);
  assert.equal(result.periods[0].progress, null);
  assert.equal(result.fraction, null);
  assert.match(result.sourceError ?? "", /parcial/);
});

test("faturamento periódico concilia uma nota do CCU compartilhado no mês do trabalho e não no mês da emissão", async () => {
  let consultasItens = 0;
  const item = (numCtr: string, numPed: string, valor: number) => ({ numCtr, numPed, competencia: "2026-08", origem: "BOLETIM", boletim: null, situacao: "4", qtd: 1, valor, dataEmissao: date("2026-09") });
  const documento = { chave: "NF|1|A|100|270", tipo: "NF", numero: "100", filial: "1", serie: "A", dataEmissao: date("2026-09"), valor: 300, valorLiquido: 300, valorDoc: 300, codccu: "270", competencia: "2026-08", origem: "PEDIDO", pedidos: "10,20", situacao: "2", duplicadaDe: null, vencimento: null, dataPagamento: null, valorAberto: null };
  const db = {
    medicaoContrato: { async findMany() { return [{ numCtr: "108", codccu: "270" }, { numCtr: "36", codccu: "270" }]; } },
    faturamentoMedicao: { async findMany() { return [documento]; } },
    atualizacaoMedicao: { async findFirst() { return { finalizadoEm: new Date("2026-10-01T10:00:00Z"), resumo: {} }; } },
    medicaoItem: { async findMany() { consultasItens++; return [item("108", "10", 100), item("36", "20", 200), item("36", "30", 50)]; } },
  } as any;
  const source = { ...meta(), source: "FATURAMENTO", sourceCcu: "270", periodEnd: "2026-09", direction: "AUMENTAR", targetValue: 350 };
  const result = await lerAcompanhamentoMetas([source, { ...source, id: "medicao", source: "MEDICAO" }], usuario, { db, hoje, escopo: montarEscopo(false, ["270"]), podeAcessar: async () => true });
  assert.equal(consultasItens, 1, "As duas competências e os dois indicadores usam o mesmo lote de itens");
  assert.deepEqual(result.get("indicador")!.periods.map((p) => p.value), [300, 0]);
  assert.deepEqual(result.get("medicao")!.periods.map((p) => p.value), [350, 0]);
});
