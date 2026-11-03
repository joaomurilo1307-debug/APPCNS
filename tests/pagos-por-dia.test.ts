import { test } from "node:test";
import assert from "node:assert/strict";
import { aprovacoesDoHistorico, diasNoMes, lerDias, montarPagos, type Pagamento } from "../src/lib/contratos/pagosPorDia";
import { situacaoPelaRemessa } from "../src/lib/contratos/pagosPorDiaServidor";

const nome = (c: string) => `CC ${c}`;
const base = { mes: "2026-09", dias: [] as number[], pode: () => true, nomeDoCentro: nome, ocDe: () => null };
const pag = (extra: Partial<Pagamento> & Pick<Pagamento, "chave" | "data" | "partes">): Pagamento => ({
  situacao: "pago", forma: "pagamento", numTit: "T1", tipo: "NFS", codFor: "10", fornecedor: "FORN", vencimento: null, numOcp: null, remessa: null, ...extra,
});

// linhas REAIS da planilha da Grazi (25/09/2026, titulo 13973A1 CST Medicina do Trabalho): 4 centros de custo, mesma baixa
const CST = pag({
  chave: "13973A1|711334|NFS|2026-09-25", data: "2026-09-25", numTit: "13973A1", fornecedor: "CST MEDICINA DO TRABALHO LTDA", codFor: "711334",
  partes: [
    { ccu: "102345", conta: "Medicina e Segurança do Trabalho", valor: 703.96 },
    { ccu: "102395", conta: "Medicina e Segurança do Trabalho", valor: 471.15 },
    { ccu: "210", conta: "Medicina e Segurança do Trabalho", valor: 3435 },
    { ccu: "230", conta: "Medicina e Segurança do Trabalho", valor: 2060.77 },
  ],
});

test("lerDias: dias soltos e faixas, ordenados e sem repeticao", () => {
  assert.deepEqual(lerDias("1,5,9-12,5", "2026-10"), { dias: [1, 5, 9, 10, 11, 12], erro: null });
  assert.deepEqual(lerDias("", "2026-10"), { dias: [], erro: null });
  assert.deepEqual(lerDias(null, "2026-10"), { dias: [], erro: null });
  assert.equal(diasNoMes("2026-02"), 28);
});

test("lerDias: nao ignora em silencio o que nao entendeu", () => {
  for (const ruim of ["0", "32", "a", "5-3", "1,,x", "31"]) {
    const r = lerDias(ruim, "2026-09"); // setembro tem 30 dias
    assert.ok(r.erro, `"${ruim}" deveria dar erro`);
    assert.deepEqual(r.dias, []);
  }
});

test("duas linhas de rateio do mesmo centro e da mesma conta continuam separadas (como no Rel114) e o total do centro soma as duas", () => {
  const p = pag({ chave: "21892", data: "2026-10-05", numTit: "21892$02", partes: [{ ccu: "102345", conta: "EPI's e EPC's", valor: 359.25 }, { ccu: "102345", conta: "EPI's e EPC's", valor: 411 }, { ccu: "210", conta: "EPI's e EPC's", valor: 959 }] });
  const r = montarPagos([p], { ...base, mes: "2026-10", ccu: "102345" });
  assert.deepEqual(r.linhas.map((l) => l.valor), [359.25, 411]);
  assert.equal(new Set(r.linhas.map((l) => l.chave)).size, 2); // chaves unicas
  assert.equal(r.resumo.pagos.valor, 770.25);
  assert.equal(r.linhas[0].totalPago, 1729.25);
  assert.equal(r.linhas[0].rateios.filter((x) => x.desta).length, 1); // so' a linha clicada fica marcada
});

test("valor da linha e' so' o do centro olhado; total pago e rateio completo mostram todos (caso real 13973A1)", () => {
  const r = montarPagos([CST], { ...base, ccu: "102345" });
  assert.equal(r.linhas.length, 1);
  const l = r.linhas[0];
  assert.equal(l.valor, 703.96);
  assert.equal(l.totalPago, 6670.88);
  assert.equal(l.rateios.length, 4);
  assert.equal(l.rateios.filter((x) => x.desta).length, 1);
  assert.equal(l.rateios[0].ccu, "102345"); // o da linha vem primeiro
  assert.ok(Math.abs(l.percentual - 703.96 / 6670.88) < 1e-12);
  assert.equal(Math.round(l.rateios.reduce((s, x) => s + x.valor, 0) * 100) / 100, l.totalPago); // a soma dos rateios fecha com o total pago
  assert.equal(r.resumo.pagos.valor, 703.96); // o total soma so' o centro olhado
});

test("sem escolher centro: uma linha por centro visivel, e o total soma cada parte uma vez", () => {
  const r = montarPagos([CST], base);
  assert.equal(r.linhas.length, 4);
  assert.equal(r.resumo.pagos.valor, 6670.88);
  assert.equal(r.resumo.pagos.pagamentos, 1);
  assert.equal(r.resumo.porCentro.length, 4);
});

