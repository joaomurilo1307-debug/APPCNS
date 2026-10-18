import { test } from "node:test";
import assert from "node:assert/strict";
import {
  TRANSACOES_DE_CUSTO,
  aplicarCompetenciasFiscais,
  buscarCompetenciasFiscais,
  buscarDadosSenior,
  calcularCusto,
  chaveBaixa,
  dataBrParaIso,
  enriquecerTitulos,
  mesDaCompetencia,
  numeroSenior,
  resolverContasNovas,
  type Baixa,
  type Consulta,
  type LinhaRateio,
} from "../src/lib/custos/motorCustoContrato";
import { CONTAS_EXCLUIDAS_BASE, CONTAS_FORA_DO_CUSTO, contaInativa, eReembolsavel, espelhoReembolsavel, grupoDaConta, nomeConta } from "../src/lib/custos/planoContas";

const rat = (o: Partial<LinhaRateio>): LinhaRateio => ({ numTit: "001", codFil: "1", codTpt: "NFS", codFor: "100", seqMov: "2", ctaFin: "20", codCcu: "190", vlrRat: "100,50", mesAno: "01/04/2026", codTns: "90550", ...o });
// baixas (E501MCP) das linhas informadas, com a data de pagamento
const baixas = (...linhas: Partial<LinhaRateio>[]): Map<string, Baixa> =>
  new Map(linhas.map((l) => [chaveBaixa(l.numTit ?? "001", l.codFil ?? "1", l.codTpt ?? "NFS", l.codFor ?? "100", l.seqMov ?? "2"), { tns: l.codTns ?? "90550", dataPagamento: "2026-04-10" }]));

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

test("so' conta rateio de BAIXA (pagamento/adiantamento), nunca a entrada da nota; mesmo NUMTIT em dois fornecedores nao mistura", () => {
  const a = rat({ codFor: "100", vlrRat: "1.000,00" });
  const b = rat({ codFor: "200", vlrRat: "5.000,00", codTns: "90500", seqMov: "1" }); // outro fornecedor, so' a entrada da nota (nao foi paga)
  const { itens, descartadas } = calcularCusto([a, b], baixas(a));
  assert.equal(itens.length, 1);
  assert.equal(itens[0].valor, 1000);
  assert.equal(descartadas.foraDaRegra, 1);
});

test("regra v2: baixa por ADIANTAMENTO (90558) conta como custo; o espelho do titulo de adiantamento (90555) e a entrada do adiantamento (90530) NAO", () => {
  assert.deepEqual(TRANSACOES_DE_CUSTO, { "90550": "PAGAMENTO", "90558": "ADIANTAMENTO" });
  // nota de servico de R$ 78.571,12 quitada com adiantamento (caso real PLT02, titulo 627A1) + o titulo de adiantamento (ADT)
  const nota = rat({ numTit: "627A1", codFor: "713599", codTpt: "NFS", codCcu: "102235", ctaFin: "84", seqMov: "2", codTns: "90558", vlrRat: "78.571,12", mesAno: "01/05/2026" });
  const notaEntrada = rat({ numTit: "627A1", codFor: "713599", codTpt: "NFS", codCcu: "102235", ctaFin: "84", seqMov: "1", codTns: "90500", vlrRat: "81.895,29", mesAno: "01/05/2026" });
  const advEntrada = rat({ numTit: "627A1", codFor: "713599", codTpt: "ADT", codCcu: "102235", ctaFin: "84", seqMov: "1", codTns: "90530", vlrRat: "78.571,12", mesAno: "01/05/2026" });
  const advBaixa = rat({ numTit: "627A1", codFor: "713599", codTpt: "ADT", codCcu: "102235", ctaFin: "84", seqMov: "2", codTns: "90555", vlrRat: "78.571,12", mesAno: "01/05/2026" });
  const { itens, detalhe } = calcularCusto([nota, notaEntrada, advEntrada, advBaixa], baixas(nota));
  assert.equal(itens.length, 1);
  assert.equal(itens[0].valor, 78571.12, "so' a nota conta, uma vez");
  assert.equal(detalhe[0].baixa, "ADIANTAMENTO");
  assert.equal(detalhe[0].codTpt, "NFS");
});

test("regra v2: titulo de tipos diferentes com o MESMO numero, fornecedor e sequencia nao colide (NFS x ADT)", () => {
  const nfs = rat({ numTit: "X1", codTpt: "NFS", seqMov: "2", codTns: "90550", vlrRat: "100,00" });
  const adt = rat({ numTit: "X1", codTpt: "ADT", seqMov: "2", codTns: "90555", vlrRat: "100,00" });
  const { itens, detalhe } = calcularCusto([nfs, adt], baixas(nfs));
  assert.equal(itens[0].valor, 100);
  assert.equal(detalhe.length, 1);
});

