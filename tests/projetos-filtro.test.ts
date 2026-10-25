import test from "node:test";
import assert from "node:assert/strict";
import { FILTRO_VAZIO, filtrarProjetos, opcoesDosFiltros, type ProjetoLista } from "../src/lib/projetos/filtro";

const p = (name: string, extra: Partial<ProjetoLista> = {}): ProjetoLista => ({
  name, status: "EM_ANDAMENTO", endDate: null, percentComplete: 0, team: { name: "Equipe A" }, owner: { id: "o1", name: "Ana" }, contrato: null, nucleos: [], saude: { nivel: "NO_PRAZO" }, ...extra,
});
const lista = [
  p("Plano de campo", { contrato: { codccu: "280", nome: "SVPM" }, nucleos: [{ id: "n1", name: "SVPM CT 072 2024" }], saude: { nivel: "ATRASADO" }, endDate: "2026-12-01T00:00:00.000Z", percentComplete: 40 }),
  p("Relatórios mensais", { status: "PLANEJADO", owner: { id: "o2", name: "Bia" }, saude: { nivel: "SEM_DADOS" }, endDate: "2026-11-01T00:00:00.000Z", percentComplete: 90 }),
  p("Medição", { contrato: { codccu: "3748", nome: "MRN" }, nucleos: [{ id: "n2", name: "MRN CT 3748/2023" }], saude: { nivel: "ATENCAO" }, percentComplete: 10 }),
];

test("filtros: situacao, saude, nucleo, contrato e responsavel", () => {
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, status: "PLANEJADO" }).map((x) => x.name), ["Relatórios mensais"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, saude: "ATRASADO" }).map((x) => x.name), ["Plano de campo"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, nucleoId: "n2" }).map((x) => x.name), ["Medição"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, codccu: "280" }).map((x) => x.name), ["Plano de campo"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, ownerId: "o2" }).map((x) => x.name), ["Relatórios mensais"]);
  assert.equal(filtrarProjetos(lista, FILTRO_VAZIO).length, 3);
});

test("busca por nome, equipe, responsavel, contrato e nucleo, sem acento nem maiuscula", () => {
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, busca: "relatorios" }).map((x) => x.name), ["Relatórios mensais"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, busca: "BIA" }).map((x) => x.name), ["Relatórios mensais"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, busca: "3748" }).map((x) => x.name), ["Medição"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, busca: "svpm" }).map((x) => x.name), ["Plano de campo"]);
  assert.equal(filtrarProjetos(lista, { ...FILTRO_VAZIO, busca: "zzz" }).length, 0);
});

test("ordem: nome, saude (pior primeiro), prazo (sem prazo por ultimo) e andamento; recentes mantem a da API", () => {
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, ordem: "nome" }).map((x) => x.name), ["Medição", "Plano de campo", "Relatórios mensais"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, ordem: "saude" }).map((x) => x.name), ["Plano de campo", "Medição", "Relatórios mensais"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, ordem: "prazo" }).map((x) => x.name), ["Relatórios mensais", "Plano de campo", "Medição"]);
  assert.deepEqual(filtrarProjetos(lista, { ...FILTRO_VAZIO, ordem: "andamento" }).map((x) => x.name), ["Relatórios mensais", "Plano de campo", "Medição"]);
  assert.deepEqual(filtrarProjetos(lista, FILTRO_VAZIO).map((x) => x.name), ["Plano de campo", "Relatórios mensais", "Medição"]);
});

test("opcoes dos filtros so' vem dos projetos da lista, sem repetir", () => {
  const o = opcoesDosFiltros(lista);
  assert.deepEqual(o.nucleos.map((n) => n.id), ["n2", "n1"], "em ordem alfabetica do nome (MRN antes de SVPM)");
  assert.deepEqual(o.contratos.map((c) => c.id), ["280", "3748"]);
  assert.deepEqual(o.donos.map((d) => d.nome), ["Ana", "Bia"]);
  assert.deepEqual(opcoesDosFiltros([]), { nucleos: [], contratos: [], donos: [] });
});
