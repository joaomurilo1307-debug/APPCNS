import { test } from "node:test";
import assert from "node:assert/strict";
import { avaliarAprovacao, niveisDaExpressao, termosDaExpressao } from "../src/lib/senior/aprovacaoOc";
import { cadastroBancarioReal } from "../src/lib/senior/pagamentoParaTitulo";

const pessoa = { codUsu: "1", nome: "x", email: null };
const ev = (nivel: number, situacao = "APR") => ({ nivel, codCcu: "13", situacao, data: "2026-10-08", por: pessoa });

test("expressao de niveis exigidos (valores reais do tenant)", () => {
  assert.deepEqual(niveisDaExpressao("1"), [1]);
  assert.deepEqual(niveisDaExpressao("(1)*(2)"), [1, 2]);
  assert.deepEqual(niveisDaExpressao("(1*1)*(2)"), [1, 2]);
  assert.equal(termosDaExpressao("(1*1)*(2)"), 3);
  assert.deepEqual(niveisDaExpressao(null), []);
});

test("caminho feliz: cabecalho APR e todos os niveis aprovados = completa", () => {
  const r = avaliarAprovacao({ sitOc: "APR", sitCabecalho: "APR", niveisExigidos: [1, 2], eventos: [ev(1), ev(1), ev(2)], reprovada: false });
  assert.equal(r.completa, true);
  assert.deepEqual(r.niveisPendentes, []);
});

test("falha 1: falta um nivel mesmo com OC marcada aprovada", () => {
  const r = avaliarAprovacao({ sitOc: "APR", sitCabecalho: "APR", niveisExigidos: [1, 2], eventos: [ev(1)], reprovada: false });
  assert.equal(r.completa, false);
  assert.deepEqual(r.niveisPendentes, [2]);
  assert.match(r.motivoIncompleta!, /nível 2/);
});

test("falha 2: em analise, reprovada ou sem cabecalho nunca e completa", () => {
  assert.equal(avaliarAprovacao({ sitOc: "ANA", sitCabecalho: "ANA", niveisExigidos: [1], eventos: [], reprovada: false }).completa, false);
  assert.equal(avaliarAprovacao({ sitOc: "APR", sitCabecalho: "APR", niveisExigidos: [1], eventos: [ev(1), ev(1, "REP")], reprovada: true }).completa, false);
  assert.equal(avaliarAprovacao({ sitOc: "APR", sitCabecalho: null, niveisExigidos: [], eventos: [], reprovada: false }).completa, false);
});

test("cadastro bancario placeholder (111/11111/111111) nao conta como dado real", () => {
  assert.equal(cadastroBancarioReal({ CODBAN: "111", CODAGE: "11111", CCBFOR: "111111" }), false);
  assert.equal(cadastroBancarioReal({ CODBAN: "341", CODAGE: "7415", CCBFOR: "01130-8" }), true);
  assert.equal(cadastroBancarioReal({ CODBAN: "341", CODAGE: "0", CCBFOR: "" }), false);
  assert.equal(cadastroBancarioReal(undefined), false);
});
