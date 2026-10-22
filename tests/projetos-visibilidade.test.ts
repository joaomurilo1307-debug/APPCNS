import test from "node:test";
import assert from "node:assert/strict";
import { filtroProjetosComNucleo, filtroProjetosDaPessoa } from "../src/lib/permissions";

test("projetos: so aparece o que a pessoa criou ou em que participa (nunca filtro vazio)", () => {
  const f = filtroProjetosDaPessoa("u1", ["t1", "t2"]);
  assert.ok(Array.isArray(f.OR) && f.OR.length > 0);
  assert.deepEqual(f.OR[0], { ownerId: "u1" });
  assert.deepEqual(f.OR[1], { teamId: { in: ["t1", "t2"] } });
  assert.ok(f.OR.some((c: any) => c.diretores?.some?.id === "u1"), "convidado como diretor do projeto");
  assert.ok(f.OR.some((c: any) => c.coordenadores?.some?.id === "u1"), "convidado como coordenador do projeto");
  assert.ok(f.OR.some((c: any) => c.tasks?.some?.assigneeId === "u1"), "tem tarefa atribuida");
  assert.ok(f.OR.some((c: any) => c.acessos?.some?.userId === "u1"), "convite individual (tela Usuarios > Projetos)");
});

test("projetos: pessoa sem equipe so enxerga o que criou/foi convidada (equipe vazia nao libera nada)", () => {
  const f = filtroProjetosDaPessoa("u2", []);
  assert.deepEqual(f.OR[1], { teamId: { in: [] } });
  assert.ok(f.OR.every((c: any) => JSON.stringify(c).includes("u2") || c.teamId));
});

test("projetos: cada pessoa recebe um filtro diferente (sem vazamento entre usuarios)", () => {
  assert.notDeepEqual(filtroProjetosDaPessoa("a", ["t"]), filtroProjetosDaPessoa("b", ["t"]));
});

test("nucleo: coordenador do nucleo ve os projetos ligados ao nucleo (alem do gerente)", () => {
  const f = filtroProjetosDaPessoa("u1", []);
  assert.ok(f.OR.some((c: any) => c.nucleos?.some?.gerentes?.some?.id === "u1"), "gerente do nucleo");
  assert.ok(f.OR.some((c: any) => c.nucleos?.some?.coordenadores?.some?.id === "u1"), "coordenador do nucleo");
});

test("nucleo (visao NUCLEO): soma os projetos das pessoas do nucleo ao filtro base; sem pessoas nada muda", () => {
  const base = filtroProjetosDaPessoa("g1", ["t1"]);
  assert.equal(filtroProjetosComNucleo(base, []), base);
  const f = filtroProjetosComNucleo(base, ["a", "b", "a"]);
  assert.equal(f.OR.length, base.OR.length + 3);
  assert.deepEqual(f.OR.slice(0, base.OR.length), base.OR, "o que ja via continua");
  assert.ok(f.OR.some((c: any) => c.ownerId?.in?.length === 2), "criados por gente do nucleo, sem repetir");
  assert.ok(f.OR.some((c: any) => c.tasks?.some?.assigneeId?.in?.includes("a")));
  assert.ok(f.OR.some((c: any) => c.team?.members?.some?.userId?.in?.includes("b")));
});
