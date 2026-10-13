import { test } from "node:test";
import assert from "node:assert/strict";
import { diasNoLocal, localizacaoNoDia, planejarMovimento, proximoMovimento, resumoPorContrato, type MovimentoBase } from "../src/lib/efetivos/veiculos";

// Regras puras (sem banco): rodam com `tsx --test`.

const mov = (id: string, veiculoId: string, inicio: string, fim: string | null, projeto: string): MovimentoBase => ({
  id, veiculoId, inicio, fim, projeto, equipeId: null, campanhaId: null, local: null,
});

test("Onde o veiculo esta no dia: passagem aberta, fechada e sem registro", () => {
  const ms = [mov("a", "v1", "2026-09-01", "2026-09-30", "3636 PNM"), mov("b", "v1", "2026-10-01", null, "3687 LT")];
  assert.equal(localizacaoNoDia(ms, "2026-09-15")?.projeto, "3636 PNM");
  assert.equal(localizacaoNoDia(ms, "2026-09-30")?.projeto, "3636 PNM"); // ultimo dia inclusivo
  assert.equal(localizacaoNoDia(ms, "2026-10-01")?.projeto, "3687 LT");
  assert.equal(localizacaoNoDia(ms, "2027-03-01")?.projeto, "3687 LT"); // sem fim = continua la
  assert.equal(localizacaoNoDia(ms, "2026-08-31"), null);
  assert.equal(proximoMovimento(ms, "2026-09-15")?.id, "b");
  assert.equal(proximoMovimento(ms, "2026-10-05"), null);
  assert.equal(diasNoLocal(ms[1], "2026-10-13"), 13);
});

test("Mover veiculo: fecha a passagem aberta no dia anterior e nao apaga historico", () => {
  const ms = [mov("a", "v1", "2026-09-01", null, "3636 PNM")];
  const p = planejarMovimento(ms, { inicio: "2026-10-10", fim: null });
  assert.deepEqual(p, { ok: true, fecharAnterior: { id: "a", fim: "2026-10-09" }, fimNovo: null });
});

test("Mover veiculo: passagem futura ja agendada corta o fim da nova; sobreposicao fechada e recusada", () => {
  const futura = [mov("a", "v1", "2026-09-01", null, "A"), mov("f", "v1", "2026-11-01", null, "C")];
  // a "a" continua aberta apesar de ja haver uma futura: nova em 10/10 fecha "a" e termina em 31/10
  const p = planejarMovimento(futura, { inicio: "2026-10-10", fim: null });
  assert.deepEqual(p, { ok: true, fecharAnterior: { id: "a", fim: "2026-10-09" }, fimNovo: "2026-10-31" });
  const fechadas = [mov("a", "v1", "2026-09-01", "2026-09-30", "A"), mov("b", "v1", "2026-10-01", "2026-10-31", "B")];
  const erro = planejarMovimento(fechadas, { inicio: "2026-10-15", fim: "2026-11-05" });
  assert.equal(erro.ok, false);
  const erro2 = planejarMovimento(fechadas, { inicio: "2026-10-05", fim: null }); // comeca dentro de uma passagem ja fechada
  assert.equal(erro2.ok, false);
  const ok = planejarMovimento(fechadas, { inicio: "2026-11-01", fim: "2026-11-10" });
  assert.deepEqual(ok, { ok: true, fecharAnterior: null, fimNovo: "2026-11-10" });
  assert.equal(planejarMovimento([], { inicio: "2026-10-10", fim: "2026-10-01" }).ok, false); // fim antes do inicio
});

test("Resumo por contrato: conta por projeto no dia, por situacao, e separa quem nao tem localizacao", () => {
  const veic = [
    { id: "v1", codigo: "VEI-001", identificacao: "VL 01", placa: null, status: "Em operação" },
    { id: "v2", codigo: "VEI-002", identificacao: "VL 02", placa: null, status: "Em manutenção" },
    { id: "v3", codigo: "VEI-003", identificacao: "VL 03", placa: null, status: "Em operação" },
    { id: "v4", codigo: "VEI-004", identificacao: "VL 04", placa: null, status: "Disponível" },
  ];
  const ms = [mov("a", "v1", "2026-09-01", null, "3636 PNM"), mov("b", "v2", "2026-09-01", null, "3636 PNM"), mov("c", "v3", "2026-10-20", null, "3687 LT")];
  const r = resumoPorContrato(veic, ms, "2026-10-13");
  assert.deepEqual(r.map((x) => [x.projeto, x.total]), [["3636 PNM", 2], ["Sem localização", 2]]); // v3 so chega em 20/10
  assert.deepEqual(r[0].porStatus, { "Em operação": 1, "Em manutenção": 1 });
  assert.deepEqual(resumoPorContrato(veic, ms, "2026-10-25").map((x) => [x.projeto, x.total]), [["3636 PNM", 2], ["3687 LT", 1], ["Sem localização", 1]]);
});
