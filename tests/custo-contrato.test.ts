import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buscarDadosSenior,
  calcularCusto,
  chaveBaixa,
  dataBrParaIso,
  enriquecerTitulos,
  mesDaCompetencia,
  numeroSenior,
  resolverContasNovas,
  type Consulta,
  type LinhaRateio,
} from "../src/lib/custos/motorCustoContrato";
import { CONTAS_EXCLUIDAS_BASE, CONTAS_FORA_DO_CUSTO, contaInativa, eReembolsavel, espelhoReembolsavel, grupoDaConta, nomeConta } from "../src/lib/custos/planoContas";

const rat = (o: Partial<LinhaRateio>): LinhaRateio => ({ numTit: "001", codFil: "1", codFor: "100", seqMov: "2", ctaFin: "20", codCcu: "190", vlrRat: "100,50", mesAno: "01/04/2026", ...o });
const baixas = (...linhas: Partial<LinhaRateio>[]) => new Set(linhas.map((l) => chaveBaixa(l.numTit ?? "001", l.codFil ?? "1", l.codFor ?? "100", l.seqMov ?? "2")));

test("numeros e datas do Senior", () => {
  assert.equal(numeroSenior("1.498,7"), 1498.7);
  assert.equal(numeroSenior("59"), 59);
  assert.equal(numeroSenior(""), 0);
  assert.equal(numeroSenior(undefined), 0);
  assert.equal(mesDaCompetencia("01/09/2026"), "2026-09");
  assert.equal(mesDaCompetencia("lixo"), null);
  assert.equal(dataBrParaIso("03/12/2024"), "2024-12-03");
  assert.equal(dataBrParaIso("31/12/1900"), null);
});

test("so' conta rateio com baixa real, e a chave inclui o FORNECEDOR (mesmo NUMTIT em dois fornecedores)", () => {
  const a = rat({ codFor: "100", vlrRat: "1.000,00" });
  const b = rat({ codFor: "200", vlrRat: "5.000,00" }); // mesmo NUMTIT/FIL/SEQ, outro fornecedor: SEM baixa
  const { itens, descartadas } = calcularCusto([a, b], baixas(a));
  assert.equal(itens.length, 1);
  assert.equal(itens[0].valor, 1000);
  assert.equal(descartadas.semBaixa, 1);
});

test("agrupa por CCU + conta + mes de competencia e soma", () => {
  const l1 = rat({ numTit: "001", vlrRat: "100,10" });
  const l2 = rat({ numTit: "002", vlrRat: "50,20" });
  const l3 = rat({ numTit: "003", vlrRat: "7,00", mesAno: "01/05/2026" });
  const l4 = rat({ numTit: "004", vlrRat: "9,00", codCcu: "270" });
  const { itens, detalhe } = calcularCusto([l1, l2, l3, l4], baixas(l1, l2, l3, l4));
  const achar = (ccu: string, mes: string) => itens.find((i) => i.codccu === ccu && i.competencia === mes)?.valor;
  assert.equal(achar("190", "2026-04-01"), 150.3);
  assert.equal(achar("190", "2026-05-01"), 7);
  assert.equal(achar("270", "2026-04-01"), 9);
  assert.equal(detalhe.length, 4); // uma linha de detalhe por rateio, sem agregar
  assert.equal(itens[0].contaFinanceira, "Transporte para Contratos");
});

test("piso de 2026: competencia anterior nao entra", () => {
  const velho = rat({ mesAno: "01/12/2025" });
  const { itens, descartadas } = calcularCusto([velho], baixas(velho));
  assert.equal(itens.length, 0);
  assert.equal(descartadas.antesDoPiso, 1);
});

