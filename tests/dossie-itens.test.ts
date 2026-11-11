// Rateio como fatia do item, coluna Reembolsavel, historico dos 3 ultimos pagamentos e deteccao de locacao. Regras puras.
import assert from "node:assert/strict";
import test from "node:test";
import { distribuirRateios, itemReembolsavel, lerRateios, resumoReembolso, type ItemOc, type LinhaRateio } from "../src/lib/dossie/itens";
import { dataSenior, indicadoresDoHistorico, sqlHistorico, ultimosPagamentos } from "../src/lib/dossie/historico";
import { itemDeLocacao, montarFaturaLocacao, precisaFaturaLocacao } from "../src/lib/dossie/locacao";

const item = (sequencia: number, total: number, tipo: ItemOc["tipo"] = "PRODUTO"): ItemOc => ({ tipo, sequencia, codigo: `P${sequencia}`, descricao: `Item ${sequencia}`, unidade: "UN", quantidade: 1, unitario: total, total });
const rat = (seqIpo: number, campos: Partial<Record<"CODCCU" | "CTAFIN" | "PERCTA" | "PERRAT" | "VLRCTA" | "VLRRAT" | "SEQISO", string>>) => ({ SEQRAT: "1", SEQIPO: String(seqIpo), SEQISO: "0", CODCCU: "190", CTAFIN: "68", PERCTA: "", PERRAT: "", VLRCTA: "", VLRRAT: "", ...campos });
const valores = (r: { valor: number }[]) => r.map((x) => x.valor);

test("lerRateios: produto pelo SEQIPO, servico pelo SEQISO, sem os dois = rateio geral da OC; conta em branco = null", () => {
  const r = lerRateios([rat(1, {}), { ...rat(0, { SEQISO: "2" }) }, rat(0, { CTAFIN: "" })]);
  assert.deepEqual(r.map((x) => [x.tipo, x.sequencia, x.ctaFin]), [["PRODUTO", 1, 68], ["SERVICO", 2, 68], ["GERAL", null, null]]);
});

test("Rateio real (OC 15857): PERRAT = 100 em todas as linhas -> divide pelo VLRRAT; cada item fecha com o proprio valor", () => {
  const itens = [item(1, 350), item(2, 23016), item(3, 300)];
  const linhas = lerRateios([
    rat(1, { CODCCU: "190", PERRAT: "100", VLRRAT: "94,15" }), rat(1, { CODCCU: "210", PERRAT: "100", VLRRAT: "255,85" }),
    rat(2, { CODCCU: "190", PERRAT: "100", VLRRAT: "6191,3" }), rat(2, { CODCCU: "210", PERRAT: "100", VLRRAT: "16824,7" }),
    rat(3, { CODCCU: "190", PERRAT: "100", VLRRAT: "80,7" }), rat(3, { CODCCU: "210", PERRAT: "100", VLRRAT: "219,3" }),
  ]);
  const d = distribuirRateios(itens, linhas, 23666);
  assert.deepEqual(valores(d), [94.15, 255.85, 6191.3, 16824.7, 80.7, 219.3]);
  assert.deepEqual(d.map((x) => x.percentual), [26.9, 73.1, 26.9, 73.1, 26.9, 73.1]); // nunca "100%" em cada linha
  assert.ok(d.every((x) => x.criterio === "VALOR"));
});

test("Valor cheio gravado em cada linha (o defeito relatado): percentuais que fecham 100% mandam, e o item e' dividido", () => {
  const d = distribuirRateios([item(1, 1000)], lerRateios([rat(1, { PERRAT: "30", VLRRAT: "1000" }), rat(1, { CODCCU: "210", PERRAT: "70", VLRRAT: "1000" })]), 1000);
  assert.deepEqual(valores(d), [300, 700]);
  assert.deepEqual(d.map((x) => x.criterio), ["PERCENTUAL", "PERCENTUAL"]);
  // PERCTA x PERRAT: duas contas (60/40) e, na segunda, dois centros de custo (50/50)
  const e = distribuirRateios([item(1, 1000)], lerRateios([rat(1, { PERCTA: "60", PERRAT: "100" }), rat(1, { PERCTA: "40", PERRAT: "50" }), rat(1, { PERCTA: "40", PERRAT: "50", CODCCU: "210" })]), 1000);
  assert.deepEqual(valores(e), [600, 200, 200]);
});

test("OC liquidada (VLRRAT zerado): linha unica = valor do item; varias sem percentual nem valor = partes iguais, centavos fecham", () => {
  assert.deepEqual(valores(distribuirRateios([item(1, 899)], lerRateios([rat(1, { PERRAT: "100", VLRRAT: "0" })]), 899)), [899]);
  const d = distribuirRateios([item(1, 100)], lerRateios([rat(1, {}), rat(1, { CODCCU: "210" }), rat(1, { CODCCU: "230" })]), 100);
  assert.deepEqual(valores(d), [33.33, 33.33, 33.34]);
  assert.equal(d[0].criterio, "IGUAL");
});

