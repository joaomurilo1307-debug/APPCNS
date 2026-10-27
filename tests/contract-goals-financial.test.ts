import test from "node:test";
import assert from "node:assert/strict";
import { lerIndicadoresFinanceiros, type MetaComFonte } from "../src/lib/contractGoals/financial";
import { montarEscopo } from "../src/lib/custos/acesso";
import { progressoIndicador } from "../src/lib/contractGoals/calculo";

const usuario = { id: "usuario-de-teste", role: "COLABORADOR" };
const hoje = "2026-10-25";
const meta = (id: string, source = "CUSTO", ccu = "230"): MetaComFonte => ({ id, source, contrato: { codccu: ccu }, periodStart: "2026-08", periodEnd: "2026-09" });
const data = (mes: string) => new Date(mes + "-01T00:00:00Z");

test("fonte financeira exige modulo e CCU autorizado antes de consultar valores; metas manuais nao consultam fontes", async () => {
  let consultas = 0;
  const db = new Proxy({}, { get() { consultas++; throw new Error("Consulta financeira indevida"); } }) as any;
  const negadas = await lerIndicadoresFinanceiros([meta("custo"), meta("medicao", "MEDICAO", "999")], usuario, { db, hoje, escopo: montarEscopo(false, ["230"]), podeAcessar: async () => false });
  assert.equal(consultas, 0);
  assert.equal(negadas.size, 2);
  assert.ok([...negadas.values()].every((r) => r.valor === null && r.erro));
  const manuais = await lerIndicadoresFinanceiros([meta("livre", "MANUAL")], usuario, { db, hoje, podeAcessar: async () => { throw new Error("Nao deve verificar fonte manual"); } });
  assert.equal(manuais.size, 0);
  assert.equal(consultas, 0);
});

test("custo usa pago no periodo e conta escolhida, diferencia zero real de fonte ou conta indisponivel e consulta em lote", async () => {
  let consultas = 0;
  const registros = [
    { codccu: "230", contaFinanceira: "Combustível", competencia: data("2026-08"), valor: 100.01 },
    { codccu: "230", contaFinanceira: "Combustível", competencia: data("2026-09"), valor: 200.02 },
    { codccu: "230", contaFinanceira: "Salários", competencia: data("2026-08"), valor: 900 },
  ];
  const db = { custoContaFinanceira: { async findMany(args: any) { consultas++; assert.deepEqual(args.where.codccu.in, ["230"]); return registros; } }, atualizacaoCusto: { async findFirst() { return { finalizadoEm: new Date("2026-10-01T10:00:00Z") }; } } } as any;
  const metas = [meta("total"), { ...meta("combustivel"), sourceAccount: "combustivel" }, { ...meta("zero"), periodStart: "2026-07", periodEnd: "2026-07" }, { ...meta("conta-inexistente"), sourceAccount: "Inexistente" }, meta("futuro"), meta("sem-acesso", "CUSTO", "999")];
  metas[4].periodStart = "2027-01"; metas[4].periodEnd = "2027-02";
  const resultados = await lerIndicadoresFinanceiros(metas, usuario, { db, hoje, escopo: montarEscopo(false, ["230"]), podeAcessar: async () => true });
  assert.equal(consultas, 1);
  assert.equal(resultados.get("total")?.valor, 1200.03);
  assert.equal(resultados.get("combustivel")?.valor, 300.03);
  assert.equal(resultados.get("zero")?.valor, 0);
  for (const id of ["conta-inexistente", "futuro", "sem-acesso"]) assert.equal(resultados.get(id)?.valor, null);
});

