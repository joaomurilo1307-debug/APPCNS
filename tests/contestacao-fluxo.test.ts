import { test } from "node:test";
import assert from "node:assert/strict";
import { ROTULO_NO_LANCAMENTO, ROTULO_STATUS, STATUS_CONTESTACAO, emailDaContestacao, notificacaoDecisao, validarDecisao } from "../src/lib/contestacoes";
import { ACOES_POR_EMAIL, linkDaAcao, verificarLink, VALIDADE_DO_LINK_MS } from "../src/lib/contestacoesToken";

const lanc = { fornecedor: "Posto Alfa", numTit: "008034", numOcp: "15994", valor: 1234.5, ccuNome: "MRN CT 3748/2023", codccu: "190", linhaCusto: "Combustível" };

test("fluxo: contestado -> aceita -> realocado; do pendente tambem direto para realocado ou rejeitada; realocado e rejeitada encerram", () => {
  assert.equal(validarDecisao("PENDENTE", "ACEITA"), null);
  assert.equal(validarDecisao("PENDENTE", "REALOCADA"), null);
  assert.equal(validarDecisao("PENDENTE", "REJEITADA", "Não é do contrato."), null);
  assert.equal(validarDecisao("ACEITA", "REALOCADA"), null);
  assert.match(validarDecisao("ACEITA", "REJEITADA", "x".repeat(10)) ?? "", /já foi decidida/);
  assert.match(validarDecisao("ACEITA", "ACEITA") ?? "", /já foi decidida/);
  assert.match(validarDecisao("REALOCADA", "ACEITA") ?? "", /já foi decidida/);
  assert.match(validarDecisao("REJEITADA", "REALOCADA") ?? "", /já foi decidida/);
  assert.match(validarDecisao("PENDENTE", "PENDENTE") ?? "", /inválida/);
  assert.match(validarDecisao("PENDENTE", "REJEITADA", "") ?? "", /motivo/, "rejeitar continua exigindo o motivo");
});

test("rotulos: toda etapa tem texto na tela de aprovacoes e no lancamento (Contestado, aceita a realocar, Realocado)", () => {
  for (const s of STATUS_CONTESTACAO) assert.ok(ROTULO_STATUS[s] && ROTULO_NO_LANCAMENTO[s], s);
  assert.equal(ROTULO_NO_LANCAMENTO.PENDENTE, "Contestado · aguardando o financeiro");
  assert.equal(ROTULO_NO_LANCAMENTO.REALOCADA, "Realocado");
  assert.match(notificacaoDecisao(lanc, "REALOCADA", "O financeiro").title, /realocado/i);
  assert.match(notificacaoDecisao(lanc, "ACEITA", "O financeiro").body, /quando estiver realocado/);
});

const BASE = "https://gestao.exemplo.com.br";
const SEGREDO = "segredo-de-teste-do-servidor";

test("link do e-mail: assinado, vale para a acao e a contestacao certas, expira e nao aceita adulteracao", () => {
  const agora = 1_800_000_000_000;
  const url = new URL(linkDaAcao(BASE, SEGREDO, "abc123", "realocado", agora));
  const p = { id: url.searchParams.get("id"), acao: url.searchParams.get("acao"), exp: url.searchParams.get("exp"), t: url.searchParams.get("t") };
  assert.equal(url.origin + url.pathname, `${BASE}/api/contestacoes/resposta`);
  assert.equal(ACOES_POR_EMAIL[p.acao as "realocado"], "REALOCADA");
  assert.equal(verificarLink(SEGREDO, p, agora + 1000), "ok");
  assert.equal(verificarLink(SEGREDO, p, agora + VALIDADE_DO_LINK_MS + 1), "expirado");
  assert.equal(verificarLink(SEGREDO, { ...p, acao: "ok" }, agora), "invalido", "trocar a acao invalida");
  assert.equal(verificarLink(SEGREDO, { ...p, id: "outra" }, agora), "invalido", "trocar a contestacao invalida");
  assert.equal(verificarLink(SEGREDO, { ...p, exp: String(Number(p.exp) + 86_400_000) }, agora), "invalido", "estender a validade invalida");
  assert.equal(verificarLink("outro-segredo", p, agora), "invalido");
  assert.equal(verificarLink("", p, agora), "invalido", "sem segredo no servidor nada vale");
  assert.equal(verificarLink(SEGREDO, { ...p, t: "zz" }, agora), "invalido");
  assert.equal(verificarLink(SEGREDO, { id: null, acao: null, exp: null, t: null }, agora), "invalido");
});

test("e-mail: traz OC, titulo, valor, motivo e os tres links de resposta; sem links o e-mail antigo continua igual", () => {
  const links = { ok: `${BASE}/l/1`, realocado: `${BASE}/l/2`, discordo: `${BASE}/l/3` };
  const { subject, text } = emailDaContestacao(lanc, { autor: "Ana", justificativa: "Este custo é do contrato 3687.", dominio: "gestao.exemplo.com.br", links });
  assert.match(subject, /OC 15994/);
  for (const trecho of ["Posto Alfa", "OC: 15994", "Título: 008034", "R$", "Este custo é do contrato 3687.", links.ok, links.realocado, links.discordo, "RESPONDA POR AQUI", "Já realocado", "Não concordo"]) assert.ok(text.includes(trecho), trecho);
  const antigo = emailDaContestacao(lanc, { autor: "Ana", justificativa: "Este custo é do contrato 3687.", dominio: "gestao.exemplo.com.br" });
  assert.ok(!antigo.text.includes("RESPONDA POR AQUI"));
  assert.ok(antigo.text.includes("/aprovacoes#contestacoes"));
});