test("Rateio geral da OC divide o valor da OC; linha de item que nao existe na OC fica com o valor gravado", () => {
  const geral = distribuirRateios([item(1, 500), item(2, 500)], lerRateios([rat(0, { PERRAT: "60" }), rat(0, { CODCCU: "210", PERRAT: "40" })]), 1000);
  assert.deepEqual(valores(geral), [600, 400]);
  const orfa = distribuirRateios([item(1, 500)], lerRateios([rat(9, { VLRRAT: "123,45" })]), 500);
  assert.deepEqual(valores(orfa), [123.45]);
  assert.equal(orfa[0].item, null);
});

test("Reembolsavel por item: conta >= 180 na linha do item; sem linha propria usa o rateio geral; USU_REEMB = S marca todos", () => {
  const itens = [item(1, 100), item(2, 100), item(3, 100, "SERVICO")];
  const linhas: LinhaRateio[] = lerRateios([rat(1, { CTAFIN: "68", PERRAT: "50" }), rat(1, { CTAFIN: "181", PERRAT: "50" }), rat(2, { CTAFIN: "179", PERRAT: "100" }), rat(0, { CTAFIN: "200", PERRAT: "100" })]);
  const d = distribuirRateios(itens, linhas, 300);
  assert.deepEqual(itens.map((i) => itemReembolsavel(i, d, "")), [true, false, true]); // servico 3 sem linha propria -> geral (200)
  assert.deepEqual(itens.map((i) => itemReembolsavel(i, d, "S")), [true, true, true]);
  assert.deepEqual(d.map((x) => x.reembolsavel), [false, true, false, true]);
});

test("Despesa reembolsavel da OC: toda, nenhuma ou mista (valores pelo rateio)", () => {
  const itens = [item(1, 1000)];
  const misto = distribuirRateios(itens, lerRateios([rat(1, { CTAFIN: "68", PERRAT: "25" }), rat(1, { CTAFIN: "190", PERRAT: "75" })]), 1000);
  assert.deepEqual(resumoReembolso(itens, misto, "", 1000), { situacao: "MISTA", reembolsavel: 750, naoReembolsavel: 250 });
  const nada = distribuirRateios(itens, lerRateios([rat(1, { CTAFIN: "68", PERRAT: "100" })]), 1000);
  assert.equal(resumoReembolso(itens, nada, "", 1000).situacao, "NAO");
  assert.deepEqual(resumoReembolso(itens, nada, "S", 1000), { situacao: "SIM", reembolsavel: 1000, naoReembolsavel: 0 });
  assert.equal(resumoReembolso(itens, [], "", 1000).situacao, "NAO");
});

test("Historico: datas da Senior; sentinelas viram null", () => {
  assert.equal(dataSenior("05/11/2026"), "2026-11-05");
  assert.equal(dataSenior("31/12/1900"), null);
  assert.equal(dataSenior("30/12/1899"), null);
  assert.equal(dataSenior(""), null);
});

test("Historico: so' titulo com pagamento (ULTPGT valida e saldo menor que o valor), sem cancelado e sem os da OC; mais recente primeiro", () => {
  const t = (NUMTIT: string, campos: Record<string, string>) => ({ CODFIL: "1", NUMTIT, CODTPT: "DP", CODFOR: "10", SITTIT: "LQ", DATEMI: "01/10/2026", VCTORI: "20/10/2026", VCTPRO: "", VLRORI: "1000", VLRABE: "0", ULTPGT: "15/10/2026", NUMNFC: "0", SNFNFC: "", USU_NUMOCP: "0", ...campos });
  const p = ultimosPagamentos(
    [
      t("ABERTO", { SITTIT: "AB", VLRABE: "1000", ULTPGT: "31/12/1900" }), // nunca pago
      t("CANCEL", { SITTIT: "CA", ULTPGT: "30/10/2026" }),
      t("DA_OC", { ULTPGT: "01/11/2026" }),
      t("PARCIAL", { SITTIT: "AB", VLRABE: "400", ULTPGT: "25/10/2026" }),
      t("ATRASO", { ULTPGT: "22/10/2026" }),
      t("EM_DIA", { ULTPGT: "15/10/2026" }),
      t("VELHO", { ULTPGT: "15/01/2026", DATEMI: "31/12/1900" }),
    ],
    [{ codFil: 1, codFor: 10, numTit: "da_oc" }]
  );
  assert.deepEqual(p.map((x) => x.numTit), ["PARCIAL", "ATRASO", "EM_DIA"]);
  assert.deepEqual(p.map((x) => [x.pago, x.aberto, x.prazoDias, x.emDia]), [[600, 400, 24, false], [1000, 0, 21, false], [1000, 0, 14, true]]);
  assert.deepEqual(indicadoresDoHistorico(p), { quantidade: 3, prazoMedioDias: 20, pagosEmDia: 1, comVencimento: 3, ultimoPagamento: "2026-10-25" });
  // Vencimento prorrogado (VCTPRO) vale mais que o original; emissao invalida = prazo desconhecido
  const q = ultimosPagamentos([t("PRORROGADO", { VCTPRO: "30/10/2026", ULTPGT: "25/10/2026" }), t("SEM_EMISSAO", { DATEMI: "31/12/1900" })], []);
  assert.deepEqual(q.map((x) => [x.numTit, x.emDia, x.prazoDias]), [["PRORROGADO", true, 24], ["SEM_EMISSAO", true, null]]);
});