test("duas referencias do mesmo CCU nao duplicam faturamento; medido e NF ficam separados com conciliacao real", async () => {
  let consultasItens = 0;
  const item = (numCtr: string, numPed: string, valor: number) => ({ numCtr, numPed, competencia: "2026-08", origem: "BOLETIM", boletim: null, situacao: "4", qtd: 1, valor, dataEmissao: data("2026-09") });
  const documento = { chave: "NF|1|A|100|270", tipo: "NF", numero: "100", filial: "1", serie: "A", dataEmissao: data("2026-09"), valor: 300, valorLiquido: 300, valorDoc: 300, codccu: "270", competencia: "2026-08", origem: "PEDIDO", pedidos: "10,20", situacao: "2", duplicadaDe: null, vencimento: null, dataPagamento: null, valorAberto: null };
  const db = {
    medicaoContrato: { async findMany() { return [{ numCtr: "108", codccu: "270" }, { numCtr: "36", codccu: "270" }]; } },
    faturamentoMedicao: { async findMany() { return [documento]; } },
    atualizacaoMedicao: { async findFirst() { return { finalizadoEm: new Date("2026-10-01T10:00:00Z"), resumo: {} }; } },
    medicaoItem: { async findMany(args: any) { consultasItens++; assert.deepEqual(args.where.numCtr.in, ["108", "36"]); return [item("108", "10", 100), item("36", "20", 200), item("36", "30", 50)]; } },
  } as any;
  const resultados = await lerIndicadoresFinanceiros([meta("nota", "FATURAMENTO", "270"), meta("pedidos", "MEDICAO", "270"), meta("outra-meta", "FATURAMENTO", "270")], usuario, { db, hoje, escopo: montarEscopo(false, ["270"]), podeAcessar: async () => true });
  assert.equal(consultasItens, 1);
  assert.equal(resultados.get("nota")?.valor, 300);
  assert.equal(resultados.get("outra-meta")?.valor, 300);
  assert.equal(resultados.get("pedidos")?.valor, 350);
});

test("custo fora do histórico ou sem leitura de fechamento fica pendente, enquanto mês coberto sem despesas vale zero", async () => {
  let ultimaLeitura = new Date("2026-09-30T20:00:00Z");
  const db = {
    custoContaFinanceira: { async findMany() { return [{ codccu: "230", contaFinanceira: "Combustível", competencia: data("2026-08"), valor: 100 }]; } },
    atualizacaoCusto: { async findFirst() { return { finalizadoEm: ultimaLeitura }; } },
  } as any;
  const metas = [
    { ...meta("antes-do-piso"), periodStart: "2025-12", periodEnd: "2025-12" },
    { ...meta("mes-fechado-sem-cobertura"), periodStart: "2026-09", periodEnd: "2026-09" },
    { ...meta("mes-novo-sem-leitura"), periodStart: "2026-10", periodEnd: "2026-10" },
    { ...meta("mes-coberto-sem-despesas"), periodStart: "2026-07", periodEnd: "2026-07" },
  ];
  const dependencias = { db, hoje, escopo: montarEscopo(false, ["230"]), podeAcessar: async () => true };
  let resultados = await lerIndicadoresFinanceiros(metas, usuario, dependencias);
  for (const id of ["antes-do-piso", "mes-fechado-sem-cobertura", "mes-novo-sem-leitura"]) {
    assert.equal(resultados.get(id)?.valor, null);
    assert.ok(resultados.get(id)?.erro);
    assert.equal(progressoIndicador(100, 90, resultados.get(id)!.valor, "REDUZIR"), null, "sem cobertura não pode cumprir uma meta de redução");
  }
  assert.equal(resultados.get("mes-coberto-sem-despesas")?.valor, 0);
  ultimaLeitura = new Date("2026-10-01T01:00:00Z");
  resultados = await lerIndicadoresFinanceiros(metas, usuario, dependencias);
  assert.equal(resultados.get("mes-fechado-sem-cobertura")?.valor, null, "a virada em UTC ainda é mês anterior em São Paulo");
  ultimaLeitura = new Date("2026-10-01T10:00:00Z");
  resultados = await lerIndicadoresFinanceiros(metas, usuario, dependencias);
  assert.equal(resultados.get("mes-fechado-sem-cobertura")?.valor, 0, "após a leitura de fechamento, ausência de despesas é zero legítimo");
  assert.equal(resultados.get("mes-novo-sem-leitura")?.valor, 0, "mês corrente sincronizado continua disponível como prévia");
  assert.equal(resultados.get("antes-do-piso")?.valor, null, "uma leitura nova não cria histórico anterior ao piso");
});

