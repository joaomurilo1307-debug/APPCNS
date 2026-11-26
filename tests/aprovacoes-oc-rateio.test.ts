// Mapa da OC (MapaOC) e tela Aprovacoes (OC Senior): valor por centro de custo de OC liquidada pela NF de compra (24/11/2026).
// Ao liquidar a OC, a Senior zera o VLRRAT de todas as linhas do rateio e mantem o PERRAT; a busca de OCs gravava R$ 0 em cada
// linha do rateioDetalhe. Agora o valor da linha e' a fatia do item pelos percentuais (mesma regra do dossie).
// Exemplos fictícios com as mesmas proporções dos três cenários.
// Senior simulada (funcao de consulta falsa); nao usa banco.
import assert from "node:assert/strict";
import test from "node:test";
import type { LinhaSenior } from "../src/lib/senior/getDbInfo";
import { lerOcsDaSenior, montarItensOc } from "../src/lib/senior/sincronizacao/aprovacoes";

const ocBase = { USU_NOMFOR: "", ROTNAP: "12", SITAPR: "APR", OBSOCP: "" };
const OCS: LinhaSenior[] = [
  { ...ocBase, NUMOCP: "90001", DATEMI: "17/11/2026", CODFOR: "999991", VLRLIQ: "0", VLRORI: "435,6", VLRFIN: "0", SITOCP: "4", NUMAPR: "99981", USUGER: "981", USU_DATVECT: "23/11/2026", USU_NUMTIT: "FIC-A1", USU_NUMNFC: "99971" },
  { ...ocBase, NUMOCP: "90002", DATEMI: "27/10/2026", CODFOR: "999992", VLRLIQ: "262,5", VLRORI: "725,5", VLRFIN: "262,5", SITOCP: "2", NUMAPR: "99982", USUGER: "982", USU_DATVECT: "23/11/2026", USU_NUMTIT: "FIC-B1", USU_NUMNFC: "99972" },
  { ...ocBase, NUMOCP: "90003", DATEMI: "03/11/2026", CODFOR: "999993", VLRLIQ: "0", VLRORI: "0", VLRFIN: "0", SITAPR: "REP", SITOCP: "5", NUMAPR: "99983", USUGER: "983", USU_DATVECT: "06/12/2026", USU_NUMTIT: "", USU_NUMNFC: "0" },
];

const rat = (NUMOCP: string, SEQRAT: string, SEQIPO: string, SEQISO: string, CODCCU: string, CTAFIN: string, PERRAT: string, VLRCTA: string, VLRRAT: string): LinhaSenior => ({ NUMOCP, SEQRAT, SEQIPO, SEQISO, CODCCU, CTAFIN, PERCTA: "100", PERRAT, VLRCTA, VLRRAT });
const RATEIOS: LinhaSenior[] = [
  // 90001: um servico, tres centros de custo, tudo zerado pela NF
  rat("90001", "1", "0", "1", "901", "75", "10,101", "0", "0"),
  rat("90001", "2", "0", "1", "902", "75", "31,5657", "0", "0"),
  rat("90001", "3", "0", "1", "903", "75", "58,3333", "0", "0"),
  // 90002: VLRRAT e' o saldo de cada linha (soma 262,50 = VLRLIQ); itens 2 e 3 ja recebidos, com 0
  rat("90002", "25", "1", "0", "904", "111", "6,4", "262,5", "16,8"),
  rat("90002", "26", "1", "0", "905", "111", "6,4", "262,5", "16,8"),
  rat("90002", "27", "1", "0", "906", "111", "14,7", "262,5", "38,59"),
  rat("90002", "28", "1", "0", "907", "111", "16,5", "262,5", "43,31"),
  rat("90002", "29", "1", "0", "908", "111", "24,8", "262,5", "65,1"),
  rat("90002", "30", "1", "0", "909", "111", "31,2", "262,5", "81,9"),
  rat("90002", "31", "2", "0", "907", "111", "100", "0", "0"),
  rat("90002", "32", "3", "0", "907", "111", "100", "0", "0"),
  // 90003: cancelada (SITOCP 5), rateio tambem zerado; o item ainda tem o preco unitario
  rat("90003", "1", "1", "0", "910", "109", "100", "0", "0"),
];
const PRODUTOS: LinhaSenior[] = [
  { NUMOCP: "90003", SEQIPO: "1", QTDPED: "1", PREUNI: "405,6", VLRORI: "0", VLRLIQ: "0", VLRBRU: "0" },
  { NUMOCP: "90002", SEQIPO: "1", QTDPED: "109", PREUNI: "3,5", VLRORI: "381,5", VLRLIQ: "262,5", VLRBRU: "262,5" },
  { NUMOCP: "90002", SEQIPO: "2", QTDPED: "20", PREUNI: "9", VLRORI: "180", VLRLIQ: "0", VLRBRU: "0" },
  { NUMOCP: "90002", SEQIPO: "3", QTDPED: "8", PREUNI: "20,5", VLRORI: "164", VLRLIQ: "0", VLRBRU: "0" },
];
const SERVICOS: LinhaSenior[] = [{ NUMOCP: "90001", SEQISO: "1", QTDPED: "1", PREUNI: "435,6", VLRORI: "435,6", VLRLIQ: "0", VLRBRU: "0" }];
const CCUS: LinhaSenior[] = [
  { CODCCU: "901", DESCCU: "Centro de custo A" },
  { CODCCU: "902", DESCCU: "Centro de custo B" },
  { CODCCU: "903", DESCCU: "Centro de custo C" },
];

