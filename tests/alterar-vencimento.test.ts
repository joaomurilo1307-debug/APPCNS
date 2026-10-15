import { test, after } from "node:test";
import assert from "node:assert/strict";
import { alterarVencimentoTitulo, lerRespostaAltera, montarEnvelopeVencimento } from "../src/lib/senior/alterarVencimento";

process.env.SENIOR_WS_SAPIENS_USER = "u";
process.env.SENIOR_WS_SAPIENS_PASSWORD = "s&<";
const original = globalThis.fetch;
after(() => { globalThis.fetch = original; });

const chave = { codFil: 1, numTit: "007988", codTpt: "OUT", codFor: 711321 };
const novo = new Date(Date.UTC(2026, 9, 19)); // 19/10/2026

const linha = (vct: string, sit: string, abe = "181,06") =>
  `<S:Envelope><S:Body><r><result><erroExecucao/><pmReturnGetDBInfo>${Buffer.from(`<r><line><VCTPRO>${vct}</VCTPRO><SITTIT>${sit}</SITTIT><VLRABE>${abe}</VLRABE></line></r>`).toString("base64")}</pmReturnGetDBInfo></result></r></S:Body></S:Envelope>`;
const resposta = (txt: string) => `<S:Envelope><S:Body><r><result><gridRetorno><txtRet>${txt}</txtRet></gridRetorno><resultado>OK</resultado></result></r></S:Body></S:Envelope>`;

/** Simula Senior: leituras devolvem a fila de VCTPRO; escrita registra o envelope. */
function simular(leituras: [string, string, string?][], retornoEscrita: string) {
  const escritas: string[] = [];
  let i = 0;
  globalThis.fetch = (async (url: any, init: any) => {
    if (String(url).includes("alteratituloscp")) { escritas.push(String(init.body)); return new Response(retornoEscrita); }
    const [v, s, abe] = leituras[Math.min(i++, leituras.length - 1)];
    return new Response(linha(v, s, abe));
  }) as typeof fetch;
  return escritas;
}

test("envelope: so' vctPro, ordem alfabetica, data dd/MM/aaaa, XML escapado", () => {
  const x = montarEnvelopeVencimento({ ...chave, numTit: "A&B" }, novo, "u", "s");
  const tags = [...x.split("<gridTitulosAlterar>")[1].split("</gridTitulosAlterar>")[0].matchAll(/<(\w+)>/g)].map((m) => m[1]);
  assert.deepEqual(tags, ["codFil", "codFor", "codTpt", "numTit", "vctPro"]);
  assert.match(x, /<vctPro>19\/10\/2026<\/vctPro>/);
  assert.match(x, /A&amp;B/);
  assert.ok(!x.includes("vctOri") && !x.includes("datPpt"));
});

test("caminho feliz: altera e confirma pela releitura da Senior", async () => {
  const escritas = simular([["14/10/2026", "AB"], ["19/10/2026", "AB"]], resposta("Titulo alterado"));
  const r = await alterarVencimentoTitulo(chave, novo);
  assert.equal(r.ok, true);
  assert.equal(escritas.length, 1);
});

test("falha 1: titulo em remessa (PE) ou liquidado nao chega a escrever na Senior", async () => {
  const escritas = simular([["14/10/2026", "PE"]], resposta("x"));
  const r = await alterarVencimentoTitulo(chave, novo);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /PE/);
  assert.equal(escritas.length, 0);
  const l = simular([["14/10/2026", "LQ", "0"]], resposta("x"));
  assert.equal((await alterarVencimentoTitulo(chave, novo)).ok, false);
  assert.equal(l.length, 0);
});

test("falha 2: Senior recusa (data nao muda na releitura) = nao e' sucesso, mesmo com resposta 'OK'", async () => {
  simular([["14/10/2026", "AB"], ["14/10/2026", "AB"]], resposta("Nao e possivel alterar o vencimento."));
  const r = await alterarVencimentoTitulo(chave, novo);
  assert.equal(r.ok, false);
  assert.match(r.mensagem, /possivel alterar/);
});

test("ja na data pedida: nao escreve de novo; resposta com faultstring e' erro", async () => {
  const escritas = simular([["19/10/2026", "AB"]], resposta("x"));
  assert.equal((await alterarVencimentoTitulo(chave, novo)).ok, true);
  assert.equal(escritas.length, 0);
  assert.equal(lerRespostaAltera("<faultstring>falhou</faultstring>").erro, true);
});

test("chave invalida barra antes de chamar", () => {
  assert.throws(() => montarEnvelopeVencimento({ ...chave, codFor: 0 }, novo, "u", "s"));
  assert.throws(() => montarEnvelopeVencimento({ ...chave, codTpt: "ABCD" }, novo, "u", "s"));
});
