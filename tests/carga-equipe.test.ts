import test from "node:test";
import assert from "node:assert/strict";
import { cargaPorPessoa } from "../src/lib/projetos/carga";

const hoje = new Date("2026-10-25T12:00:00.000Z");
const ana = { id: "a", name: "Ana" };
const bia = { id: "b", name: "Bia" };
const t = (status: string, due: string | null, assignee: { id: string; name: string } | null) => ({ status, dueDate: due ? `${due}T00:00:00.000Z` : null, assignee });

test("carga: abertas, atrasadas, vence em 7 dias, bloqueadas e semana a semana por pessoa", () => {
  const c = cargaPorPessoa([
    t("FEITO", "2026-10-01", ana), // feita nao conta
    t("FAZENDO", "2026-10-20", ana), // atrasada
    t("A_FAZER", "2026-10-25", ana), // vence hoje: semana 1 e vence em 7
    t("A_FAZER", "2026-11-01", ana), // 7 dias: ainda "vence em 7", mas ja' cai na semana 2
    t("BLOQUEADO", "2026-11-10", ana), // semana 3
    t("A_FAZER", null, ana), // sem prazo
    t("A_FAZER", "2027-03-01", bia), // alem das 4 semanas: so' conta como aberta
    t("A_FAZER", "2026-10-30", null), // sem responsavel
    t("FAZENDO", "2026-10-01", null), // sem responsavel e atrasada
  ], hoje);
  assert.deepEqual(c.linhas.map((l) => l.nome), ["Ana", "Bia"], "mais carregada primeiro");
  const a = c.linhas[0];
  assert.deepEqual({ abertas: a.abertas, atrasadas: a.atrasadas, venceEm7: a.venceEm7, bloqueadas: a.bloqueadas, semPrazo: a.semPrazo }, { abertas: 5, atrasadas: 1, venceEm7: 2, bloqueadas: 1, semPrazo: 1 });
  assert.deepEqual(a.semanas, [1, 1, 1, 0]);
  const b = c.linhas[1];
  assert.deepEqual({ abertas: b.abertas, atrasadas: b.atrasadas }, { abertas: 1, atrasadas: 0 });
  assert.deepEqual(b.semanas, [0, 0, 0, 0]);
  assert.deepEqual(c.semResponsavel, { abertas: 2, atrasadas: 1, semPrazo: 0 });
});

test("carga sem tarefas ou so' com tarefas feitas: lista vazia", () => {
  assert.deepEqual(cargaPorPessoa([], hoje).linhas, []);
  assert.deepEqual(cargaPorPessoa([t("FEITO", "2026-10-01", { id: "a", name: "Ana" })], hoje).linhas, []);
  assert.deepEqual(cargaPorPessoa([], hoje).semResponsavel, { abertas: 0, atrasadas: 0, semPrazo: 0 });
});

test("desempate: mesma carga, mais atrasadas primeiro e depois ordem alfabetica", () => {
  const c = cargaPorPessoa([t("A_FAZER", "2026-12-01", { id: "z", name: "Zeca" }), t("A_FAZER", "2026-10-01", { id: "m", name: "Marta" }), t("A_FAZER", "2026-12-01", { id: "c", name: "Caio" })], hoje);
  assert.deepEqual(c.linhas.map((l) => l.nome), ["Marta", "Caio", "Zeca"]);
});
