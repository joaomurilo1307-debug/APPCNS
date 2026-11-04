import { test } from "node:test";
import assert from "node:assert/strict";
import {
  SEM_CENTRO, SEM_PROJETO, arredondarSomando, calcular, distribuirEsforco, diaSP, feriados, horasDoDono, janelasDaTarefa, mandatosDaPessoa, motivoDiaNaoUtil, somaDias,
  type EntradaCalculo, type TarefaTS,
} from "../src/lib/timesheetAuto/calculo";

const tarefa = (id: string, extra: Partial<TarefaTS> = {}): TarefaTS => ({
  id, titulo: `Tarefa ${id}`, projetoId: `p-${id}`, projetoNome: `Projeto ${id}`, codccu: "190", status: "FAZENDO",
  criadaEm: "2026-01-02", atualizadaEm: "2026-07-31", actualStartedAt: null, actualEndedAt: null, horasDedicadas: null, horasDedicadasEm: null,
  isEntrega: false, temSubtarefaDaPessoa: false, eventos: [], mandatos: null, ...extra,
});
const entrada = (extra: Partial<EntradaCalculo> = {}): EntradaCalculo => ({
  de: "2026-07-01", ate: "2026-07-31", hoje: "2026-08-05", desde: "2026-01-01", inicioOficial: "2026-01-01", horasPorDia: 8, ausencias: [], tarefas: [], ...extra,
});
const soma = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
const perto = (a: number, b: number, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} deveria ser ${b}`);

// gerador pseudo-aleatorio deterministico (mulberry32) para os testes de invariantes
function aleatorio(semente: number) {
  let a = semente >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- calendario

test("calendario: feriados nacionais e de Belo Horizonte, e julho/2026 tem 23 dias trabalhados", () => {
  const f26 = feriados(2026);
  assert.equal(f26.get("2026-04-03"), "Sexta-feira Santa");
  assert.ok(f26.has("2026-11-20") && f26.has("2026-12-08") && f26.has("2026-08-15") && f26.has("2026-11-02"));
  assert.equal(feriados(2023).has("2023-11-20"), false, "Consciencia Negra so' desde 2024");
  const r = calcular(entrada({ tarefas: [tarefa("a", { actualStartedAt: "2026-06-01" })] }));
  assert.equal(r.diasTrabalhados, 23);
  assert.equal(r.horasDisponiveis, 184);
  assert.equal(motivoDiaNaoUtil("2026-07-04", []), "sábado");
  assert.equal(motivoDiaNaoUtil("2026-07-06", [{ de: "2026-07-06", ate: "2026-07-10" }]), "ausência");
  assert.equal(motivoDiaNaoUtil("2026-07-07", []), null);
});

test("diaSP usa o fuso de Sao Paulo (23h30 do dia 5 la' ainda e' dia 5, mesmo sendo dia 6 em UTC)", () => {
  assert.equal(diaSP(new Date("2026-08-06T02:30:00.000Z")), "2026-08-05");
  assert.equal(diaSP(new Date("2026-08-06T04:00:00.000Z")), "2026-08-06");
});

// ---------------------------------------------------------------- janelas: so' tarefa INICIADA conta

test("tarefa nunca iniciada nao tem janela (datas previstas nao contam: nem existem mais na entrada)", () => {
  assert.deepEqual(janelasDaTarefa(tarefa("a", { status: "A_FAZER" }), "2026-07-31").janelas, []);
  const r = calcular(entrada({ tarefas: [tarefa("a", { status: "A_FAZER" })] }));
  assert.equal(r.horasAlocadas, 0);
  assert.equal(r.horasSemApontamento, 184);
});

test("historico de status: so' os dias em Fazendo; Bloqueado e A fazer pausam", () => {
  const t = tarefa("a", { eventos: [
    { em: "2026-07-01", de: "A_FAZER", para: "FAZENDO" }, { em: "2026-07-08", de: "FAZENDO", para: "BLOQUEADO" },
    { em: "2026-07-15", de: "BLOQUEADO", para: "FAZENDO" }, { em: "2026-07-20", de: "FAZENDO", para: "FEITO" },
  ], status: "FEITO", actualEndedAt: "2026-07-20" });
  const { janelas, porHistorico } = janelasDaTarefa(t, "2026-07-31");
  assert.equal(porHistorico, true);
  assert.deepEqual(janelas, [{ de: "2026-07-01", ate: "2026-07-08" }, { de: "2026-07-15", ate: "2026-07-20" }]);
});

test("sem historico: do inicio real ao fim real; Fazendo vai ate hoje; parada conta ate a ultima movimentacao; concluida sem datas = dia da conclusao", () => {
  assert.deepEqual(janelasDaTarefa(tarefa("a", { actualStartedAt: "2026-07-02", status: "FAZENDO" }), "2026-07-10").janelas, [{ de: "2026-07-02", ate: "2026-07-10" }]);
  assert.deepEqual(janelasDaTarefa(tarefa("a", { actualStartedAt: "2026-07-02", actualEndedAt: "2026-07-06", status: "FEITO" }), "2026-07-10").janelas, [{ de: "2026-07-02", ate: "2026-07-06" }]);
  assert.deepEqual(janelasDaTarefa(tarefa("a", { actualStartedAt: "2026-07-02", status: "BLOQUEADO", atualizadaEm: "2026-07-05" }), "2026-07-10").janelas, [{ de: "2026-07-02", ate: "2026-07-05" }]);
  assert.deepEqual(janelasDaTarefa(tarefa("a", { status: "FEITO", atualizadaEm: "2026-07-09" }), "2026-07-10").janelas, [{ de: "2026-07-09", ate: "2026-07-09" }]);
});

test("a janela nunca passa de hoje", () => {
  const j = janelasDaTarefa(tarefa("a", { actualStartedAt: "2026-07-02", status: "FAZENDO" }), "2026-07-03").janelas;
  assert.deepEqual(j, [{ de: "2026-07-02", ate: "2026-07-03" }]);
});

// ---------------------------------------------------------------- troca de responsavel

test("mandatos: o dia da troca e' de quem recebeu; quem passou a tarefa fica ate a vespera", () => {
  const ev = [{ em: "2026-07-10", de: "ana", para: "bia" }, { em: "2026-07-20", de: "bia", para: "ana" }];
  assert.deepEqual(mandatosDaPessoa("ana", ev), [{ de: null, ate: "2026-07-09" }, { de: "2026-07-20", ate: null }]);
  assert.deepEqual(mandatosDaPessoa("bia", ev), [{ de: "2026-07-10", ate: "2026-07-19" }]);
  assert.equal(mandatosDaPessoa("ana", []), null);
  assert.deepEqual(mandatosDaPessoa("carla", ev), []);
});

test("so' o periodo em que a tarefa era da pessoa conta (a mesma tarefa Fazendo nao cai nas duas pessoas no mesmo dia)", () => {
  const ev = [{ em: "2026-07-10", de: "ana", para: "bia" }];
  const comum = { actualStartedAt: "2026-07-01", status: "FAZENDO" as const };
  const ana = calcular(entrada({ tarefas: [tarefa("a", { ...comum, mandatos: mandatosDaPessoa("ana", ev) })], hoje: "2026-07-31" }));
  const bia = calcular(entrada({ tarefas: [tarefa("a", { ...comum, mandatos: mandatosDaPessoa("bia", ev) })], hoje: "2026-07-31" }));
  const dias = (r: typeof ana) => new Set(r.matriz.map((c) => c.d));
  assert.equal([...dias(ana)].every((d) => d <= "2026-07-09"), true);
  assert.equal([...dias(bia)].every((d) => d >= "2026-07-10"), true);
  assert.equal(dias(ana).size + dias(bia).size, 23, "juntas cobrem os 23 dias trabalhados, sem dobrar nenhum");
});

// ---------------------------------------------------------------- distribuicao

test("distribuicao: uma tarefa ocupa o dia inteiro; duas tarefas no mesmo dia dividem (ninguem dobra)", () => {
  const um = distribuirEsforco({ capacidade: [8], tarefas: [{ dias: [0], declarado: null }] });
  assert.deepEqual(um.horas, [[8]]);
  const dois = distribuirEsforco({ capacidade: [8], tarefas: [{ dias: [0], declarado: null }, { dias: [0], declarado: null }] });
  assert.deepEqual(dois.horas, [[4], [4]]);
});

test("distribuicao: horas declaradas fecham o total da tarefa, espalhado pelos dias em que esteve ativa", () => {
  const r = distribuirEsforco({ capacidade: [8, 8, 8, 8, 8], tarefas: [{ dias: [0, 1, 2, 3, 4], declarado: 20 }] });
  r.horas[0].forEach((h) => perto(h, 4));
  assert.equal(r.excesso[0], 0);
  assert.equal(r.convergiu, true);
});

test("distribuicao: a declarada fica com o que declarou e a nao declarada ocupa o resto da jornada", () => {
  const r = distribuirEsforco({ capacidade: [8, 8, 8, 8, 8], tarefas: [{ dias: [0, 1, 2, 3, 4], declarado: 16 }, { dias: [0, 1, 2, 3, 4], declarado: null }] });
  perto(soma(r.horas[0]), 16);
  perto(soma(r.horas[1]), 24);
  for (let d = 0; d < 5; d++) perto(r.horas[0][d] + r.horas[1][d], 8);
});

test("distribuicao: declarou mais do que cabe na jornada -> fica o maximo que cabe e o excesso e' apontado, nunca inventado", () => {
  const r = distribuirEsforco({ capacidade: [8, 8], tarefas: [{ dias: [0, 1], declarado: 100 }] });
  perto(soma(r.horas[0]), 16);
  perto(r.excesso[0], 84);
  const duas = distribuirEsforco({ capacidade: [8, 8], tarefas: [{ dias: [0, 1], declarado: 12 }, { dias: [0, 1], declarado: 12 }] });
  perto(soma(duas.horas[0]) + soma(duas.horas[1]), 16, 1e-6);
  perto(duas.excesso[0] + duas.excesso[1], 8, 1e-5);
});

test("distribuicao: declaradas que disputam dias diferentes ajustam uns aos outros (ajuste proporcional iterativo)", () => {
  // A cobre os dias 0..3 (declarou 20), B so' os dias 2..3 (declarou 12): nos dias 2 e 3 cabem 16 no total
  const r = distribuirEsforco({ capacidade: [8, 8, 8, 8], tarefas: [{ dias: [0, 1, 2, 3], declarado: 20 }, { dias: [2, 3], declarado: 12 }] });
  perto(soma(r.horas[0]), 20);
  perto(soma(r.horas[1]), 12);
  for (let d = 0; d < 4; d++) {
    const colunas = r.horas[0][d] + (d >= 2 ? r.horas[1][d - 2] : 0);
    assert.ok(colunas <= 8 + 1e-6, `dia ${d}: ${colunas}`);
  }
  assert.equal(r.convergiu, true);
});

test("distribuicao: tarefa declarada com 0 dias ativos nao quebra e a nao declarada sozinha no dia leva o dia todo", () => {
  const r = distribuirEsforco({ capacidade: [8], tarefas: [{ dias: [], declarado: 5 }, { dias: [0], declarado: null }] });
  assert.deepEqual(r.horas, [[], [8]]);
});

test("invariantes (500 cenarios aleatorios): jornada nunca estoura, declarado fecha ou vira excesso, nao declaradas dividem por igual, jornada nao some", () => {
  const rnd = aleatorio(20261102);
  for (let cenario = 0; cenario < 500; cenario++) {
    const nDias = 1 + Math.floor(rnd() * 12);
    const nTar = 1 + Math.floor(rnd() * 6);
    const capacidade = Array.from({ length: nDias }, () => (rnd() < 0.15 ? 4 : 8));
    const tarefas = Array.from({ length: nTar }, () => {
      const dias = Array.from({ length: nDias }, (_, d) => d).filter(() => rnd() < 0.6);
      const declarado = rnd() < 0.5 ? Math.round(rnd() * 90 * 100) / 100 + 0.25 : null;
      return { dias, declarado };
    });
    const r = distribuirEsforco({ capacidade, tarefas });
    const porDia = new Array(nDias).fill(0);
    const livresPorDia: number[][] = Array.from({ length: nDias }, () => []);
    tarefas.forEach((t, i) => t.dias.forEach((d, k) => {
      const h = r.horas[i][k];
      assert.ok(h >= -1e-9, "hora negativa");
      porDia[d] += h;
      if (t.declarado === null) livresPorDia[d].push(h);
    }));
    porDia.forEach((s, d) => assert.ok(s <= capacidade[d] + 1e-6, `cenario ${cenario} dia ${d}: ${s} > ${capacidade[d]}`));
    tarefas.forEach((t, i) => {
      if (t.declarado !== null && t.dias.length > 0) perto(soma(r.horas[i]) + r.excesso[i], t.declarado, 1e-5);
      else if (t.declarado !== null) perto(r.excesso[i], t.declarado); // declarou horas mas nao teve nenhum dia trabalhado: nada coube
      else assert.equal(r.excesso[i], 0);
    });
    livresPorDia.forEach((hs, d) => {
      if (hs.length === 0) return;
      hs.forEach((h) => perto(h, hs[0]));
      perto(porDia[d], capacidade[d], 1e-6); // com tarefa livre ativa o dia e' totalmente aproveitado
    });
  }
});

// ---------------------------------------------------------------- arredondamento

test("arredondarSomando: a soma fecha exatamente no total", () => {
  const rnd = aleatorio(7);
  for (let i = 0; i < 300; i++) {
    const n = 1 + Math.floor(rnd() * 9);
    const v = Array.from({ length: n }, () => rnd() * 100);
    const total = Math.round(soma(v) * 100) / 100;
    const r = arredondarSomando(v, soma(v));
    perto(soma(r), total, 1e-6);
    r.forEach((x, k) => assert.ok(Math.abs(x - v[k]) <= 0.0101, "cada parcela fica a menos de 1 centesimo do valor real"));
  }
  assert.deepEqual(arredondarSomando([1 / 3, 1 / 3, 1 / 3], 1), [0.34, 0.33, 0.33]);
  assert.deepEqual(arredondarSomando([], 0), []);
});

// ---------------------------------------------------------------- relatorio

test("uma tarefa o mes todo: 100% para o centro de custo do projeto, com as horas dos dias trabalhados", () => {
  const r = calcular(entrada({ tarefas: [tarefa("a", { actualStartedAt: "2026-06-15" })] }));
  assert.equal(r.centros.length, 1);
  assert.equal(r.centros[0].codccu, "190");
  assert.equal(r.centros[0].horas, 184);
  assert.equal(r.centros[0].percentual, 100);
  assert.equal(r.horasSemApontamento, 0);
  assert.equal(r.percentualIdentificado, 100);
});

test("tarefas simultaneas NAO dobram: duas Fazendo o mes todo = 184 h no total (92 + 92), nunca 368", () => {
  const r = calcular(entrada({ tarefas: [tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("b", { codccu: "230", actualStartedAt: "2026-07-01" })] }));
  assert.deepEqual(r.centros.map((c) => [c.codccu, c.horas, c.percentual]), [["190", 92, 50], ["230", 92, 50]]);
  assert.equal(r.horasAlocadas, 184);
});

test("tarefa que cobre so' parte do mes: o dia e' dividido so' nos dias em que ela existe", () => {
  const r = calcular(entrada({ tarefas: [tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("b", { codccu: "230", actualStartedAt: "2026-07-20", actualEndedAt: "2026-07-24", status: "FEITO" })] }));
  const c = Object.fromEntries(r.centros.map((x) => [x.codccu, x.horas]));
  assert.equal(c["230"], 20); // 5 dias, metade do dia
  assert.equal(c["190"], 164);
  assert.equal(r.horasAlocadas, 184);
});

test("fim de semana, feriado e ausencia ficam de fora (nao sao trabalhados) e entram nas contagens", () => {
  const r = calcular(entrada({ de: "2026-11-01", ate: "2026-11-30", hoje: "2026-12-01", ausencias: [{ de: "2026-11-09", ate: "2026-11-10" }], tarefas: [tarefa("a", { actualStartedAt: "2026-10-01" })] }));
  // novembro/2026: 21 dias de semana, menos Finados (02) e Consciencia Negra (20), menos 2 de ausencia
  assert.equal(r.diasFeriado, 2);
  assert.equal(r.diasAusencia, 2);
  assert.equal(r.diasTrabalhados, 17);
  assert.equal(r.horasAlocadas, 136);
  assert.ok(r.matriz.every((c) => !["2026-11-02", "2026-11-09", "2026-11-10", "2026-11-20", "2026-11-07", "2026-11-08"].includes(c.d)));
});

test("horas dedicadas ancoram o calculo: A declarou 16 h e B nao declarou, no mesmo periodo de 5 dias (40 h) -> A 40%, B 60%", () => {
  const r = calcular(entrada({ de: "2026-07-06", ate: "2026-07-10", hoje: "2026-07-10", tarefas: [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-06", actualEndedAt: "2026-07-10", status: "FEITO", horasDedicadas: 16 }),
    tarefa("b", { codccu: "230", actualStartedAt: "2026-07-06", actualEndedAt: "2026-07-10", status: "FEITO", horasDedicadas: null }),
  ] }));
  assert.deepEqual(r.centros.map((c) => [c.codccu, c.horas, c.percentual]), [["230", 24, 60], ["190", 16, 40]]);
  const a = r.centros.flatMap((c) => c.projetos.flatMap((p) => p.tarefas)).find((t) => t.id === "a")!;
  assert.equal(a.fonte, "declarado");
  assert.equal(a.declarado, 16);
});

test("horas declaradas valem pela vida inteira da tarefa: o periodo consultado mostra so' a parte dele", () => {
  const t = tarefa("a", { actualStartedAt: "2026-07-01", actualEndedAt: "2026-07-31", status: "FEITO", horasDedicadas: 46 });
  const mes = calcular(entrada({ tarefas: [t] }));
  assert.equal(mes.horasAlocadas, 46);
  const semana = calcular(entrada({ de: "2026-07-06", ate: "2026-07-10", tarefas: [t] }));
  assert.equal(semana.horasAlocadas, 10); // 46 h / 23 dias = 2 h por dia x 5 dias
});

test("projeto sem centro de custo e tarefa sem projeto ficam em linhas proprias (nunca vao para um centro por palpite)", () => {
  const r = calcular(entrada({ tarefas: [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }),
    tarefa("b", { codccu: null, actualStartedAt: "2026-07-01" }),
    tarefa("c", { projetoId: null, projetoNome: null, codccu: null, actualStartedAt: "2026-07-01" }),
  ] }));
  const chaves = r.centros.map((c) => c.chave).sort();
  assert.deepEqual(chaves, [SEM_CENTRO, SEM_PROJETO, "190"].sort());
  assert.ok(r.percentualIdentificado < 40 && r.percentualIdentificado > 30);
  assert.ok(r.avisos.some((a) => a.tipo === "SEM_CENTRO"));
});

test("marcos (entrega) e tarefa-mae com subtarefa da pessoa nao contam", () => {
  const r = calcular(entrada({ tarefas: [tarefa("a", { isEntrega: true, actualStartedAt: "2026-07-01" }), tarefa("b", { temSubtarefaDaPessoa: true, actualStartedAt: "2026-07-01" })] }));
  assert.equal(r.horasAlocadas, 0);
});

test("a pessoa so' e' contada a partir da ativacao; antes disso nao ha horas", () => {
  const r = calcular(entrada({ desde: "2026-07-15", tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] }));
  assert.equal(r.de, "2026-07-15");
  assert.ok(r.matriz.every((c) => c.d >= "2026-07-15"));
  assert.equal(r.diasTrabalhados, 13);
});

test("retroativo: dias anteriores ao inicio oficial do sistema ficam marcados", () => {
  const r = calcular(entrada({ inicioOficial: "2026-07-15", tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] }));
  assert.equal(r.retroativo, true);
  assert.equal(r.diasRetroativos, 10);
  assert.equal(calcular(entrada({ tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] })).retroativo, false);
});

test("filtro de periodo: qualquer recorte (semana, quinzena) soma exatamente o que o mes soma", () => {
  const ts = [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01", horasDedicadas: 60, actualEndedAt: "2026-07-24", status: "FEITO" }),
    tarefa("b", { codccu: "230", actualStartedAt: "2026-07-08" }),
    tarefa("c", { codccu: "250", actualStartedAt: "2026-07-15", actualEndedAt: "2026-07-31", status: "FEITO", horasDedicadas: 20 }),
  ];
  const mes = calcular(entrada({ tarefas: ts }));
  const cortes: [string, string][] = [["2026-07-01", "2026-07-10"], ["2026-07-11", "2026-07-20"], ["2026-07-21", "2026-07-31"]];
  const partes = cortes.map(([de, ate]) => calcular(entrada({ de, ate, tarefas: ts })));
  perto(soma(partes.map((p) => p.horasAlocadas)), mes.horasAlocadas, 0.011);
  for (const c of mes.centros) perto(soma(partes.map((p) => p.centros.find((x) => x.chave === c.chave)?.horas ?? 0)), c.horas, 0.021);
});

test("mes fechado vale pela fotografia: mexer na tarefa depois nao muda o que foi fechado", () => {
  const t = tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01", actualEndedAt: "2026-07-31", status: "FEITO", horasDedicadas: 46 });
  const fechado = calcular(entrada({ tarefas: [t] }));
  const depois = calcular(entrada({ tarefas: [{ ...t, codccu: "999", horasDedicadas: 100 }], congelados: { "2026-07": { matriz: fechado.matriz, metas: fechado.metas } } }));
  assert.equal(depois.horasAlocadas, fechado.horasAlocadas);
  assert.deepEqual(depois.centros.map((c) => [c.chave, c.horas]), fechado.centros.map((c) => [c.chave, c.horas]));
});

test("ao vivo: o dia de hoje e' dividido por igual entre o que esta em Fazendo agora, por centro de custo", () => {
  const r = calcular(entrada({ hoje: "2026-07-15", tarefas: [
    tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("b", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("c", { codccu: "230", actualStartedAt: "2026-07-01" }),
    tarefa("d", { codccu: "250", actualStartedAt: "2026-07-01", status: "BLOQUEADO", atualizadaEm: "2026-07-10" }),
  ] }));
  assert.ok(r.agora);
  assert.equal(r.agora!.tarefas.length, 3);
  assert.deepEqual(r.agora!.centros.map((c) => c.chave), ["190", "230"]);
  perto(r.agora!.centros[0].fracao, 2 / 3);
  perto(r.agora!.centros[1].fracao, 1 / 3);
  assert.equal(calcular(entrada({ hoje: "2026-07-18", tarefas: [tarefa("a", { actualStartedAt: "2026-07-01" })] })).agora, null, "sabado: sem dia trabalhado, sem 'agora'");
});

test("avisos: concluida sem horas, parada ha mais de 7 dias, e horas declaradas que nao cabem", () => {
  const r = calcular(entrada({ hoje: "2026-07-31", tarefas: [
    tarefa("a", { actualStartedAt: "2026-07-01", actualEndedAt: "2026-07-03", status: "FEITO" }),
    tarefa("b", { actualStartedAt: "2026-07-01", status: "FAZENDO", atualizadaEm: "2026-07-10" }),
    tarefa("c", { actualStartedAt: "2026-07-06", actualEndedAt: "2026-07-07", status: "FEITO", horasDedicadas: 200 }),
  ] }));
  const tipos = r.avisos.map((a) => `${a.tipo}:${a.tarefaId}`);
  assert.ok(tipos.includes("SEM_HORAS:a"));
  assert.ok(tipos.includes("PARADA:b"));
  assert.ok(tipos.includes("EXCESSO:c"));
});

test("sem apontamento: dias trabalhados sem nenhuma tarefa em andamento viram horas sem apontamento, nao entram no percentual", () => {
  const r = calcular(entrada({ tarefas: [tarefa("a", { actualStartedAt: "2026-07-01", actualEndedAt: "2026-07-10", status: "FEITO" })] }));
  assert.equal(r.horasAlocadas, 64);
  assert.equal(r.horasSemApontamento, 120);
  assert.equal(r.diasSemTarefa.length, 15);
  assert.equal(r.centros[0].percentual, 100);
});

test("invariantes do relatorio (300 cenarios aleatorios): jornada, centros, projetos e tarefas somam o mesmo total; % fecha em 100", () => {
  const rnd = aleatorio(31102026);
  const dia = (n: number) => somaDias("2026-06-01", n);
  for (let cenario = 0; cenario < 300; cenario++) {
    const n = 1 + Math.floor(rnd() * 6);
    const ts: TarefaTS[] = Array.from({ length: n }, (_, i) => {
      const ini = Math.floor(rnd() * 50);
      const fim = ini + Math.floor(rnd() * 30);
      const status = (["A_FAZER", "FAZENDO", "BLOQUEADO", "FEITO"] as const)[Math.floor(rnd() * 4)];
      const ccs = ["190", "230", "250", null];
      return tarefa(`t${i}`, {
        codccu: ccs[Math.floor(rnd() * ccs.length)], projetoId: rnd() < 0.1 ? null : `p${Math.floor(rnd() * 3)}`, projetoNome: "Proj", status,
        actualStartedAt: status === "A_FAZER" && rnd() < 0.5 ? null : dia(ini), actualEndedAt: status === "FEITO" ? dia(fim) : null,
        horasDedicadas: rnd() < 0.5 ? Math.round(rnd() * 120 * 4) / 4 + 1 : null, atualizadaEm: dia(fim),
      });
    });
    const aus = rnd() < 0.5 ? [{ de: dia(20), ate: dia(24) }] : [];
    const r = calcular(entrada({ de: "2026-07-01", ate: "2026-07-31", hoje: "2026-08-10", ausencias: aus, tarefas: ts }));
    const porDia = new Map<string, number>();
    for (const c of r.matriz) porDia.set(c.d, (porDia.get(c.d) ?? 0) + c.h);
    porDia.forEach((h, d) => assert.ok(h <= 8 + 0.011 * 10, `cenario ${cenario} ${d}: ${h} h no dia`));
    assert.ok(r.matriz.every((c) => motivoDiaNaoUtil(c.d, aus) === null), "hora em dia nao trabalhado");
    perto(soma(r.centros.map((c) => c.horas)), r.horasAlocadas, 0.0001);
    r.centros.forEach((c) => {
      perto(soma(c.projetos.map((p) => p.horas)), c.horas, 0.0001);
      c.projetos.forEach((p) => perto(soma(p.tarefas.map((t) => t.horas)), p.horas, 0.0001));
    });
    if (r.horasAlocadas > 0) perto(soma(r.centros.map((c) => c.percentual)), 100, 0.0001);
    perto(r.horasAlocadas + r.horasSemApontamento >= r.horasDisponiveis ? 0 : 1, 0, 0); // alocadas + sem apontamento cobrem a jornada
    assert.ok(r.horasAlocadas <= r.horasDisponiveis + 0.5);
  }
});

// ---------------------------------------------------------------- v3: falhas encontradas na auditoria da conta

test("tarefa EM ANDAMENTO com horas informadas: o passado nao escorrega com o passar dos dias", () => {
  // informou 16 h no dia 08/07 (2 dias de trabalho: 7 e 8); a tarefa continua em Fazendo
  const t = tarefa("a", { actualStartedAt: "2026-07-07", status: "FAZENDO", horasDedicadas: 16, horasDedicadasEm: "2026-07-08", atualizadaEm: "2026-07-08" });
  const dia8 = calcular(entrada({ de: "2026-07-01", ate: "2026-07-31", hoje: "2026-07-08", tarefas: [t] }));
  const dia14 = calcular(entrada({ de: "2026-07-01", ate: "2026-07-31", hoje: "2026-07-14", tarefas: [{ ...t, atualizadaEm: "2026-07-14" }] }));
  const ate8 = (r: typeof dia8) => r.matriz.filter((c) => c.d <= "2026-07-08").map((c) => `${c.d}:${c.h}`).join(",");
  assert.equal(ate8(dia8), "2026-07-07:8,2026-07-08:8");
  assert.equal(ate8(dia14), ate8(dia8), "os dias ja informados nao mudam quando passam mais dias");
  assert.equal(dia14.horasAlocadas, 16 + 4 * 8, "os dias depois da informacao (9 a 14: 4 dias uteis) sao estimados");
});

test("tarefa CONCLUIDA com horas: as horas valem pela vida inteira (nao e' dividida)", () => {
  const t = tarefa("a", { actualStartedAt: "2026-07-07", actualEndedAt: "2026-07-10", status: "FEITO", horasDedicadas: 20, horasDedicadasEm: "2026-07-10" });
  assert.equal(calcular(entrada({ hoje: "2026-07-31", tarefas: [t] })).horasAlocadas, 20);
});

test("concluida direto de A fazer para Feito: conta quando ha horas informadas; sem horas nao conta e avisa", () => {
  const ev = [{ em: "2026-07-08", de: "A_FAZER" as const, para: "FEITO" as const }];
  const comHoras = tarefa("a", { status: "FEITO", eventos: ev, actualStartedAt: "2026-07-08", actualEndedAt: "2026-07-08", horasDedicadas: 3, horasDedicadasEm: "2026-07-08" });
  const r1 = calcular(entrada({ hoje: "2026-07-31", tarefas: [comHoras] }));
  assert.equal(r1.horasAlocadas, 3);
  const semHoras = tarefa("b", { status: "FEITO", eventos: ev, actualStartedAt: "2026-07-08", actualEndedAt: "2026-07-08" });
  const r2 = calcular(entrada({ hoje: "2026-07-31", tarefas: [semHoras] }));
  assert.equal(r2.horasAlocadas, 0);
  assert.ok(r2.avisos.some((a) => a.tipo === "NAO_CONTADA" && a.tarefaId === "b"));
});

test("trabalho so' em fim de semana ou feriado nao entra, mas avisa (nao some em silencio)", () => {
  const sab = tarefa("a", { status: "FEITO", actualStartedAt: "2026-07-04", actualEndedAt: "2026-07-05", horasDedicadas: 6, horasDedicadasEm: "2026-07-05" });
  const r = calcular(entrada({ hoje: "2026-07-31", tarefas: [sab] }));
  assert.equal(r.horasAlocadas, 0);
  assert.ok(r.avisos.some((a) => a.tipo === "NAO_CONTADA" && a.tarefaId === "a"));
});

test("horas pertencem a quem informou: horasDoDono", () => {
  const ev = [{ em: "2026-07-10", de: "ana", para: "bia", horasDoAnterior: 12 }];
  assert.equal(horasDoDono("ana", "bia", null, ev), 12, "quem passou a tarefa mantem as horas que informou");
  assert.equal(horasDoDono("bia", "bia", null, ev), null, "quem recebeu comeca do zero");
  assert.equal(horasDoDono("bia", "bia", 5, ev), 5);
  const volta = [...ev, { em: "2026-07-20", de: "bia", para: "ana", horasDoAnterior: 7 }];
  assert.equal(horasDoDono("ana", "ana", null, volta), 12, "ao voltar, retoma o que informou antes");
  assert.equal(horasDoDono("bia", "ana", null, volta), 7);
  assert.equal(horasDoDono("carla", "ana", 9, volta), null);
});

test("troca de responsavel: as horas de uma tarefa nao sao contadas duas vezes", () => {
  const ev = [{ em: "2026-07-14", de: "ana", para: "bia", horasDoAnterior: 24 as number | null }];
  const base = { actualStartedAt: "2026-07-07", actualEndedAt: "2026-07-21", status: "FEITO" as const };
  const ana = calcular(entrada({ hoje: "2026-07-31", tarefas: [tarefa("a", { ...base, mandatos: mandatosDaPessoa("ana", ev), horasDedicadas: horasDoDono("ana", "bia", null, ev) })] }));
  const bia = calcular(entrada({ hoje: "2026-07-31", tarefas: [tarefa("a", { ...base, mandatos: mandatosDaPessoa("bia", ev), horasDedicadas: horasDoDono("bia", "bia", 40, ev), horasDedicadasEm: "2026-07-21" })] }));
  assert.equal(ana.horasAlocadas, 24, "Ana: o que ela informou, nos dias dela (7 a 13)");
  assert.equal(bia.horasAlocadas, 40, "Bia: o que ela informou, nos dias dela (14 a 21)");
});

test("mes fechado nao deriva em centavos: ler a fotografia devolve exatamente os mesmos totais", () => {
  const ts = [tarefa("a", { codccu: "190", actualStartedAt: "2026-07-01" }), tarefa("b", { codccu: "230", actualStartedAt: "2026-07-01" }), tarefa("c", { codccu: "250", actualStartedAt: "2026-07-01" })];
  const vivo = calcular(entrada({ tarefas: ts }));
  const lido = calcular(entrada({ tarefas: [], congelados: { "2026-07": { matriz: JSON.parse(JSON.stringify(vivo.matriz)), metas: vivo.metas } } }));
  assert.equal(lido.horasAlocadas, vivo.horasAlocadas);
  assert.deepEqual(lido.centros.map((c) => [c.chave, c.horas, c.percentual]), vivo.centros.map((c) => [c.chave, c.horas, c.percentual]));
});

test("invariantes com horas em andamento (200 cenarios): jornada nunca estoura e o recorte soma o total", () => {
  const rnd = aleatorio(4112026);
  const dia = (n: number) => somaDias("2026-06-15", n);
  for (let cenario = 0; cenario < 200; cenario++) {
    const n = 1 + Math.floor(rnd() * 5);
    const ts: TarefaTS[] = Array.from({ length: n }, (_, i) => {
      const ini = Math.floor(rnd() * 40);
      const emAndamento = rnd() < 0.6;
      return tarefa(`t${i}`, {
        codccu: ["190", "230", null][Math.floor(rnd() * 3)], status: emAndamento ? "FAZENDO" : "FEITO", actualStartedAt: dia(ini),
        actualEndedAt: emAndamento ? null : dia(ini + Math.floor(rnd() * 20)),
        horasDedicadas: rnd() < 0.6 ? Math.round(rnd() * 60) + 2 : null, horasDedicadasEm: dia(ini + Math.floor(rnd() * 12)), atualizadaEm: dia(ini + 3),
      });
    });
    const hoje = "2026-08-15";
    const mes = calcular(entrada({ de: "2026-07-01", ate: "2026-07-31", hoje, tarefas: ts }));
    const porDia = new Map<string, number>();
    for (const c of mes.matriz) porDia.set(c.d, (porDia.get(c.d) ?? 0) + c.h);
    porDia.forEach((h, d) => assert.ok(h <= 8 + 1e-6, `cenario ${cenario} ${d}: ${h}`));
    const a = calcular(entrada({ de: "2026-07-01", ate: "2026-07-15", hoje, tarefas: ts }));
    const b = calcular(entrada({ de: "2026-07-16", ate: "2026-07-31", hoje, tarefas: ts }));
    perto(a.horasAlocadas + b.horasAlocadas, mes.horasAlocadas, 0.011);
  }
});
