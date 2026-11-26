import { test } from "node:test";
import assert from "node:assert/strict";
import { aprovarRequisicao, envelopeAprovarRequisicao, lerAprovacaoRequisicao, listarRequisicoesPendentes } from "../src/lib/senior/aprovarRequisicao";

const cred = { usuario: "u&1", senha: "s<3>" };
const k = { codigoEmpresa: 1, numero: 4812, sequencia: 1 };
const resp = (tp: string, res: string, erro = "", grid = "") =>
  `<S:Envelope><S:Body><r><result>${grid}<resultado>${res}</resultado><tpResultado>${tp}</tpResultado><erroExecucao>${erro}</erroExecucao></result></r></S:Body></S:Envelope>`;

// consulta falsa: responde conforme a tabela que o SQL cita
const req = (num: number, seq: number, ccu: string, usuSol = "201") => ({
  CODEMP: "1", NUMEME: String(num), SEQEME: String(seq), DATEME: "24/11/2026", PROSER: "P", CODPRO: "201242", CODSER: "", CPLPRO: "A pedido do Bruno solicito material", UNIMED: "UN",
  QTDEME: "2,5", PREEME: "720,69", USUSOL: usuSol, CCURES: ccu, OBSEME: "",
});
const consultaFalsa = (sqls: string[]) => (async (sql: string) => {
  sqls.push(sql);
  if (sql.includes("FROM E068CNA")) return [{ CODUSU: "26", CODCCU: "190" }, { CODUSU: "26", CODCCU: "150" }];
  if (sql.includes("FROM E207EME")) return [req(4812, 1, "190"), req(4813, 1, "999"), req(4814, 2, "150")];
  if (sql.includes("FROM E099USU")) return [{ CODUSU: "201", NOMUSU: "emily" }];
  if (sql.includes("FROM E044CCU")) return [{ CODCCU: "190", DESCCU: "Frota" }];
  if (sql.includes("FROM E075PRO")) return [{ CODPRO: "201242", DESPRO: "ANTENA DOBRAVEL 2,18M" }];
  return [];
}) as never;

test("envelope: campos em ordem alfabetica, XML escapado, numero com ponto e sem milhar", () => {
  const e = envelopeAprovarRequisicao(cred, 26, k, 1234.5);
  assert.match(e, /<user>u&amp;1<\/user><password>s&lt;3&gt;<\/password>/);
  assert.match(e, /<ser:AprovarRequisicoes>/);
  assert.match(e, /<gridRequisicoes><codEmp>1<\/codEmp><codUsu>26<\/codUsu><numEme>4812<\/numEme><qtdEme>1234.5<\/qtdEme><seqEme>1<\/seqEme><\/gridRequisicoes>/);
});

test("lista: so' requisicoes cujo centro de custo a pessoa aprova; traz nome, CCU e o codUsu certo", async () => {
  const sqls: string[] = [];
  const r = await listarRequisicoesPendentes(["26"], consultaFalsa(sqls));
  assert.deepEqual(r.map((x) => [x.numero, x.sequencia, x.centroCusto, x.codUsu]), [[4812, 1, "190", 26], [4814, 2, "150", 26]]);
  assert.equal(r[0].quantidade, 2.5);
  assert.equal(r[0].solicitante, "emily");
  assert.equal(r[0].centroCustoDescricao, "Frota");
  assert.ok(sqls.some((s) => /SITAPR IN \('ANA'\)/.test(s) && /ROTNAP IN \(3\)/.test(s)));
});

test("descricao: nome do produto do cadastro + complemento digitado; servico usa E080SER; falha no cadastro cai no codigo", async () => {
  const [r] = await listarRequisicoesPendentes(["26"], consultaFalsa([]));
  assert.deepEqual([r.produto, r.descricao, r.complemento], ["201242", "ANTENA DOBRAVEL 2,18M", "A pedido do Bruno solicito material"]);
  const servico = (async (sql: string) => {
    if (sql.includes("E068CNA")) return [{ CODUSU: "26", CODCCU: "190" }];
    if (sql.includes("E207EME")) return [{ ...req(1, 1, "190"), PROSER: "S", CODPRO: "", CODSER: "S77" }];
    if (sql.includes("E080SER")) return [{ CODSER: "S77", DESSER: "SERVICO DE PINTURA" }];
    return [];
  }) as never;
  assert.deepEqual((await listarRequisicoesPendentes(["26"], servico)).map((x) => [x.produto, x.descricao]), [["S77", "SERVICO DE PINTURA"]]);
  const base = consultaFalsa([]) as unknown as (sql: string) => Promise<unknown>;
  const semCadastro = (async (sql: string) => {
    if (sql.includes("E075PRO")) throw new Error("recusou");
    return base(sql);
  }) as never;
  assert.equal((await listarRequisicoesPendentes(["26"], semCadastro))[0].descricao, "201242");
});

test("lista: sem codigo valido ou sem cadastro de aprovador nao consulta requisicao nem aprova nada", async () => {
  const sqls: string[] = [];
  assert.deepEqual(await listarRequisicoesPendentes(["abc", "1; DROP"], consultaFalsa(sqls)), []);
  assert.equal(sqls.length, 0);
  const vazio = (async (sql: string) => (sql.includes("E068CNA") ? [] : [req(1, 1, "190")])) as never;
  assert.deepEqual(await listarRequisicoesPendentes(["26"], vazio), []);
});

test("aprovar: sucesso so' com tpResultado 1 e sem erro; erro de linha, erroExecucao e ambiguidade nao aprovam", async () => {
  assert.equal(lerAprovacaoRequisicao(resp("1", "Processado com sucesso")).ok, true);
  const linha = `<gridRetorno><codEmp>1</codEmp><numEme>4812</numEme><seqEme>1</seqEme><txtRet>Usuário não é aprovador</txtRet></gridRetorno>`;
  assert.deepEqual(lerAprovacaoRequisicao(resp("2", "ERRO: Ocorreram erros", "", linha)), { ok: false, mensagem: "Usuário não é aprovador" });
  assert.equal(lerAprovacaoRequisicao(resp("1", "x", "Falha interna")).ok, false);
  assert.equal(lerAprovacaoRequisicao("<S:Envelope><S:Body><r><result/></r></S:Body></S:Envelope>").ok, false);
  const f = (async () => new Response(resp("2", "ERRO", "", linha))) as typeof fetch;
  assert.equal((await aprovarRequisicao(cred, 26, k, 1, f)).ok, false);
});

test("aprovar: login recusado (fault) e HTTP sem fault viram erro; entradas invalidas nem saem", async () => {
  const fault = (async () => new Response(`<S:Envelope><S:Body><S:Fault><faultstring>Usuário inválido</faultstring></S:Fault></S:Body></S:Envelope>`, { status: 500 })) as typeof fetch;
  assert.deepEqual(await aprovarRequisicao(cred, 26, k, 1, fault), { ok: false, mensagem: "Usuário inválido" });
  const http = (async () => new Response("boom", { status: 502 })) as typeof fetch;
  await assert.rejects(aprovarRequisicao(cred, 26, k, 1, http), /HTTP 502/);
  assert.throws(() => envelopeAprovarRequisicao(cred, 0, k, 1), /inválido/);
  assert.throws(() => envelopeAprovarRequisicao(cred, 26, { ...k, numero: -1 }, 1), /inválido/);
  assert.throws(() => envelopeAprovarRequisicao(cred, 26, k, 0), /Quantidade/);
});
