import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertividade,
  comparar,
  diferenca,
  grade,
  lerMes,
  lerValor,
  pacoteDaConta,
  pacoteSenior,
  pctSobrePrevisto,
  projetar,
  serieMensal,
  type LinhaPrevisto,
} from "../src/lib/custos/previsto";
import type { ContaDoContrato } from "../src/lib/custos/agregacao";

const conta = (nome: string, codigo: number | null, grupoCodigo: string, grupoNome: string, meses: [string, number][], reembolsavel = false): ContaDoContrato => ({
  contaFinanceira: nome,
  codigo,
  grupoCodigo,
  grupoNome,
  reembolsavel,
  total: meses.reduce((s, [, v]) => s + v, 0),
  meses: meses.map(([m, valor]) => ({ competencia: `${m}-01T00:00:00.000Z`, valor })),
});
const prev = (id: string, contaCod: number, competencia: string | null, valor: number, extra: Partial<LinhaPrevisto> = {}): LinhaPrevisto => ({ id, conta: contaCod, competencia, valor, descricao: null, fornecedor: null, origem: "MANUAL", ...extra });

// contas reais do plano: 44 Combustivel (Veiculos), 18 Internet?, 90 Assistencia Medica?  -> so' usa os codigos pelo nome abaixo
test("formulas da planilha: diferenca, % sobre o previsto e assertividade", () => {
  assert.ok(Math.abs(diferenca(1798.74, 1999.09) - -200.35) < 1e-9);
  assert.equal(pctSobrePrevisto(1395.67, 588.8)?.toFixed(6), "1.370363"); // "Internet" da CT 3748 em jul/26: +137%
  assert.equal(pctSobrePrevisto(100, 0), null, "previsto zero: a planilha mostra '-'");
  assert.equal(assertividade(110, 100)?.toFixed(2), "0.90");
  assert.equal(assertividade(90, 100)?.toFixed(2), "0.90", "gastar a menos tambem e' erro de previsao: em modulo");
  assert.equal(assertividade(300, 100), 0, "nunca fica abaixo de 0%");
  assert.equal(assertividade(5, 0), null);
});

test("pacote da conta = cabecalho de nivel 2 do plano do Senior; reembolsaveis em pacotes proprios", () => {
  assert.equal(pacoteDaConta(44).nome, "DESPESAS COM VEÍCULO");
  assert.equal(pacoteDaConta(67).codigo, "reemb");
  assert.equal(pacoteDaConta(67).nome, "REEMBOLSÁVEIS · CONTA ANTIGA");
  assert.equal(pacoteDaConta(215).codigo, "reembR");
  assert.equal(pacoteDaConta(999999).nome, "OUTRAS CONTAS");
});

test("comparar: soma previsto e realizado por conta dentro do periodo, agrupa por pacote e calcula desvio, % e assertividade", () => {
  const contrato = {
    contas: [
      conta("Combustível", 44, "205", "Veículos", [["2026-01", 100], ["2026-02", 200], ["2026-03", 50]]),
      conta("Internet", 109, "207", "Administrativas", [["2026-01", 30]]),
    ],
  };
  const previsto = [prev("1", 44, "2026-01", 120), prev("2", 44, "2026-02", 120), prev("3", 44, "2026-03", 999), prev("4", 109, "2026-01", 0), prev("5", 44, null, 500)];
  const r = comparar(contrato, previsto, { meses: ["2026-01", "2026-02"] });
  const veic = r.pacotes.find((p) => p.nome === "DESPESAS COM VEÍCULO")!;
  assert.equal(veic.previsto, 240, "mar/26 fica fora do periodo; previsto sem mes fica fora por padrao");
  assert.equal(veic.realizado, 300);
  assert.equal(veic.diferenca, 60);
  assert.equal(veic.pct?.toFixed(2), "0.25");
  assert.equal(r.previstoSemMes, 500);
  const internet = r.pacotes.flatMap((p) => p.contas).find((c) => c.nome === "Internet")!;
  assert.equal(internet.pct, null, "previsto zero");
  assert.equal(internet.situacao, "so_realizado");
  assert.equal(r.previsto, 240);
  assert.equal(r.realizado, 330);
  assert.equal(r.assertividade?.toFixed(3), "0.625");

  const comSemMes = comparar(contrato, previsto, { meses: ["2026-01", "2026-02"], incluirSemMes: true });
  assert.equal(comSemMes.previsto, 740);
});

