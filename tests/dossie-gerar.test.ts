import { test } from "node:test";
import assert from "node:assert/strict";
import { chamarSenior, htmlParaPdf } from "../src/lib/dossie/gerar";
import { fundir } from "../src/lib/dossie/motor";

process.env.SENIOR_WS_SAPIENS_USER = "usuario&1";
process.env.SENIOR_WS_SAPIENS_PASSWORD = "s<3nha";
const corpo = "<user>__SENIOR_USER__</user><password>__SENIOR_PASSWORD__</password>";

test("SOAP: marcadores viram usuario/senha escapados em XML (a senha nunca vem do fluxo)", async () => {
  let enviado = "";
  const f = (async (_u: any, init: any) => ((enviado = String(init.body)), new Response("<ok/>"))) as typeof fetch;
  assert.equal(await chamarSenior(corpo, f), "<ok/>");
  assert.equal(enviado, "<user>usuario&amp;1</user><password>s&lt;3nha</password>");
});

test("SOAP: uma falha de rede e' repetida uma vez; HTTP de erro vira excecao", async () => {
  let n = 0;
  const instavel = (async () => (++n === 1 ? Promise.reject(new Error("timeout")) : new Response("<ok/>"))) as typeof fetch;
  assert.equal(await chamarSenior(corpo, instavel), "<ok/>");
  assert.equal(n, 2);
  await assert.rejects(chamarSenior(corpo, (async () => new Response("x", { status: 500 })) as typeof fetch), /HTTP 500/);
});

test("PDF: Gotenberg devolve PDF = ok; resposta que nao e' PDF ou HTTP de erro = falha", async () => {
  const ok = (async (url: any, init: any) => {
    assert.match(String(url), /\/forms\/chromium\/convert\/html$/);
    assert.ok((init.body as FormData).get("files"), "o HTML vai no campo files");
    return new Response("%PDF-1.7 corpo");
  }) as typeof fetch;
  assert.equal((await htmlParaPdf("<html></html>", ok)).subarray(0, 4).toString(), "%PDF");
  await assert.rejects(htmlParaPdf("<html></html>", (async () => new Response("<html>erro</html>")) as typeof fetch), /nao devolveu um PDF/);
  await assert.rejects(htmlParaPdf("<html></html>", (async () => new Response("", { status: 503 })) as typeof fetch), /HTTP 503/);
});

test("Merge profundo (combine by position do n8n): objetos recursivos, arrays por indice, o ultimo vence", () => {
  assert.deepEqual(fundir({ a: { x: 1, y: 2 }, l: [1, 2] }, { a: { y: 9, z: 3 }, l: [7], k: 1 }), { a: { x: 1, y: 9, z: 3 }, l: [7, 2], k: 1 });
  assert.deepEqual(fundir({ a: 1 }, { a: undefined }), { a: 1 });
});
