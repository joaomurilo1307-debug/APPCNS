import { test } from "node:test";
import assert from "node:assert/strict";
import { mapearNota, sugerirNotas, type NotaRecebida } from "../src/lib/edocs/notasRecebidas";

const nota = (o: Partial<NotaRecebida>): NotaRecebida => ({
  chave: "1".repeat(44), numero: "100", serie: "1", emitente: "FORNECEDOR X", cnpj: "03986136000100", valor: 432.25, emissao: "2026-10-10", ...o,
});
const oc = { docFornecedor: "03986136000100", valor: 432.25, emissao: "2026-10-01", numNfc: null as string | null };

test("caminho feliz: mesma empresa e mesmo valor sobem pro topo", () => {
  const r = sugerirNotas(oc, [nota({ chave: "a".repeat(44), valor: 999 }), nota({ chave: "b".repeat(44) })]);
  assert.equal(r[0].nota.chave, "b".repeat(44));
  assert.ok(r[0].pontos > r[1].pontos);
  assert.ok(r[0].motivos.includes("valor igual ao da OC"));
});

test("falha 1: nota de outro CNPJ nao e' sugerida (nem com valor igual)", () => {
  assert.deepEqual(sugerirNotas(oc, [nota({ cnpj: "11111111000111" })]), []);
});

test("numero digitado na OC (USU_NUMNFC) puxa a nota mesmo sem CNPJ, desde que o valor feche", () => {
  const com = sugerirNotas({ ...oc, docFornecedor: null, numNfc: "0100" }, [nota({})]);
  assert.equal(com.length, 1);
  assert.equal(sugerirNotas({ ...oc, docFornecedor: null, numNfc: "0100" }, [nota({ valor: 10 })]).length, 0);
});

test("falha 2: nota sem XML recebido ou nao autorizada e' descartada", () => {
  assert.equal(mapearNota({ situation: "XML_NOT_RECEIVED", accessKey: "x", number: 1 }), null);
  assert.equal(mapearNota({ situation: "AUTHORIZED", number: 1 }), null);
  const ok = mapearNota({ situation: "AUTHORIZED", accessKey: "k", number: 14581, series: 3, issuerCorporateName: "A", issuerDocument: "03.986.136/0001-00", totalValue: 432.25, issueDateTime: "2026-09-23T18:57:12Z" });
  assert.equal(ok?.cnpj, "03986136000100");
  assert.equal(ok?.emissao, "2026-09-23");
});

test("limite de sugestoes", () => {
  const muitas = Array.from({ length: 12 }, (_, i) => nota({ chave: String(i).padStart(44, "0"), numero: String(i) }));
  assert.equal(sugerirNotas(oc, muitas).length, 5);
});