test("comparar: conta so' com previsto aparece (realizado zero) e o filtro de conta vale para os dois lados", () => {
  const contrato = { contas: [conta("Combustível", 44, "205", "Veículos", [["2026-01", 100]]), conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", [["2026-01", 40]], true)] };
  const previsto = [prev("1", 44, "2026-01", 100), prev("2", 118, "2026-01", 80), prev("3", 67, "2026-01", 10)];
  const todas = comparar(contrato, previsto, { meses: ["2026-01"] });
  const soPrev = todas.pacotes.flatMap((p) => p.contas).find((c) => c.conta === 118)!;
  assert.equal(soPrev.situacao, "so_previsto");
  assert.equal(soPrev.realizado, 0);
  const semReemb = comparar(contrato, previsto, { meses: ["2026-01"], contaPassa: (c) => !c.reembolsavel });
  assert.equal(semReemb.pacotes.some((p) => p.codigo === "reemb"), false);
  assert.equal(semReemb.previsto, 180);
  assert.equal(semReemb.realizado, 100);
});

test("serieMensal: previsto e realizado mes a mes", () => {
  const contrato = { contas: [conta("Combustível", 44, "205", "Veículos", [["2026-01", 100], ["2026-03", 50]])] };
  const s = serieMensal(contrato, [prev("1", 44, "2026-01", 120), prev("2", 44, "2026-02", 70), prev("3", 44, "2026-02", 30), prev("4", 44, null, 999)], ["2026-01", "2026-02", "2026-03"]);
  assert.deepEqual(s.previsto, [120, 100, 0]);
  assert.deepEqual(s.realizado, [100, 0, 50]);
});

test("projetar: realizado ate o mes de referencia + previsto dos meses seguintes", () => {
  const real = new Map([["2026-01", 100], ["2026-02", 120], ["2026-03", 80]]);
  const previsto = [prev("1", 44, "2026-01", 100), prev("2", 44, "2026-02", 100), prev("3", 44, "2026-03", 100), prev("4", 44, "2026-04", 100), prev("5", 44, "2026-05", 100)];
  const p = projetar(real, previsto, "2026-03");
  assert.equal(p.previstoTotal, 500);
  assert.equal(p.realizadoAteAgora, 300);
  assert.equal(p.previstoRestante, 200);
  assert.equal(p.projetadoNoFim, 500);
  assert.equal(p.desvioProjetado, 0);
  assert.equal(p.consumido, 0.6);
});

test("grade: previsto por conta e mes (soma das linhas)", () => {
  const g = grade([prev("1", 44, "2026-01", 10.1), prev("2", 44, "2026-01", 0.2), prev("3", 44, null, 5), prev("4", 109, "2026-02", 7)]);
  assert.equal(g.get(44)?.get("2026-01"), 10.3);
  assert.equal(g.get(44)?.has("2026-02"), false);
  assert.equal(g.get(109)?.get("2026-02"), 7);
});

test("lerValor e lerMes: aceitam o que o usuario digita ou cola", () => {
  assert.equal(lerValor("1.234,56"), 1234.56);
  assert.equal(lerValor("R$ 1.234,56"), 1234.56);
  assert.equal(lerValor("1234.56"), 1234.56);
  assert.equal(lerValor("1.234"), 1234);
  assert.equal(lerValor("-50,5"), -50.5);
  assert.equal(lerValor(12.5), 12.5);
  assert.equal(lerValor("abc"), null);
  assert.equal(lerValor(""), null);
  assert.equal(lerMes("2026-04"), "2026-04");
  assert.equal(lerMes("04/2026"), "2026-04");
  assert.equal(lerMes("abr/26"), "2026-04");
  assert.equal(lerMes("abril/2026"), "2026-04");
  assert.equal(lerMes("2026-04-01T00:00:00.000Z"), "2026-04");
  assert.equal(lerMes("13/2026"), null);
  assert.equal(lerMes("xx"), null);
});

test("comoNaPlanilha: 'Despesas Reembolsaveis' (67) fica em DESPESAS COM PESSOAL como na planilha; sem a opcao, em grupo proprio", () => {
  assert.equal(pacoteSenior(67).nome, "DESPESAS COM PESSOAL");
  assert.equal(pacoteDaConta(67).nome, "REEMBOLSÁVEIS · CONTA ANTIGA");
  const contrato = { contas: [conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", [["2026-01", 300]], true), conta("Seguro de Vida", 82, "206", "Pessoal", [["2026-01", 20]])] };
  const previsto = [prev("1", 67, "2026-01", 250), prev("2", 82, "2026-01", 20)];
  const planilha = comparar(contrato, previsto, { meses: ["2026-01"], comoNaPlanilha: true });
  assert.deepEqual(planilha.pacotes.map((p) => [p.nome, p.previsto, p.realizado]), [["DESPESAS COM PESSOAL", 270, 320]]);
  const separado = comparar(contrato, previsto, { meses: ["2026-01"] });
  assert.deepEqual(separado.pacotes.map((p) => p.nome).sort(), ["DESPESAS COM PESSOAL", "REEMBOLSÁVEIS · CONTA ANTIGA"]);
  assert.equal(planilha.previsto, separado.previsto, "so' muda o agrupamento, nunca o total");
});
