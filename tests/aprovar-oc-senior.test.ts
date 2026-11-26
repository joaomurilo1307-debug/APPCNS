import { test } from "node:test";
import assert from "node:assert/strict";
import { decidirOc, envelopeDecisao, envelopePendentes, listarPendentes, lerDecisao, lerPendentes } from "../src/lib/senior/aprovarOc";
import { cifrar, decifrar } from "../src/lib/segredo";

const cred = { usuario: "u&1", senha: "s<3>" };
const oc = (emp: number, fil: number, num: number) =>
  `<ordemCompra><codigoEmpresa>${emp}</codigoEmpresa><codigoFilial>${fil}</codigoFilial><numero>${num}</numero><dataEmissao>10/11/2026</dataEmissao>` +
  `<nomeFornecedor>FORN &amp; CIA</nomeFornecedor><nomeSolicitante>Ana</nomeSolicitante><valorAproximado>1.234,50</valorAproximado><observacao>obs</observacao>` +
  `<item><descricao>Cabo</descricao><observacao>azul</observacao><quantidadeSolicitada>12.5</quantidadeSolicitada><unidadeMedida>MT</unidadeMedida><valorUnitario>10,00</valorUnitario><vlrBru>125</vlrBru><vlrDsc>5</vlrDsc><valorLiquido>120</valorLiquido><rateio><codigoCentroCustos>999</codigoCentroCustos><percentualRateio>100</percentualRateio><valorRateio>120</valorRateio></rateio></item>` +
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
  assert.deepEqual([ocs[0].numero, ocs[0].valor, ocs[0].fornecedor], [100, 1234.5, "FORN & CIA"]);
  // item: todos os campos do contrato (quantidade pedida, valor unitario, desconto, valor do item) e o rateio DO ITEM
  assert.deepEqual(ocs[0].itens, [
    { descricao: "Cabo", observacao: "azul", quantidade: 12.5, unidade: "MT", valorUnitario: 10, valorBruto: 125, desconto: 5, valorLiquido: 120, rateio: [{ codigoCentroCustos: "999", abreviatura: "", percentual: 100, valor: 120 }] },
  ]);
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

test("niveis de aprovacao: 1 Coordenacao, 2 Gerencia, 3 Diretoria; aprovado x pendente e quem pode aprovar", async () => {
  const { montarNiveis, rotuloNivel } = await import("../src/lib/senior/detalheAprovacao");
  assert.deepEqual([1, 2, 3, 4].map(rotuloNivel), ["1 - Coordenação", "2 - Gerência", "3 - Diretoria", "4 - Nível 4"]);
  const pessoa = (nome: string) => ({ codUsu: "1", nome, email: null });
  const niveis = montarNiveis({
    niveisExigidos: [1, 2, 3],
    niveisAprovados: [1],
    eventos: [{ nivel: 1, codCcu: "270", situacao: "APR", data: "2026-11-25", por: pessoa("ana.coord") }],
    ccus: [{ codCcu: "270", descricao: null, percentual: 100, valor: 10, aprovadoresCadastrados: [
      { nivel: 1, pessoas: [pessoa("ana.coord")] }, { nivel: 2, pessoas: [pessoa("bia.ger"), pessoa("caio.ger")] }, { nivel: 3, pessoas: [pessoa("dora.dir")] },
    ] }],
  });
  assert.deepEqual(niveis.map((n) => [n.rotulo, n.status]), [["1 - Coordenação", "aprovado"], ["2 - Gerência", "pendente"], ["3 - Diretoria", "pendente"]]);
  assert.deepEqual([niveis[0].aprovadoPor, niveis[0].aprovadoEm], ["ana.coord", "2026-11-25"]);
  assert.deepEqual(niveis[1].podemAprovar, ["bia.ger", "caio.ger"]);
  // sem niveis exigidos informados pela Senior: lista vazia (a tela avisa, nao inventa nivel)
  assert.deepEqual(montarNiveis({ niveisExigidos: [], niveisAprovados: [], eventos: [], ccus: [] }), []);
});