test("quem ve so' alguns centros recebe so' as linhas deles (o rateio completo continua inteiro)", () => {
  const r = montarPagos([CST], { ...base, pode: (c) => c === "210" || c === "230" });
  assert.deepEqual(r.linhas.map((l) => l.ccu).sort(), ["210", "230"]);
  assert.equal(r.resumo.pagos.valor, 5495.77);
  assert.equal(r.linhas[0].rateios.length, 4);
});

test("falha: ninguem com acesso a nenhum centro -> nada aparece, totais zerados", () => {
  const r = montarPagos([CST], { ...base, pode: () => false });
  assert.equal(r.linhas.length, 0);
  assert.equal(r.resumo.pagos.valor, 0);
  assert.ok(r.dias.every((d) => d.pagamentos === 0 && d.valor === 0));
});

test("filtro por dia: um ou varios dias; a grade do mes mostra onde ha pagamento independente do filtro", () => {
  const a = pag({ chave: "a", data: "2026-09-25", partes: [{ ccu: "1", conta: "X", valor: 100 }] });
  const b = pag({ chave: "b", data: "2026-09-28", numTit: "T2", partes: [{ ccu: "1", conta: "X", valor: 50.5 }] });
  const c = pag({ chave: "c", data: "2026-09-29", numTit: "T3", partes: [{ ccu: "1", conta: "X", valor: 1 }] });
  const um = montarPagos([a, b, c], { ...base, dias: [28] });
  assert.deepEqual(um.linhas.map((l) => l.numTit), ["T2"]);
  assert.equal(um.resumo.pagos.valor, 50.5);
  const dois = montarPagos([a, b, c], { ...base, dias: [25, 29] });
  assert.equal(dois.resumo.pagos.valor, 101);
  assert.equal(dois.dias.find((d) => d.dia === 28)?.pagamentos, 1); // a grade nao some com o dia fora do filtro
  assert.equal(montarPagos([a, b, c], base).resumo.pagos.valor, 151.5); // sem filtro = mes todo
});

test("falha: mes sem pagamento -> vazio, sem erro", () => {
  const r = montarPagos([CST], { ...base, mes: "2026-08" });
  assert.equal(r.linhas.length, 0);
  assert.equal(r.resumo.pagos.linhas, 0);
  assert.equal(r.dias.length, 31);
});

test("o que nao esta confirmado como pago fica a parte e NUNCA entra no total pago", () => {
  const ab = pag({ chave: "aberto", data: "2026-09-30", situacao: "programado", forma: null, numTit: "TAB", partes: [{ ccu: "1", conta: "X", valor: 900 }] });
  const env = pag({ chave: "env", data: "2026-09-30", situacao: "enviado_banco", forma: null, numTit: "TENV", partes: [{ ccu: "1", conta: "X", valor: 70 }] });
  const pb = pag({ chave: "pb", data: "2026-09-30", situacao: "pago_banco", forma: null, numTit: "TPB", partes: [{ ccu: "1", conta: "X", valor: 30 }] });
  const ok = pag({ chave: "ok", data: "2026-09-30", numTit: "TOK", partes: [{ ccu: "1", conta: "X", valor: 100 }] });
  const r = montarPagos([ab, env, pb, ok], base);
  assert.deepEqual(r.linhas.map((l) => l.numTit).sort(), ["TOK", "TPB"]);
  assert.deepEqual(r.semConfirmacao.map((l) => l.numTit).sort(), ["TAB", "TENV"]);
  assert.equal(r.resumo.pagos.valor, 130);
  assert.equal(r.resumo.semConfirmacao.valor, 970);
  assert.equal(r.resumo.porSituacao.programado.valor, 900);
  const so = montarPagos([ab, env, pb, ok], { ...base, situacao: "pago_banco" });
  assert.deepEqual(so.linhas.map((l) => l.numTit), ["TPB"]);
  assert.equal(so.semConfirmacao.length, 2); // o filtro de situacao nao esconde o bloco a parte
  assert.equal(so.dias.find((d) => d.dia === 30)?.semBaixa, 2);
});

test("busca por fornecedor, titulo, OC, conta ou centro (sem acento)", () => {
  const p = pag({ chave: "x", data: "2026-09-10", numTit: "ABC1", fornecedor: "Construção Ltda", numOcp: "15999", partes: [{ ccu: "7", conta: "Combustível", valor: 10 }] });
  for (const q of ["construcao", "abc1", "15999", "combustivel", "cc 7"]) assert.equal(montarPagos([p], { ...base, q }).linhas.length, 1, q);
  assert.equal(montarPagos([p], { ...base, q: "naoexiste" }).linhas.length, 0);
});

