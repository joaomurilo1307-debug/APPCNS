import test from "node:test";
import assert from "node:assert/strict";
import { descricaoDoLancamento, emailDaContestacao, lerListaDeEmails, referenciaDoLancamento } from "../src/lib/contestacoes";

const lanc = { fornecedor: "MERCADO LIVRE NEW CLICK", numTit: "008034", numOcp: "15994", valor: 70.88, ccuNome: "AGA CT 15140/2025 CB", codccu: "102185" };

test("referencia: mostra a OC e o titulo juntos quando existem", () => {
  assert.equal(referenciaDoLancamento({ numOcp: "15994", numTit: "008034" }), "OC 15994 · título 008034");
  assert.equal(referenciaDoLancamento({ numOcp: "15994", numTit: null }), "OC 15994");
  assert.equal(referenciaDoLancamento({ numTit: "008034" }), "título 008034");
  assert.equal(referenciaDoLancamento({}), "lançamento");
  assert.match(descricaoDoLancamento(lanc), /OC 15994 · título 008034/);
});

test("e-mail: traz OC, titulo, valor, contrato, descricao, indicado, anexos e o link das aprovacoes", () => {
  const { subject, text } = emailDaContestacao(
    { ...lanc, linhaCusto: "Despesas Diversas", dataLancamento: "2026-10-22" },
    { autor: "Ana", justificativa: "  Este custo é do contrato da engenharia.  ", indicado: "Bruno Teixeira", anexos: ["req.pdf"], dominio: "gestao.exemplo.com" }
  );
  assert.match(subject, /OC 15994 · título 008034 · R\$\s?70,88/);
  for (const trecho of [
    "OC: 15994", "Título: 008034", "Fornecedor: MERCADO LIVRE", "AGA CT 15140/2025 CB (CCU 102185)", "Linha de custo: Despesas Diversas",
    "Data do lançamento: 22/10/2026", "Ana contestou", "Este custo é do contrato da engenharia.", "Bruno Teixeira", "req.pdf",
    "https://gestao.exemplo.com/aprovacoes#contestacoes", "o sistema não altera o Senior",
  ]) {
    assert.ok(text.includes(trecho), `faltou: ${trecho}`);
  }
  assert.ok(!text.includes("  Este custo"), "a justificativa vai sem espacos nas pontas");
  const semOc = emailDaContestacao({ ...lanc, numTit: null, numOcp: null }, { autor: "Ana", justificativa: "Motivo qualquer escrito aqui." });
  assert.match(semOc.text, /OC: não ligada/);
  assert.match(semOc.text, /Título: sem título/);
  assert.ok(!semOc.text.includes("https://"), "sem dominio nao ha link");
});

test("lista de e-mails: separa por virgula, ponto e virgula ou linha; tira repetidos e aponta os invalidos", () => {
  const r = lerListaDeEmails("Monica.Oliveira@consominas.com.br; joao@x.com,\nmonica.oliveira@consominas.com.br  invalido@");
  assert.deepEqual(r.validos, ["monica.oliveira@consominas.com.br", "joao@x.com"]);
  assert.deepEqual(r.invalidos, ["invalido@"]);
  assert.deepEqual(lerListaDeEmails("").validos, []);
});
