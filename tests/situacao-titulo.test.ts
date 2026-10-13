import { test, after } from "node:test";
import assert from "node:assert/strict";
import { alterarSituacaoTitulo, lerRespostaSituacao, montarEnvelopeSituacao, MSG_FORA_DA_ORIGEM } from "../src/lib/senior/situacaoTitulo";

// Respostas reais da porta PostDBInfoFinan (teste em producao de 13/10/2026).
const resposta = (sucesso: number, mensagem: string) =>
  `<S:Envelope><S:Body><ns2:PostDBInfoFinanResponse><result><erroExecucao xsi:nil="true"/><mensagem>${mensagem}</mensagem><sucesso>${sucesso}</sucesso></result></ns2:PostDBInfoFinanResponse></S:Body></S:Envelope>`;
const chave = { codFil: 1, codFor: 126400, codTpt: "PRV", numTit: "CONFRAT 3581_03" };
const fetchOriginal = globalThis.fetch;
after(() => { globalThis.fetch = fetchOriginal; });
process.env.SENIOR_WS_SAPIENS_USER = "usuario";
process.env.SENIOR_WS_SAPIENS_PASSWORD = "senha&<";

test("envelope leva a chave completa e escapa a senha", () => {
  const xml = montarEnvelopeSituacao(chave, "PE", "u", "a&b");
  assert.match(xml, /<ser:PostDBInfoFinan>/);
  assert.match(xml, /<codEmp>1<\/codEmp><codFil>1<\/codFil><codFor>126400<\/codFor><codTpt>PRV<\/codTpt><numTit>CONFRAT 3581_03<\/numTit><sitTit>PE<\/sitTit>/);
  assert.match(xml, /<password>a&amp;b<\/password>/);
});

test("caminho feliz: sucesso=1", async () => {
  let corpo = "";
  globalThis.fetch = async (_u, init) => { corpo = String(init?.body); return new Response(resposta(1, "SQL executado e transacao confirmada")); };
  assert.deepEqual(await alterarSituacaoTitulo(chave, "AB"), { ok: true, mensagem: "SQL executado e transacao confirmada" });
  assert.match(corpo, /<sitTit>AB<\/sitTit>/);
});

test("falha: titulo fora da situacao de origem nao conta como sucesso", async () => {
  globalThis.fetch = async () => new Response(resposta(0, MSG_FORA_DA_ORIGEM));
  assert.deepEqual(await alterarSituacaoTitulo(chave, "PE"), { ok: false, mensagem: MSG_FORA_DA_ORIGEM });
});

test("falha: Senior fora do ar vira erro, sem lancar excecao", async () => {
  globalThis.fetch = async () => { throw new Error("ECONNRESET"); };
  const r = await alterarSituacaoTitulo(chave, "PE");
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /Sem resposta da Senior \(ECONNRESET\)/);
});

test("falha: SOAP fault / HTTP 500", async () => {
  globalThis.fetch = async () => new Response("<faultstring>Usuario sem permissao</faultstring>", { status: 500 });
  assert.deepEqual(await alterarSituacaoTitulo(chave, "PE"), { ok: false, mensagem: "Usuario sem permissao" });
  assert.equal(lerRespostaSituacao("<erroExecucao>Regra falhou</erroExecucao><sucesso>1</sucesso>").ok, false);
});
