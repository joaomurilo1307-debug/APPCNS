// Auto-teste do aviso de pagamento aprovado: npx tsx scripts/check-aviso-pagamento.ts
import assert from "node:assert/strict";
import { sqlEmailCriadorOc, emailValido, montarAviso } from "../src/lib/avisoPagamentoAprovado";

const JOIN = "AND E099USU.CODEMP = E420OCP.CODEMP AND E099USU.CODUSU = E420OCP.USUGER";
assert.ok(sqlEmailCriadorOc("15846")!.includes("E420OCP.NUMOCP = 15846 " + JOIN));
assert.ok(sqlEmailCriadorOc(" 15846 ", "2")!.includes("E420OCP.NUMOCP = 15846 AND E420OCP.CODFIL = 2 " + JOIN));
assert.ok(!sqlEmailCriadorOc("15846", "1 OR 1=1")!.includes("OR")); // filial suja e' ignorada, nao injetada
for (const ruim of ["", "0", "000", "abc", "1 OR 1=1", "1;DELETE", "-5"]) assert.equal(sqlEmailCriadorOc(ruim), null, ruim);

assert.ok(emailValido("fulano@consominas.com.br"));
for (const ruim of [null, undefined, "", " ", "fulano", "fulano@", "a b@c.com"]) assert.ok(!emailValido(ruim as any), String(ruim));

const m = montarAviso({ numOcp: "15282", fornecedor: "ACME", numTit: "123", valor: 1234.5, vencimento: new Date("2026-10-10T00:00:00Z"), aprovadoPor: "Renata", nomeCriador: "Fulano" });
assert.equal(m.subject, "OC 15282: pagamento aprovado");
assert.match(m.text, /R\$\s?1\.234,50/);
assert.match(m.text, /10\/10\/2026/);
assert.match(montarAviso({ ...{ numOcp: "1", fornecedor: "X", numTit: "1", valor: 1, aprovadoPor: "R", nomeCriador: "F" }, vencimento: null }).text, /não informado/);
console.log("ok: aviso de pagamento aprovado");