test("competencia da nota: mes do rateio de ENTRADA do mesmo titulo (pago em outro mes); sem entrada fica null", () => {
  const entrada = rat({ numTit: "N9", seqMov: "1", codTns: "90501", mesAno: "01/08/2026", vlrRat: "33.000,00" });
  const pago = rat({ numTit: "N9", seqMov: "2", codTns: "90550", mesAno: "01/09/2026", vlrRat: "33.000,00" });
  const semEntrada = rat({ numTit: "N10", seqMov: "2", codTns: "90550", mesAno: "01/09/2026", vlrRat: "5,00", ctaFin: "44" });
  const { itens, detalhe } = calcularCusto([entrada, pago, semEntrada], baixas(pago, semEntrada));
  assert.equal(itens.find((i) => i.valor === 33000)?.competencia, "2026-09-01", "mes do pagamento");
  assert.equal(detalhe.find((d) => d.numTit === "N9")?.competenciaNota, "2026-08-01", "mes da nota");
  assert.equal(detalhe.find((d) => d.numTit === "N10")?.competenciaNota, null);
  assert.equal(detalhe.find((d) => d.numTit === "N9")?.dataPagamento, "2026-04-10");
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
    if (sql.includes("E501MCP")) {
      assert.match(sql, /90550.*90558/, "a busca das baixas inclui pagamento e adiantamento");
      return [{ NUMTIT: "001", CODFIL: "1", CODTPT: "NFS", CODFOR: "100", SEQMOV: "2", CODTNS: "90550", DATPGT: "10/04/2026" }];
    }
    if (sql.includes("CODCCU='190'")) return [{ NUMTIT: "001", CODFIL: "1", CODTPT: "NFS", CODFOR: "100", SEQMOV: "2", CTAFIN: "20", CODCCU: "190", VLRRAT: "10", MESANO: "01/04/2026", CODTNS: "90550" }];
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
    if (sql.includes("E501MCP")) return [{ NUMTIT: "1", CODFIL: "1", CODTPT: "NFS", CODFOR: "1", SEQMOV: "1", CODTNS: "90550", DATPGT: "10/04/2026" }];
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

test("competencia fiscal do titulo (USU_COMFIS) vale por cima do mes da nota; sem ela, fica o mes da nota", async () => {
  const sqls: string[] = [];
  const consultar: Consulta = async (sql) => {
    sqls.push(sql);
    return [
      { NUMTIT: "12641$04", CODFIL: "1", CODTPT: "NFC", CODFOR: "711953", USU_COMFIS: "01/09/2025" }, // compra de set/25, parcela paga em jan/26
      { NUMTIT: "SEM", CODFIL: "1", CODTPT: "NFC", CODFOR: "711953", USU_COMFIS: "31/12/1900" }, // placeholder do Senior: ignora
      { NUMTIT: "VAZIO", CODFIL: "1", CODTPT: "NFC", CODFOR: "711953", USU_COMFIS: "" },
    ];
  };
  const fiscais = await buscarCompetenciasFiscais(consultar, ["711953", "711953", "abc"]);
  assert.equal(sqls.length, 1, "um fornecedor so' vai uma vez; codigo nao numerico nao entra na consulta");
  assert.ok(!sqls[0].includes("abc"));
  assert.equal(fiscais.size, 1);
  const parcela = rat({ numTit: "12641$04", codTpt: "NFC", codFor: "711953", mesAno: "01/01/2026", seqMov: "2" });
  const entrada = rat({ numTit: "12641$04", codTpt: "NFC", codFor: "711953", mesAno: "01/10/2025", seqMov: "1", codTns: "90501" });
  const { detalhe } = calcularCusto([parcela, entrada], baixas(parcela));
  assert.equal(detalhe[0].competenciaNota, "2025-10-01", "sem a competencia fiscal: mes do rateio de entrada");
  assert.deepEqual(aplicarCompetenciasFiscais(detalhe, fiscais), { aplicadas: 1, rejeitadas: 0 });
  assert.equal(detalhe[0].competenciaNota, "2025-09-01", "com a competencia fiscal: a da compra");
  assert.equal(detalhe[0].competencia, "2026-01-01", "o mes do pagamento nao muda");
});

test("competencia fiscal com erro de digitacao (ano 2006, 2060) e' ignorada; financiamento de 36 parcelas vale", () => {
  const mk = (numTit: string, pagamento: string, entrada: string) => [
    rat({ numTit, mesAno: pagamento, seqMov: "2" }),
    rat({ numTit, mesAno: entrada, seqMov: "1", codTns: "90501" }),
  ];
  const linhas = [...mk("TIPO1", "01/06/2026", "01/06/2026"), ...mk("TIPO2", "01/08/2026", "01/08/2026"), ...mk("FIN36", "01/08/2026", "01/08/2026"), ...mk("OK", "01/05/2026", "01/05/2026")];
  const pagas = linhas.filter((l) => l.codTns === "90550");
  const { detalhe } = calcularCusto(linhas, baixas(...pagas));
  const fiscais = new Map([
    ["TIPO1|1|NFS|100", "2006-05-01"], // 20 anos antes
    ["TIPO2|1|NFS|100", "2060-08-01"], // 34 anos depois
    ["FIN36|1|NFS|100", "2023-07-01"], // 37 meses antes: financiamento legitimo
    ["OK|1|NFS|100", "2026-06-01"], // 1 mes depois: competencia do mes seguinte, aceita
  ]);
  assert.deepEqual(aplicarCompetenciasFiscais(detalhe, fiscais), { aplicadas: 2, rejeitadas: 2 });
  const comp = (n: string) => detalhe.find((d) => d.numTit === n)?.competenciaNota;
  assert.equal(comp("TIPO1"), "2026-06-01", "rejeitada: fica o mes da nota");
  assert.equal(comp("TIPO2"), "2026-08-01");
  assert.equal(comp("FIN36"), "2023-07-01");
  assert.equal(comp("OK"), "2026-06-01");
});