test("medição e faturamento exigem leitura que cubra o período e notas com falha não confirmam resultado antigo", async () => {
  let ultimaLeitura = new Date("2026-09-30T20:00:00Z");
  let faturamentoErro: string | undefined;
  const documento = { chave: "NF|1|A|100|270", tipo: "NF", numero: "100", filial: "1", serie: "A", dataEmissao: data("2026-09"), valor: 300, valorLiquido: 300, valorDoc: 300, codccu: "270", competencia: "2026-08", origem: "PEDIDO", pedidos: "10", situacao: "2", duplicadaDe: null, vencimento: null, dataPagamento: null, valorAberto: null };
  const db = {
    medicaoContrato: { async findMany() { return [{ numCtr: "108", codccu: "270" }]; } },
    faturamentoMedicao: { async findMany() { return [documento]; } },
    atualizacaoMedicao: { async findFirst() { return { finalizadoEm: ultimaLeitura, resumo: { faturamentoErro } }; } },
    medicaoItem: { async findMany() { return [{ numCtr: "108", numPed: "10", competencia: "2026-08", origem: "BOLETIM", boletim: null, situacao: "4", qtd: 1, valor: 300, dataEmissao: data("2026-09") }]; } },
  } as any;
  const metas = ["MEDICAO", "FATURAMENTO"].flatMap((source) => [
    { ...meta(source + "-fechado", source, "270"), periodStart: "2026-09", periodEnd: "2026-09" },
    { ...meta(source + "-atual", source, "270"), periodStart: "2026-10", periodEnd: "2026-10" },
    { ...meta(source + "-coberto", source, "270"), periodStart: "2026-07", periodEnd: "2026-07" },
    { ...meta(source + "-com-valor", source, "270"), periodStart: "2026-08", periodEnd: "2026-08" },
  ]);
  const dependencias = { db, hoje, escopo: montarEscopo(false, ["270"]), podeAcessar: async () => true };
  let resultados = await lerIndicadoresFinanceiros(metas, usuario, dependencias);
  for (const source of ["MEDICAO", "FATURAMENTO"]) {
    for (const suffix of ["-fechado", "-atual"]) {
      const resultado = resultados.get(source + suffix)!;
      assert.equal(resultado.valor, null);
      assert.ok(resultado.erro);
      assert.equal(progressoIndicador(100, 90, resultado.valor, "REDUZIR"), null);
    }
    assert.equal(resultados.get(source + "-coberto")?.valor, 0);
    assert.equal(resultados.get(source + "-com-valor")?.valor, 300);
  }
  ultimaLeitura = new Date("2026-10-01T10:00:00Z");
  resultados = await lerIndicadoresFinanceiros(metas, usuario, dependencias);
  for (const source of ["MEDICAO", "FATURAMENTO"]) {
    assert.equal(resultados.get(source + "-fechado")?.valor, 0);
    assert.equal(resultados.get(source + "-atual")?.valor, 0);
  }
  faturamentoErro = "Falha simulada na leitura de notas";
  resultados = await lerIndicadoresFinanceiros(metas, usuario, dependencias);
  assert.equal(resultados.get("MEDICAO-com-valor")?.valor, 300, "falha de notas não invalida a fonte de medição independente");
  assert.equal(resultados.get("FATURAMENTO-com-valor")?.valor, null, "notas antigas não comprovam uma leitura completa");
  assert.match(resultados.get("FATURAMENTO-com-valor")?.erro ?? "", /falhou/);
});