test("contas fora do custo: as 12 do plano antigo + os espelhos R; reembolsavel (67) e conta R normal ficam", () => {
  for (const cod of [81, 70, 72, 73, 80, 71, 69, 55, 150, 151, 167, 162]) assert.ok(CONTAS_FORA_DO_CUSTO.has(String(cod)), `conta ${cod}`);
  assert.deepEqual(
    CONTAS_EXCLUIDAS_BASE.map((c) => espelhoReembolsavel(c)),
    [252, 241, 243, 244, 251, 242, 240, 226, 324, 325, 341, 336]
  );
  for (const cod of [252, 241, 243, 244, 251, 242, 240, 226, 324, 325, 341, 336]) assert.ok(CONTAS_FORA_DO_CUSTO.has(String(cod)), `espelho R ${cod}`);
  assert.equal(CONTAS_FORA_DO_CUSTO.size, 24);
  assert.ok(!CONTAS_FORA_DO_CUSTO.has("67"));
  assert.ok(!CONTAS_FORA_DO_CUSTO.has("220"));

  const linhas = [rat({ numTit: "1", ctaFin: "81" }), rat({ numTit: "2", ctaFin: "252" }), rat({ numTit: "3", ctaFin: "67", vlrRat: "10,00" }), rat({ numTit: "4", ctaFin: "220", vlrRat: "59,00" })];
  const { itens, descartadas } = calcularCusto(linhas, baixas(...linhas));
  assert.deepEqual(itens.map((i) => [i.contaCodigo, i.contaFinanceira, i.valor]).sort(), [
    ["220", "R - Manutencao de Veiculos", 59],
    ["67", "Despesas Reembolsáveis", 10],
  ]);
  assert.equal(descartadas.foraDoCusto, 2);
});

test("plano: nomes, reembolsavel e grupo (conta antiga e contas R em grupos SEPARADOS de reembolsaveis)", () => {
  assert.equal(nomeConta("44"), "Combustível");
  assert.equal(nomeConta("215"), "R - Combustivel");
  assert.equal(nomeConta("208"), "R - Manutencao de Elevador"); // sem o "R - R -" duplicado do Senior
  assert.equal(nomeConta("319"), "R - Imposto de Renda Sócios"); // sem mojibake
  assert.equal(eReembolsavel("215"), true);
  assert.equal(eReembolsavel("67"), true);
  assert.equal(eReembolsavel("44"), false);
  assert.equal(grupoDaConta("44").nome, "Veículos");
  assert.equal(grupoDaConta("215").nome, "Reembolsáveis · contas R");
  assert.equal(grupoDaConta("215").codigo, "reembR");
  assert.equal(grupoDaConta("67").nome, "Reembolsáveis · conta antiga");
  assert.equal(grupoDaConta("179").codigo, "reemb");
  assert.equal(contaInativa("179"), true, "179 BDI - INATIVA esta inativa no Senior");
  assert.equal(contaInativa("67"), false);
  assert.deepEqual([79, 146, 177, 179].map((c) => contaInativa(c)), [true, true, true, true]);
  assert.equal(grupoDaConta("999999").nome, "Outras contas");
});

test("buscarDadosSenior: le CCUs, baixas e o rateio de cada CCU, em ordem e uma consulta por vez", async () => {
  const sqls: string[] = [];
  let emAndamento = 0;
  let maxConcorrente = 0;
  const consultar: Consulta = async (sql) => {
    sqls.push(sql);
    emAndamento++;
    maxConcorrente = Math.max(maxConcorrente, emAndamento);
    await new Promise((r) => setTimeout(r, 1));
    emAndamento--;
    if (sql.includes("E044CCU")) return [{ CODCCU: "270", DESCCU: "B" }, { CODCCU: "190", DESCCU: "A" }];
    if (sql.includes("E501MCP")) return [{ NUMTIT: "001", CODFIL: "1", CODFOR: "100", SEQMOV: "2" }];
    if (sql.includes("CODCCU='190'")) return [{ NUMTIT: "001", CODFIL: "1", CODFOR: "100", SEQMOV: "2", CTAFIN: "20", CODCCU: "190", VLRRAT: "10", MESANO: "01/04/2026" }];
    return [];
  };
  const etapas: string[] = [];
  const d = await buscarDadosSenior(consultar, (e) => { etapas.push(e); });
  assert.equal(maxConcorrente, 1);
  assert.equal(d.rateios.length, 1);
  assert.equal(d.baixas.size, 1);
  assert.deepEqual(Array.from(d.ccus.keys()).sort(), ["190", "270"]);
  assert.ok(sqls.findIndex((s) => s.includes("E501MCP")) < sqls.findIndex((s) => s.includes("E501RAT")));
  assert.ok(etapas.some((e) => e.includes("190")));
});

