import { test } from "node:test";
import assert from "node:assert/strict";
import { contarPorStatus, diasEmAberto, emAndamento, filtrar, linhaDoTempo, ordenar, proximasEtapas, tituloDoEvento, type ItemTela } from "../src/lib/contestacoesTela";
import { validarDecisao } from "../src/lib/contestacoes";

const item = (id: string, status: ItemTela["status"], criadoEm: string, extra: Partial<ItemTela> = {}): ItemTela => ({
  id, criadoEm, status, fornecedor: "Posto Alfa", numTit: "008034", numOcp: "15994", ccuNome: "MRN CT 3748/2023", codccu: "190", valor: 100, justificativa: "Custo do contrato 3687.", parecer: null, decididoEm: null,
  autor: { id: "a1", name: "André Silva" }, indicado: null, decididoPor: null, ...extra,
});

const lista = [
  item("1", "REALOCADA", "2026-10-01T10:00:00Z", { decididoEm: "2026-10-03T10:00:00Z", decididoPor: { id: "m", name: "Mônica" } }),
  item("2", "PENDENTE", "2026-10-20T10:00:00Z"),
  item("3", "ACEITA", "2026-10-10T10:00:00Z", { fornecedor: "Hotel Beta", codccu: "230", ccuNome: "MRN CT 3687/2023", autor: { id: "a2", name: "Carolina" } }),
  item("4", "PENDENTE", "2026-10-05T10:00:00Z"),
  item("5", "REJEITADA", "2026-10-15T10:00:00Z"),
];

test("contagem por status e o que e' 'em andamento'", () => {
  assert.deepEqual(contarPorStatus(lista), { PENDENTE: 2, ACEITA: 1, REALOCADA: 1, REJEITADA: 1 });
  assert.deepEqual(contarPorStatus([]), { PENDENTE: 0, ACEITA: 0, REALOCADA: 0, REJEITADA: 0 });
  assert.deepEqual(lista.filter((i) => emAndamento(i.status)).map((i) => i.id).sort(), ["2", "3", "4"]);
});

test("ordem: pendentes (a mais antiga primeiro), depois aceitas, depois encerradas (a mais nova primeiro)", () => {
  assert.deepEqual(ordenar(lista).map((i) => i.id), ["4", "2", "3", "5", "1"]);
  assert.equal(lista[0].id, "1", "nao altera a lista original");
});

test("filtros: status, abertas, centro, autor e busca sem acento nem maiuscula", () => {
  const f = { status: "TODAS" as const, busca: "", ccu: "", autorId: "" };
  assert.equal(filtrar(lista, f).length, 5);
  assert.deepEqual(filtrar(lista, { ...f, status: "ABERTAS" }).map((i) => i.id).sort(), ["2", "3", "4"]);
  assert.deepEqual(filtrar(lista, { ...f, status: "REALOCADA" }).map((i) => i.id), ["1"]);
  assert.deepEqual(filtrar(lista, { ...f, ccu: "230" }).map((i) => i.id), ["3"]);
  assert.deepEqual(filtrar(lista, { ...f, autorId: "a2" }).map((i) => i.id), ["3"]);
  assert.deepEqual(filtrar(lista, { ...f, busca: "  HOTEL beta " }).map((i) => i.id), ["3"]);
  assert.deepEqual(filtrar(lista, { ...f, busca: "andre" }).map((i) => i.id).sort(), ["1", "2", "4", "5"], "acha 'André' digitando 'andre'");
  assert.deepEqual(filtrar(lista, { ...f, busca: "nao existe" }), []);
});

test("linha do tempo: usa o historico gravado; sem historico, deriva da abertura e da decisao", () => {
  const sem = linhaDoTempo(lista[0]);
  assert.deepEqual(sem.map((e) => [e.tipo, e.status, e.porNome]), [["CRIADA", "PENDENTE", "André Silva"], ["STATUS", "REALOCADA", "Mônica"]]);
  assert.deepEqual(linhaDoTempo(lista[1]).map((e) => e.tipo), ["CRIADA"], "pendente: so' a abertura");
  const com = linhaDoTempo(item("9", "ACEITA", "2026-10-01T10:00:00Z", { eventos: [
    { id: "b", em: "2026-10-02T10:00:00Z", tipo: "NOTA", status: null, porNome: "Mônica", via: "sistema", texto: "Ajustando no Senior." },
    { id: "a", em: "2026-10-01T10:00:00Z", tipo: "CRIADA", status: "PENDENTE", porNome: "André Silva", via: "sistema", texto: "x" },
  ] }));
  assert.deepEqual(com.map((e) => e.id), ["a", "b"], "em ordem de data");
  const antiga = linhaDoTempo(item("8", "REALOCADA", "2026-10-01T10:00:00Z", { eventos: [{ id: "s", em: "2026-10-04T10:00:00Z", tipo: "STATUS", status: "REALOCADA", porNome: "Mônica", via: "sistema", texto: null }] }));
  assert.deepEqual(antiga.map((e) => e.tipo), ["CRIADA", "STATUS"], "sem a abertura gravada, ela e' derivada da contestacao"),
  assert.deepEqual([tituloDoEvento(com[0]), tituloDoEvento(com[1])], ["Contestou", "Recado"]);
  assert.equal(tituloDoEvento({ id: "x", em: "", tipo: "STATUS", status: "REALOCADA", porNome: "", via: "", texto: null }), "Realocado");
});

test("proximas etapas batem com a regra do servidor (validarDecisao) e dias em aberto nunca ficam negativos", () => {
  for (const atual of ["PENDENTE", "ACEITA", "REALOCADA", "REJEITADA"]) {
    for (const novo of ["ACEITA", "REALOCADA", "REJEITADA"] as const) {
      assert.equal(proximasEtapas(atual).includes(novo), validarDecisao(atual, novo, "motivo valido") === null, `${atual} -> ${novo}`);
    }
  }
  assert.equal(diasEmAberto("2026-10-20T10:00:00Z", Date.parse("2026-10-25T10:00:00Z")), 5);
  assert.equal(diasEmAberto("2026-10-26T10:00:00Z", Date.parse("2026-10-25T10:00:00Z")), 0);
});