test("Historico: consulta pelo(s) fornecedor(es) do grupo, sem repetir; sem fornecedor = erro (nao consulta a tabela inteira)", () => {
  assert.equal(sqlHistorico(1, [10, 20, 10]), "SELECT CODFIL, NUMTIT, CODTPT, CODFOR, SITTIT, DATEMI, VCTORI, VCTPRO, VLRORI, VLRABE, ULTPGT, NUMNFC, SNFNFC, USU_NUMOCP FROM E501TCP WHERE CODEMP = 1 AND CODFOR IN (10, 20)");
  assert.throws(() => sqlHistorico(1, []), /Fornecedor/);
  assert.throws(() => sqlHistorico(1, [0, NaN]), /Fornecedor/);
});

test("Locacao: pela descricao do item (com ou sem acento); 'alocacao'/'colocacao' nao; so' quando nao ha nota", () => {
  for (const d of ["LOCAÇÃO DE VEÍCULO", "Locacao de gerador 150kva", "ALUGUEL DE CONTAINER", "VEICULO LOCADO - MENSALIDADE"]) assert.ok(itemDeLocacao({ descricao: d }), d);
  for (const d of ["ALOCACAO DE HORAS", "COLOCAÇÃO DE PISO", "PERNEIRA"]) assert.ok(!itemDeLocacao({ descricao: d }), d);
  assert.equal(precisaFaturaLocacao([{ descricao: "LOCAÇÃO DE VEÍCULO" }], 0), true);
  assert.equal(precisaFaturaLocacao([{ descricao: "LOCAÇÃO DE VEÍCULO" }], 1), false);
  assert.equal(precisaFaturaLocacao([{ descricao: "PERNEIRA" }], 0), false);
});

test("Fatura de locacao: OC que mistura aluguel e materiais (OC 16200) separa os bens locados do resto que o titulo paga", () => {
  const itens = [{ ...item(1, 3000, "SERVICO"), descricao: "LOCACAO DE BENS MOVEIS" }, { ...item(2, 56), descricao: "CHAVE COMBINADA" }, { ...item(3, 35.9), descricao: "LUVA PARA PROCEDIMENTO" }];
  const h = montarFaturaLocacao({
    numOcp: 16200,
    locador: { NOMFOR: "DANIEL PEREIRA LIRA", CGCCPF: "2555771255" },
    locatario: { NOMFIL: "CONSOMINAS ENGENHARIA LTDA" },
    titulos: [{ numero: "008093", tipo: "OUT", datas: { emissao: "2026-10-29", vencimentoAtual: "2026-10-30" }, valores: { original: 3091.9, aberto: 0 }, situacao: "LQ" }],
    itens,
    observacao: null,
  });
  const locados = h.slice(h.indexOf("Bens / serviços locados"), h.indexOf("Outros itens da mesma OC"));
  assert.match(locados, /LOCACAO DE BENS MOVEIS/);
  assert.doesNotMatch(locados, /CHAVE COMBINADA|LUVA/);
  assert.match(h.slice(h.indexOf("Outros itens da mesma OC")), /CHAVE COMBINADA[\s\S]*LUVA PARA PROCEDIMENTO/);
  assert.match(h, /Total da locação<\/th><td>R\$\s3\.000,00/);
  assert.match(h, /Outros itens da OC<\/th><td>R\$\s91,90/);
  assert.match(h, /Nº 008093/);
  // So' locacao: sem a tabela de outros itens
  assert.doesNotMatch(montarFaturaLocacao({ numOcp: 1, locador: {}, locatario: null, titulos: [], itens: [itens[0]], observacao: null }), /Outros itens/);
});
