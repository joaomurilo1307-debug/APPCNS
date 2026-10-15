import { test } from "node:test";
import assert from "node:assert/strict";
import { gravarTituloCP, lerRespostaTitulo, montarEnvelopeTitulo, type TituloNovo } from "../src/lib/senior/gravarTitulo";
import { dataIso, numeroSenior, paraOc } from "../src/lib/senior/ocsConferencia";

const base: TituloNovo = {
  codEmp: 1, codFil: 1, numTit: "007999", codTpt: "OUT", codFor: 711321, codTns: "90500",
  emissao: new Date(Date.UTC(2026, 9, 9)), vencimento: new Date(Date.UTC(2026, 9, 13)), valor: 181.06,
  obs: "A & B <teste>", codFpg: "18", codCcu: "13", ctaFin: "86", numPrj: "1", codFpj: "1",
};

const ok = (tipoRetorno: string, tipRet: string, erro = "") =>
  `<S:Envelope><S:Body><r><result><erroExecucao>${erro}</erroExecucao><mensagemRetorno>m</mensagemRetorno>` +
  `<resultado><msgRet>Titulo gravado</msgRet><tipRet>${tipRet}</tipRet></resultado><tipoRetorno>${tipoRetorno}</tipoRetorno></result></r></S:Body></S:Envelope>`;

test("caminho feliz: envelope em ordem alfabetica, valores no formato Senior, XML escapado", () => {
  const x = montarEnvelopeTitulo(base, "u", "s");
  assert.match(x, /<ser:GravarTitulosCP_4>/);
  const tags = [...x.split("<titulos>")[1].split("</titulos>")[0].matchAll(/<(\w+)>/g)].map((m) => m[1]);
  assert.deepEqual(tags, [...tags].sort()); // ordem do xs:sequence do servidor
  assert.match(x, /<vlrOri>181,06<\/vlrOri>/);
  assert.match(x, /<vctOri>13\/10\/2026<\/vctOri>/);
  assert.match(x, /A &amp; B &lt;teste&gt;/);
  assert.ok(!x.includes("<chvPix>"), "sem PIX nao envia chvPix/tpcPix");
});

test("sucesso so com tipoRetorno 0, tipRet 0 e sem erroExecucao", async () => {
  assert.equal(lerRespostaTitulo(ok("0", "0")).ok, true);
  const f = (async () => new Response(ok("0", "0"))) as typeof fetch;
  process.env.SENIOR_WS_SAPIENS_USER = "u";
  process.env.SENIOR_WS_SAPIENS_PASSWORD = "s";
  assert.equal((await gravarTituloCP(base, f)).ok, true);
});

test("falha 1: Senior recusa (tipRet -1 / erroExecucao) nunca vira sucesso", () => {
  assert.equal(lerRespostaTitulo(ok("0", "-1")).ok, false);
  const r = lerRespostaTitulo(ok("-1", "0", "Fornecedor inexistente"));
  assert.equal(r.ok, false);
  assert.equal(r.erroExecucao, "Fornecedor inexistente");
  assert.equal(lerRespostaTitulo("<faultstring>falhou</faultstring>").ok, false);
});

test("falha 2: dados invalidos barram antes de chamar a Senior", () => {
  assert.throws(() => montarEnvelopeTitulo({ ...base, numTit: "1234567890123456" }, "u", "s"));
  assert.throws(() => montarEnvelopeTitulo({ ...base, codTpt: "ABCD" }, "u", "s"));
  assert.throws(() => montarEnvelopeTitulo({ ...base, valor: 0 }, "u", "s"));
  assert.throws(() => montarEnvelopeTitulo({ ...base, codFor: 0 }, "u", "s"));
});

test("leitura da OC: datas e valores da Senior", () => {
  assert.equal(dataIso("16/10/2026"), "2026-10-16");
  assert.equal(dataIso("31/12/1900"), null);
  assert.equal(numeroSenior("1.234,56"), 1234.56);
  const o = paraOc({ NUMOCP: "1", CODFIL: "1", CODFOR: "9", VLRLIQ: "32,4", SITAPR: "APR", USU_DATVECT: "16/10/2026", USU_NUMTIT: "0" });
  assert.equal(o.valor, 32.4);
  assert.equal(o.numTitSenior, null);
});