function seniorSimulada() {
  const consultas: string[] = [];
  const naLista = (sql: string, linhas: LinhaSenior[]) => {
    const lista = new Set((/NUMOCP IN \(([^)]*)\)/.exec(sql)?.[1] ?? "").split(",").map((n) => n.trim()));
    return linhas.filter((l) => lista.has(l.NUMOCP));
  };
  const consultar = async (sql: string): Promise<LinhaSenior[]> => {
    consultas.push(sql);
    if (sql.includes("FROM E044CCU")) return CCUS;
    if (sql.includes("FROM E091PLF")) return [{ CTAFIN: "75", DESCTA: "Medicina e Segurança do Trabalho" }];
    if (sql.includes("MAX(NUMOCP)")) return [{ MX: "90003" }];
    if (sql.includes("FROM E420OCP WHERE (SITAPR")) return OCS;
    if (sql.includes("FROM E420RAT")) return naLista(sql, RATEIOS);
    if (sql.includes("FROM E420IPO")) return naLista(sql, PRODUTOS);
    if (sql.includes("FROM E420ISO")) return naLista(sql, SERVICOS);
    return [];
  };
  return { consultar, consultas };
}

/** Como o MapaOC agrupa o rateioDetalhe: soma do valor por centro de custo. */
function valorPorCc(rateioDetalhe: string | null | undefined): Record<string, number> {
  const porCc: Record<string, number> = {};
  for (const l of JSON.parse(rateioDetalhe ?? "[]") as { codccu: string; valor?: number }[]) porCc[l.codccu] = Math.round(((porCc[l.codccu] ?? 0) + (l.valor ?? 0)) * 100) / 100;
  return porCc;
}

test("OC 90001 liquidada: rateio zerado pela NF vira a fatia do servico pelos percentuais (44,00 / 137,50 / 254,10)", async () => {
  const { consultar, consultas } = seniorSimulada();
  const { dados } = await lerOcsDaSenior(consultar, [], () => {}, new Date("2026-11-24T12:00:00"));

  assert.match(consultas.find((s) => s.includes("FROM E420RAT"))!, /SEQIPO, SEQISO, .*PERCTA, PERRAT, VLRCTA, VLRRAT/);
  assert.match(consultas.find((s) => s.includes("FROM E420OCP WHERE (SITAPR"))!, /SITOCP/);
  // itens so' da OC com o rateio todo zerado
  assert.deepEqual(consultas.filter((s) => /FROM E420I[PS]O/.test(s)).map((s) => /NUMOCP IN \(([^)]*)\)/.exec(s)?.[1]), ["90001", "90001"]);

  assert.deepEqual(dados.rateios.get("90001"), [
    { seq: 1, codccu: "901", ctafin: "75", perc: 10.101, valor: 44 },
    { seq: 2, codccu: "902", ctafin: "75", perc: 31.5657, valor: 137.5 },
    { seq: 3, codccu: "903", ctafin: "75", perc: 58.3333, valor: 254.1 },
  ]);

  const oc = montarItensOc(dados, () => true).find((i) => i.numOcp === "90001")!;
  assert.equal(oc.valor, 435.6);
  assert.equal(oc.temRateio, true);
  assert.deepEqual(valorPorCc(oc.rateioDetalhe), { "901": 44, "902": 137.5, "903": 254.1 });
  const linha = JSON.parse(oc.rateioDetalhe!)[0];
  assert.equal(linha.ccuNome, "Centro de custo A");
  assert.equal(linha.contaFinanceira, "Medicina e Segurança do Trabalho");
});

test("OC 90002 atendida em parte: VLRRAT gravado (saldo de cada linha) vale como esta e fecha com o valor da OC", async () => {
  const { consultar } = seniorSimulada();
  const { dados } = await lerOcsDaSenior(consultar, [], () => {}, new Date("2026-11-24T12:00:00"));
  const oc = montarItensOc(dados, () => true).find((i) => i.numOcp === "90002")!;
  const valores = (JSON.parse(oc.rateioDetalhe!) as { valor: number }[]).map((l) => l.valor);
  assert.deepEqual(valores, [16.8, 16.8, 38.59, 43.31, 65.1, 81.9, 0, 0]);
  assert.equal(Math.round(valores.reduce((s, v) => s + v, 0) * 100) / 100, oc.valor);
  assert.equal(oc.valor, 262.5);
});

test("OC 90003 cancelada: rateio zerado continua R$ 0, como o cabecalho, e os itens dela nem sao lidos", async () => {
  const { consultar, consultas } = seniorSimulada();
  const { dados } = await lerOcsDaSenior(consultar, [], () => {}, new Date("2026-11-24T12:00:00"));
  assert.ok(consultas.filter((s) => /FROM E420I[PS]O/.test(s)).every((s) => !s.includes("90003")));
  const oc = montarItensOc(dados, () => true).find((i) => i.numOcp === "90003")!;
  assert.equal(oc.valor, 0);
  assert.deepEqual(valorPorCc(oc.rateioDetalhe), { "910": 0 });
});

test("usuarios do Senior: E099USU e' lido so' da empresa 1 (mesmo CODUSU e' gente diferente por empresa)", async () => {
  const { consultar, consultas } = seniorSimulada();
  await lerOcsDaSenior(consultar, [], () => {}, new Date("2026-11-24T12:00:00"));
  assert.match(consultas.find((s) => s.includes("FROM E099USU"))!, /WHERE CODEMP = 1\b/);
});
