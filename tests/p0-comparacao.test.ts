import { test } from "node:test";
import assert from "node:assert/strict";
import { contasDoP0, mesesEntre, periodoDoP0 } from "../src/lib/p0/montar";
import { compararMes, desviosContraP0, mesJaTemContasR, previstoPorMes, totaisPorMes, valorNoMes } from "../src/lib/p0/comparar";
import type { ContaDoContrato } from "../src/lib/custos/agregacao";

const iso = (m: string) => `${m}-01T00:00:00.000Z`;
const conta = (nome: string, codigo: number | null, grupoCodigo: string, grupoNome: string, reembolsavel: boolean, valores: Record<string, number>): ContaDoContrato => ({
  contaFinanceira: nome,
  codigo,
  grupoCodigo,
  grupoNome,
  reembolsavel,
  total: Object.values(valores).reduce((s, v) => s + v, 0),
  meses: Object.entries(valores).map(([m, valor]) => ({ competencia: iso(m), valor })),
});
const linhaP0 = (codConta: number, conta: string, grupoCodigo: string, grupoNome: string, reembolsavel: boolean, mes: string, valor: number) => ({
  codConta,
  conta,
  grupoCodigo,
  grupoNome,
  reembolsavel,
  competencia: new Date(iso(mes)),
  valor,
});

const SEM_FILTRO = { tipo: "todos", grupo: "todos" } as const;
const PERIODO = { mesIni: "2026-07", mesFim: "2026-12" };

// P0 de exemplo: PJ (Pessoal), notebook (TI) e tres contas R de reembolsavel
const p0 = [
  conta("Serviços Terceiros PJ", 84, "206", "Pessoal", false, { "2026-07": 0, "2026-08": 100, "2026-09": 100, "2026-10": 100 }),
  conta("Locação de Desktop / Notebook", 122, "208", "Tecnologia (TI)", false, { "2026-08": 10, "2026-09": 10 }),
  conta("R - Locacao de Veículos", 218, "reembR", "Reembolsáveis · contas R", true, { "2026-08": 50, "2026-09": 50, "2026-10": 50 }),
  conta("R - Hospedagem para Contratos", 185, "reembR", "Reembolsáveis · contas R", true, { "2026-08": 30, "2026-09": 30, "2026-10": 30 }),
];

test("contasDoP0: soma linhas da mesma conta no mes, ordena pela maior conta e acha o periodo", () => {
  const contas = contasDoP0([
    linhaP0(84, "Serviços Terceiros PJ", "206", "Pessoal", false, "2026-08", 60),
    linhaP0(84, "Serviços Terceiros PJ", "206", "Pessoal", false, "2026-08", 40.25),
    linhaP0(84, "Serviços Terceiros PJ", "206", "Pessoal", false, "2026-09", 100),
    linhaP0(218, "R - Locacao de Veículos", "reembR", "Reembolsáveis · contas R", true, "2026-07", 20),
  ]);
  assert.equal(contas.length, 2);
  assert.equal(contas[0].contaFinanceira, "Serviços Terceiros PJ");
  assert.equal(contas[0].total, 200.25);
  assert.deepEqual(contas[0].meses.map((m) => [m.competencia, m.valor]), [[iso("2026-08"), 100.25], [iso("2026-09"), 100]]);
  assert.deepEqual(periodoDoP0(contas), { mesIni: "2026-07", mesFim: "2026-09" });
  assert.equal(periodoDoP0([]), null);
  assert.equal(contas[1].reembolsavel, true);
});

test("mesesEntre: sem pular mes e atravessando o ano", () => {
  assert.deepEqual(mesesEntre("2026-11", "2027-02"), ["2026-11", "2026-12", "2027-01", "2027-02"]);
  assert.deepEqual(mesesEntre("2026-07", "2026-07"), ["2026-07"]);
});

test("reembolsavel ainda em conta unica: as contas R do P0 sao SOMADAS e comparadas com a conta antiga", () => {
  const real = [
    conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", true, { "2026-09": 95 }),
    conta("Serviços Terceiros PJ", 84, "206", "Pessoal", false, { "2026-09": 120 }),
  ];
  assert.equal(mesJaTemContasR(real, "2026-09"), false);
  const c = compararMes({ p0, realizado: real, mes: "2026-09", periodo: PERIODO, filtros: SEM_FILTRO });
  assert.equal(c.modoReembolsavel, "agregado");
  const reemb = c.grupos.find((g) => g.grupoCodigo === "reemb")!;
  assert.equal(reemb.linhas.length, 1);
  assert.equal(reemb.linhas[0].previsto, 80); // 50 + 30
  assert.equal(reemb.linhas[0].realizado, 95);
  assert.equal(reemb.linhas[0].status, "acima");
  assert.ok(reemb.linhas[0].nota);
  assert.equal(c.grupos.find((g) => g.grupoCodigo === "reembR"), undefined); // nenhuma linha R solta
  assert.equal(c.previsto, 100 + 10 + 80);
  assert.equal(c.realizado, 95 + 120);
  assert.equal(c.delta, 215 - 190);
});