test("OC e aprovacoes entram na linha; sem OC aparece 'Sem OC'", () => {
  const p = pag({ chave: "x", data: "2026-09-10", numOcp: "15955", partes: [{ ccu: "7", conta: "A", valor: 10 }] });
  const ocDe = (n: string) => (n === "15955" ? { rotulo: "Aprovada", situacao: "APR", aprovacoes: [{ nivel: 1, nome: "Claudia", data: "2026-10-09", situacao: "APR" }] } : null);
  const com = montarPagos([p], { ...base, ocDe }).linhas[0];
  assert.equal(com.ocRotulo, "Aprovada");
  assert.equal(com.aprovacoes.length, 1);
  const sem = montarPagos([pag({ chave: "y", data: "2026-09-11", partes: [{ ccu: "7", conta: "A", valor: 10 }] })], base).linhas[0];
  assert.equal(sem.ocRotulo, "Sem OC");
  assert.deepEqual(sem.aprovacoes, []);
});

// ---- remessa / retorno do Itau (a dupla checagem)
const item = (extra: Partial<Parameters<typeof situacaoPelaRemessa>[0][number]>) => ({
  tituloId: "t1", status: "PENDENTE", dataPagamento: new Date("2026-10-05T00:00:00Z"), dataEfetivacao: null, valorEfetivado: null, baixaSeniorStatus: null, baixaSeniorMsg: null,
  criadoEm: new Date("2026-10-05T10:00:00Z"), remessa: { criadoEm: new Date("2026-10-05T09:00:00Z") }, ...extra,
});

test("remessa: retorno PAGO -> pago pelo banco, na data efetiva, com o valor e a situacao da baixa", () => {
  const r = situacaoPelaRemessa([item({ status: "PAGO", dataEfetivacao: new Date("2026-10-06T00:00:00Z"), valorEfetivado: 83.7, baixaSeniorStatus: "ERRO", baixaSeniorMsg: "recusou" })]);
  assert.equal(r?.situacao, "pago_banco");
  if (r?.situacao === "pago_banco") {
    assert.equal(r.evidencia.data, "2026-10-06");
    assert.equal(r.evidencia.valorEfetivado, 83.7);
    assert.equal(r.evidencia.baixaSenior, "ERRO");
  }
});

test("remessa: gerada sem retorno -> enviado, sem confirmacao; PAGO vale mais que um item mais novo pendente", () => {
  assert.equal(situacaoPelaRemessa([item({ status: "PENDENTE" })])?.situacao, "enviado_banco");
  assert.equal(situacaoPelaRemessa([item({ status: "AGENDADO" })])?.situacao, "enviado_banco");
  assert.equal(situacaoPelaRemessa([item({ status: "PENDENTE" }), item({ status: "PAGO", dataEfetivacao: new Date("2026-10-02T00:00:00Z") })])?.situacao, "pago_banco");
});

test("remessa: so' rejeitado/cancelado -> descartado (o banco nao pagou); sem item -> null", () => {
  assert.equal(situacaoPelaRemessa([item({ status: "REJEITADO" }), item({ status: "CANCELADO" })])?.situacao, "descartado");
  assert.equal(situacaoPelaRemessa([]), null);
  assert.equal(situacaoPelaRemessa([item({ status: "REJEITADO" }), item({ status: "PENDENTE" })])?.situacao, "enviado_banco"); // reenviado depois
});

// ---- aprovacoes (historico real da OC 15955, gravado pela sincronizacao)
const HIST = '[{"SEQAPR": "3", "NIVAPR": "3", "USUAPR": "26", "SITAPR": "APR", "CCUAPR": "102065", "DATAPR": "09/10/2026"}, {"SEQAPR": "1", "NIVAPR": "1", "USUAPR": "177", "SITAPR": "APR", "CCUAPR": "102065", "DATAPR": "09/10/2026"}, {"SEQAPR": "2", "NIVAPR": "2", "USUAPR": "177", "SITAPR": "APR", "CCUAPR": "102065", "DATAPR": "09/10/2026"}]';

test("aprovacoes: uma por nivel e aprovador, em ordem de nivel, com o nome", () => {
  const r = aprovacoesDoHistorico(HIST, (c) => ({ "26": "Geizi", "177": "Claudia Moreira" }[c] ?? `#${c}`));
  assert.deepEqual(r.map((a) => `${a.nivel}:${a.nome}:${a.data}`), ["1:Claudia Moreira:2026-10-09", "2:Claudia Moreira:2026-10-09", "3:Geizi:2026-10-09"]);
});

test("aprovacoes: historico vazio, quebrado ou de outro formato nao derruba nada", () => {
  for (const ruim of [null, undefined, "", "nao e json", "{}", "[1,2]", '[{"NIVAPR":"x"}]']) assert.deepEqual(aprovacoesDoHistorico(ruim as any, (c) => c), []);
  const semData = aprovacoesDoHistorico('[{"NIVAPR":"1","USUAPR":"5","SITAPR":"PEN","DATAPR":"31/12/1900"}]', (c) => `U${c}`);
  assert.equal(semData[0].data, null);
  assert.equal(semData[0].nome, "U5");
});
