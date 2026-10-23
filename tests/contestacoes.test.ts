import test from "node:test";
import assert from "node:assert/strict";
import { LIMITES, descricaoDoLancamento, notificacaoDecisao, notificacaoIndicado, notificacaoNova, validarDecisao, validarPedido } from "../src/lib/contestacoes";

const lanc = { fornecedor: "MERCADO LIVRE", numTit: "008034", valor: 70.88, ccuNome: "AGA CT 15140/2025 CB", codccu: "102185" };

test("pedido: exige lancamento e justificativa com tamanho minimo", () => {
  assert.match(validarPedido({ justificativa: "x".repeat(20) }) ?? "", /lançamento/);
  assert.match(validarPedido({ chave: "T|1|2|3", justificativa: "curta" }) ?? "", /pelo menos/);
  assert.equal(validarPedido({ chave: "T|1|2|3", justificativa: "Este custo e' do contrato da engenharia, nao do nosso." }), null);
  assert.match(validarPedido({ chave: "T|1|2|3", justificativa: "x".repeat(LIMITES.justificativaMax + 1) }) ?? "", /passou/);
});

test("pedido: limita quantidade e tamanho dos arquivos", () => {
  const j = "Justificativa suficientemente longa.";
  const mais = Array.from({ length: LIMITES.arquivosMax + 1 }, (_, i) => ({ name: `a${i}.pdf`, size: 10 }));
  assert.match(validarPedido({ chave: "k", justificativa: j, arquivos: mais }) ?? "", /No máximo/);
  assert.match(validarPedido({ chave: "k", justificativa: j, arquivos: [{ name: "grande.pdf", size: LIMITES.bytesPorArquivo + 1 }] }) ?? "", /grande\.pdf/);
  assert.equal(validarPedido({ chave: "k", justificativa: j, arquivos: [{ name: "ok.pdf", size: LIMITES.bytesPorArquivo }] }), null);
});

test("decisao: so' o que esta pendente; rejeitar exige motivo", () => {
  assert.equal(validarDecisao("PENDENTE", "ACEITA"), null);
  assert.equal(validarDecisao("PENDENTE", "REJEITADA", "Custo é do contrato mesmo."), null);
  assert.match(validarDecisao("PENDENTE", "REJEITADA", "  ") ?? "", /motivo/);
  assert.match(validarDecisao("ACEITA", "REJEITADA", "tarde demais") ?? "", /já foi decidida/);
  assert.match(validarDecisao("PENDENTE", "TALVEZ") ?? "", /inválida/);
});

test("textos: descrevem o lancamento (titulo ou OC) e quem fez o que", () => {
  assert.match(descricaoDoLancamento(lanc), /título 008034/);
  assert.match(descricaoDoLancamento({ ...lanc, numTit: null, numOcp: "15994" }), /OC 15994/);
  assert.match(notificacaoNova(lanc, "Ana").body, /Ana contestou/);
  assert.match(notificacaoIndicado(lanc, "Ana").title, /indicado/);
  const aceita = notificacaoDecisao(lanc, "ACEITA", "Mônica");
  assert.match(aceita.body, /ajusta o lançamento no Senior/);
  const rejeitada = notificacaoDecisao(lanc, "REJEITADA", "Mônica", "É do contrato.");
  assert.match(rejeitada.body, /Parecer: É do contrato\./);
  assert.ok(!/ajusta o lançamento/.test(rejeitada.body));
});