test("reembolsavel ja nas contas R: compara linha a linha; o que sobra na conta antiga aparece a parte", () => {
  const real = [
    conta("R - Locacao de Veículos", 218, "reembR", "Reembolsáveis · contas R", true, { "2026-10": 40 }),
    conta("R - Hospedagem para Contratos", 185, "reembR", "Reembolsáveis · contas R", true, { "2026-10": 30 }),
    conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", true, { "2026-10": 7 }),
  ];
  assert.equal(mesJaTemContasR(real, "2026-10"), true);
  const c = compararMes({ p0, realizado: real, mes: "2026-10", periodo: PERIODO, filtros: SEM_FILTRO });
  assert.equal(c.modoReembolsavel, "linha");
  const r = c.grupos.find((g) => g.grupoCodigo === "reembR")!;
  const veic = r.linhas.find((l) => l.nome === "R - Locacao de Veículos")!;
  assert.deepEqual([veic.previsto, veic.realizado, veic.delta, veic.status], [50, 40, -10, "abaixo"]);
  const hosp = r.linhas.find((l) => l.nome === "R - Hospedagem para Contratos")!;
  assert.deepEqual([hosp.previsto, hosp.realizado, hosp.status], [30, 30, "igual"]);
  const antiga = c.grupos.find((g) => g.grupoCodigo === "reemb")!.linhas[0];
  assert.deepEqual([antiga.previsto, antiga.realizado, antiga.status], [0, 7, "sem_previsao"]);
  assert.match(antiga.nota ?? "", /contas R/);
  assert.equal(c.grupos.find((g) => g.grupoCodigo === "reemb")!.linhas.length, 1);
});

