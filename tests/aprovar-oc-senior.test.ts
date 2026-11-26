import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirOc, envelopeDecisao, envelopePendentes, listarPendentes, lerDecisao, lerPendentes } from "../src/lib/senior/aprovarOc";
import { cifrar, decifrar } from "../src/lib/segredo";

const cred = { usuario: "u&1", senha: "s<3>" };
const oc = (emp: number, fil: number, num: number) =>
  `<ordemCompra><codigoEmpresa>${emp}</codigoEmpresa><codigoFilial>${fil}</codigoFilial><numero>${num}</numero><dataEmissao>10/11/2026</dataEmissao>` +
  `<nomeFornecedor>FORN &amp; CIA</nomeFornecedor><nomeSolicitante>Ana</nomeSolicitante><valorAproximado>1.234,50</valorAproximado><observacao>obs</observacao>` +
  `<item><descricao>Cabo</descricao><rateio><codigoCentroCustos>999</codigoCentroCustos></rateio></item>` +
  `<rateio><codigoCentroCustos>270</codigoCentroCustos><abreviaturaCentroCustos>ADM</abreviaturaCentroCustos><percentualRateio>100</percentualRateio><valorRateio>1234.5</valorRateio></rateio></ordemCompra>`;
const resp = (...ocs: string[]) => `<S:Envelope><S:Body><r><result>${ocs.join("")}<codigoResultado>1</codigoResultado></result></r></S:Body></S:Envelope>`;
const decisao = (cod: string, res: string, msg = "") =>
  `<S:Envelope><S:Body><r><result><codigoResultado>${cod}</codigoResultado><retorno><resultado>${res}</resultado><mensagemErro>${msg}</mensagemErro></retorno><erroExecucao/></result></r></S:Body></S:Envelope>`;

test("envelopes: XML escapado e ordem alfabetica dos campos", () => {
  const e = envelopeDecisao("aprovar", cred, { codigoEmpresa: 1, codigoFilial: 2, numero: 15282 });
  assert.match(e, /<user>u&amp;1<\/user><password>s&lt;3&gt;<\/password>/);
  assert.match(e, /<ser:aprovar>/);
  assert.match(e, /<codigoEmpresa>1<\/codigoEmpresa><codigoFilial>2<\/codigoFilial><numero>15282<\/numero><sequencia>1<\/sequencia>/);
  assert.match(envelopePendentes(cred, 1), /<ser:buscarPendentes_4>.*<indicePagina>1<\/indicePagina><limitePagina>50<\/limitePagina>/);
});

test("lerPendentes: campos da OC, rateio da OC (nao o do item) e numero BR", () => {
  const { ocs, erro } = lerPendentes(resp(oc(1, 1, 100)));
  assert.equal(erro, null);
  assert.equal(ocs.length, 1);
  assert.deepEqual([ocs[0].numero, ocs[0].valor, ocs[0].fornecedor, ocs[0].itens], [100, 1234.5, "FORN & CIA", ["Cabo"]]);
  assert.deepEqual(ocs[0].rateio.map((r) => r.codigoCentroCustos), ["270"]);
});

test("listarPendentes: so' empresa 1 / filiais 1 e 2", async () => {
  const f = (async () => new Response(resp(oc(1, 1, 1), oc(1, 2, 2), oc(1, 3, 3), oc(2, 1, 4)))) as typeof fetch;
  assert.deepEqual((await listarPendentes(cred, f)).map((o) => o.numero), [1, 2]);
});

test("falha: login recusado (fault) vira erro, nao lista vazia", async () => {
  const f = (async () => new Response(`<S:Envelope><S:Body><S:Fault><faultstring>Usuário inválido</faultstring></S:Fault></S:Body></S:Envelope>`, { status: 500 })) as typeof fetch;
  await assert.rejects(listarPendentes(cred, f), /Usuário inválido/);
});

test("decisao: sucesso so' com todos os sinais; erro e ambiguidade nao aprovam", async () => {
  assert.equal(lerDecisao(decisao("1", "1")).ok, true);
  assert.deepEqual(lerDecisao(decisao("2", "2", "Sem permissão")), { ok: false, mensagem: "Sem permissão" });
  assert.equal(lerDecisao(decisao("1", "2", "x")).ok, false);
  assert.equal(lerDecisao("<S:Envelope><S:Body><r><result/></r></S:Body></S:Envelope>").ok, false);
  const f = (async () => new Response(decisao("2", "2", "OC já aprovada"))) as typeof fetch;
  assert.deepEqual(await decidirOc("aprovar", cred, { codigoEmpresa: 1, codigoFilial: 1, numero: 5 }, f), { ok: false, mensagem: "OC já aprovada" });
  assert.throws(() => envelopeDecisao("aprovar", cred, { codigoEmpresa: 1, codigoFilial: 1, numero: -1 }), /inválida/);
});

test("segredo: cifra e decifra; chave ausente ou adulteracao falham", () => {
  delete process.env.ERP_CRED_KEY;
  assert.throws(() => cifrar("x"), /ERP_CRED_KEY/);
  process.env.ERP_CRED_KEY = Buffer.alloc(32, 7).toString("base64");
  const g = cifrar("Senha@123");
  assert.ok(!g.includes("Senha"));
  assert.equal(decifrar(g), "Senha@123");
  assert.notEqual(cifrar("Senha@123"), g); // iv novo a cada vez
  const [v, iv, tag, c] = g.split(":");
  assert.throws(() => decifrar([v, iv, tag, Buffer.from("adulterado").toString("base64")].join(":")));
});