test("buscarDadosSenior: sem baixas ou sem CCUs aborta (nunca grava um resultado vazio por engano)", async () => {
  const semBaixa: Consulta = async (sql) => (sql.includes("E044CCU") ? [{ CODCCU: "190", DESCCU: "A" }] : []);
  await assert.rejects(() => buscarDadosSenior(semBaixa), /nenhuma baixa/);
  const semCcu: Consulta = async () => [];
  await assert.rejects(() => buscarDadosSenior(semCcu), /nenhum centro de custo/);
});

test("buscarDadosSenior: falha transitoria e' retentada", async () => {
  let chamadas = 0;
  const consultar: Consulta = async (sql) => {
    if (sql.includes("E044CCU")) {
      chamadas++;
      if (chamadas === 1) throw new Error("fetch failed");
      return [{ CODCCU: "190", DESCCU: "A" }];
    }
    if (sql.includes("E501MCP")) return [{ NUMTIT: "1", CODFIL: "1", CODFOR: "1", SEQMOV: "1" }];
    return [];
  };
  const d = await buscarDadosSenior(consultar);
  assert.equal(chamadas, 2);
  assert.equal(d.ccus.size, 1);
});

test("enriquecerTitulos: usa o cache, so' consulta o que falta e le datas e nome do fornecedor", async () => {
  const sqls: string[] = [];
  const consultar: Consulta = async (sql) => {
    sqls.push(sql);
    if (sql.includes("E501TCP")) return [{ NUMTIT: "NOVO1", CODFIL: "1", CODFOR: "300", DATENT: "03/10/2026", VCTORI: "31/12/1900" }];
    if (sql.includes("E095FOR")) return [{ CODFOR: "300", NOMFOR: "FORNECEDOR NOVO LTDA" }];
    return [];
  };
  const cache = new Map([["VELHO|100", { fornecedorNome: "FORN VELHO", dataEntrada: "2026-01-02", dataVencimento: "2026-02-02" }]]);
  const r = await enriquecerTitulos(consultar, [{ numTit: "VELHO", codFor: "100" }, { numTit: "NOVO1", codFor: "300" }], cache);
  assert.deepEqual(r.get("VELHO|100"), cache.get("VELHO|100"));
  assert.deepEqual(r.get("NOVO1|300"), { fornecedorNome: "FORNECEDOR NOVO LTDA", dataEntrada: "2026-10-03", dataVencimento: null });
  assert.equal(sqls.filter((s) => s.includes("E501TCP")).length, 1);
  assert.ok(!sqls.some((s) => s.includes("'VELHO'")), "titulo ja em cache nao volta ao Senior");
});

test("enriquecerTitulos: numero de titulo com aspas e' escapado", async () => {
  const sqls: string[] = [];
  const consultar: Consulta = async (sql) => { sqls.push(sql); return []; };
  await enriquecerTitulos(consultar, [{ numTit: "A'B", codFor: "1" }], new Map());
  assert.ok(sqls[0].includes("'A''B'"));
});

test("resolverContasNovas: conta fora da tabela estatica e' buscada ao vivo e passa a ter nome", async () => {
  const consultar: Consulta = async (sql) => {
    assert.match(sql, /E091PLF/);
    return [{ CTAFIN: "999", DESCTA: "R - Conta  Nova", CLAFIN: "2179999", NIVFIN: "4" }];
  };
  const achadas = await resolverContasNovas(consultar, [rat({ ctaFin: "999" }), rat({ ctaFin: "20" })]);
  assert.deepEqual(achadas, ["999"]);
  assert.equal(nomeConta("999"), "R - Conta Nova");
  assert.equal(eReembolsavel("999"), true);
  assert.equal(grupoDaConta("999").codigo, "reembR"); // toda conta do plano R (clafin 217...) cai nas contas R
});