test("P0 com reembolsavel MISTO (conta antiga + contas R): em mes de conta unica soma tudo; com contas R no Senior compara linha a linha, a conta antiga por codigo", () => {
  const misto = [
    conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", true, { "2026-09": 40 }),
    conta("R - Locacao de Veículos", 218, "reembR", "Reembolsáveis · contas R", true, { "2026-09": 50, "2026-10": 50 }),
  ];
  const unica = [conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", true, { "2026-09": 100 })];
  const c1 = compararMes({ p0: misto, realizado: unica, mes: "2026-09", periodo: { mesIni: "2026-09", mesFim: "2026-10" }, filtros: SEM_FILTRO });
  assert.equal(c1.modoReembolsavel, "agregado");
  assert.equal(c1.grupos.flatMap((g) => g.linhas).length, 1);
  assert.equal(c1.previsto, 90); // 40 (antiga) + 50 (R)
  assert.equal(c1.realizado, 100);
  const comR = [
    conta("R - Locacao de Veículos", 218, "reembR", "Reembolsáveis · contas R", true, { "2026-10": 45 }),
    conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", true, { "2026-10": 5 }),
  ];
  const c2 = compararMes({ p0: misto, realizado: comR, mes: "2026-10", periodo: { mesIni: "2026-09", mesFim: "2026-10" }, filtros: SEM_FILTRO });
  assert.equal(c2.modoReembolsavel, "linha");
  const linhaR = c2.grupos.flatMap((g) => g.linhas).find((l) => l.nome === "R - Locacao de Veículos")!;
  assert.deepEqual([linhaR.previsto, linhaR.realizado], [50, 45]);
});

test("situacoes: sem previsao, nao realizado, igual, acima e abaixo; contagem fecha com o numero de linhas", () => {
  const real = [
    conta("Serviços Terceiros PJ", 84, "206", "Pessoal", false, { "2026-08": 100 }), // igual
    conta("Internet", 119, "207", "Administrativas", false, { "2026-08": 40 }), // sem previsao
    conta("Locação de Desktop / Notebook", null, "208", "Tecnologia (TI)", false, {}), // nao realizado (previsto 10) e sem codigo
  ];
  const c = compararMes({ p0, realizado: real, mes: "2026-08", periodo: PERIODO, filtros: SEM_FILTRO });
  const por = (n: string) => c.grupos.flatMap((g) => g.linhas).find((l) => l.nome === n)!;
  assert.equal(por("Serviços Terceiros PJ").status, "igual");
  assert.equal(por("Internet").status, "sem_previsao");
  assert.equal(por("Locação de Desktop / Notebook").status, "nao_realizado");
  const total = Object.values(c.contagem).reduce((s, n) => s + n, 0);
  assert.equal(total, c.grupos.reduce((s, g) => s + g.linhas.length, 0));
});

test("a conta casa pelo CODIGO; sem codigo, pelo nome sem acento e sem diferenca de caixa", () => {
  const real = [conta("LOCACAO DE DESKTOP / NOTEBOOK", null, "208", "Tecnologia (TI)", false, { "2026-08": 12 })];
  const c = compararMes({ p0, realizado: real, mes: "2026-08", periodo: PERIODO, filtros: SEM_FILTRO });
  const ti = c.grupos.find((g) => g.grupoCodigo === "208")!;
  // o P0 tem codigo 122 e o realizado nao tem codigo: as chaves diferem, entao NAO se fundem (duas linhas) -- nada e' casado por palpite
  assert.equal(ti.linhas.length, 2);
  const real2 = [conta("Locação de Desktop / Notebook", 122, "208", "Tecnologia (TI)", false, { "2026-08": 12 })];
  const c2 = compararMes({ p0, realizado: real2, mes: "2026-08", periodo: PERIODO, filtros: SEM_FILTRO });
  assert.equal(c2.grupos.find((g) => g.grupoCodigo === "208")!.linhas.length, 1);
});

test("mes fora do periodo do P0: sem previsao nenhuma, so' o realizado; mes de pausa dentro do periodo: previsto zero", () => {
  const real = [conta("Serviços Terceiros PJ", 84, "206", "Pessoal", false, { "2026-05": 80, "2026-11": 70 })];
  const antes = compararMes({ p0, realizado: real, mes: "2026-05", periodo: PERIODO, filtros: SEM_FILTRO });
  assert.equal(antes.temP0, false);
  assert.equal(antes.previsto, 0);
  assert.equal(antes.realizado, 80);
  const pausa = compararMes({ p0, realizado: real, mes: "2026-11", periodo: PERIODO, filtros: SEM_FILTRO });
  assert.equal(pausa.temP0, true);
  assert.equal(pausa.previsto, 0);
  assert.equal(pausa.grupos[0].linhas[0].status, "sem_previsao");
});

test("filtros (tipo de custo, grupo e busca) valem dos dois lados", () => {
  const real = [
    conta("Despesas Reembolsáveis", 67, "reemb", "Reembolsáveis · conta antiga", true, { "2026-09": 95 }),
    conta("Serviços Terceiros PJ", 84, "206", "Pessoal", false, { "2026-09": 120 }),
  ];
  const proprio = compararMes({ p0, realizado: real, mes: "2026-09", periodo: PERIODO, filtros: { tipo: "proprio", grupo: "todos" } });
  assert.equal(proprio.grupos.some((g) => g.grupoCodigo.startsWith("reemb")), false);
  assert.equal(proprio.previsto, 110);
  const soReemb = compararMes({ p0, realizado: real, mes: "2026-09", periodo: PERIODO, filtros: { tipo: "reembolsavel", grupo: "todos" } });
  assert.equal(soReemb.previsto, 80);
  assert.equal(soReemb.realizado, 95);
  const busca = compararMes({ p0, realizado: real, mes: "2026-09", periodo: PERIODO, filtros: SEM_FILTRO, busca: "terceiros" });
  assert.equal(busca.previsto, 100);
  assert.equal(busca.realizado, 120);
  const grupo = compararMes({ p0, realizado: real, mes: "2026-09", periodo: PERIODO, filtros: { tipo: "todos", grupo: "208" } });
  assert.equal(grupo.previsto, 10);
  assert.equal(grupo.realizado, 0);
});

test("series: previstoPorMes (null fora do P0, zero na pausa), totaisPorMes e desviosContraP0", () => {
  const meses = ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11"];
  const prev = previstoPorMes(p0, meses, PERIODO, SEM_FILTRO);
  assert.deepEqual(prev, [null, 0, 190, 190, 180, 0]);
  const real = [conta("Serviços Terceiros PJ", 84, "206", "Pessoal", false, { "2026-06": 5, "2026-08": 228, "2026-09": 190, "2026-10": 100 })];
  const tot = totaisPorMes(real, meses, SEM_FILTRO);
  assert.deepEqual(tot, [5, 0, 228, 190, 100, 0]);
  const desv = desviosContraP0(tot, prev, 4); // out/26 e' o mes em andamento
  assert.equal(desv[0], null); // antes do P0
  assert.equal(desv[1], null); // previsto zero
  assert.ok(Math.abs((desv[2] ?? 0) - 0.2) < 1e-9);
  assert.equal(desv[3], 0);
  assert.equal(desv[4], null); // mes parcial
  assert.equal(desv[5], null);
});

test("valorNoMes soma entradas do mesmo mes e ignora outros", () => {
  const c = conta("X", 1, "206", "Pessoal", false, {});
  c.meses = [{ competencia: iso("2026-08"), valor: 3 }, { competencia: "2026-08-15T00:00:00.000Z", valor: 4 }, { competencia: iso("2026-09"), valor: 9 }];
  assert.equal(valorNoMes(c, "2026-08"), 7);
  assert.equal(valorNoMes(c, "2026-10"), 0);
});
