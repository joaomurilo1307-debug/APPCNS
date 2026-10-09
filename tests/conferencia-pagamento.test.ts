import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { ehCartaoCredito } from "../src/lib/pagamentos/cartaoCredito";
import { montarConferenciaPagamento } from "../src/lib/pagamentos/conferenciaPagamento";
import { consultarSenior } from "../src/lib/senior/getDbInfo";
import { prisma } from "../src/lib/prisma";
import { conferirItensRemessa } from "../src/lib/pagamentos/conferenciaRemessa";
import { itemTeste, dataTeste } from "../scripts/homologacao/fixtures";
import type { DadosSeniorDoTitulo } from "../src/lib/senior/dadosPagamentoTitulos";

const banco = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(banco.hostname) && banco.pathname === "/consominas_gestao_itau_homologacao");
const fetchOriginal = globalThis.fetch;
after(async () => { globalThis.fetch = fetchOriginal; await prisma.$disconnect(); });

const dado = (id: string, codigo: string): DadosSeniorDoTitulo => ({
  tituloId: id, codFpg: codigo, formaPagamento: codigo === "19" ? "PIX" : "Deposito em Conta", documento: "52998224725",
  achouNoSenior: true, codigoBarras: null, chavePix: codigo === "19" ? {tipo:"02",valor:`${id}@example.invalid`,fonte:"titulo"} : null,
  conta: codigo === "3" ? {banco:"341",agencia:"9999",conta:"99999",dac:"1",fonte:"cadastro"} : null,
});

test("Cartao de credito e identificado; debito, POS, PIX e TED mantem revisao normal", () => {
  assert.equal(ehCartaoCredito("20"), true);
  assert.equal(ehCartaoCredito("9", "Cartao Credito Cielo Varejo"), true);
  assert.equal(ehCartaoCredito("12", "Cartão Crédito Redecard Varejo"), true);
  for (const [cod, descricao] of [["8","Cartao Debito Cielo Varejo"],["11","Cartao Debito Redecard Varejo"],["13","Cartao POS"],["19","PIX"],["3","Deposito em Conta"]]) assert.equal(ehCartaoCredito(cod, descricao), false);
});

test("Conferencia usa dados ao vivo do mesmo titulo e alerta sincronizacao local desatualizada", () => {
  const r = montarConferenciaPagamento([{id:"a",numTit:"REPRODUCAO",codFpg:"18"}], [dado("a","3")]);
  assert.equal(r.itens[0].codFpg, "3"); assert.equal(r.itens[0].origemConta, "cadastro");
  assert.match(r.itens[0].conteudo.itens[0].valor,/99999-1/);
  assert.match(r.itens[0].divergencia!,/ultima sincronizacao local mostrava 18/);
});

test("Parcelas com formas distintas nao compartilham chave PIX nem conta", () => {
  const r = montarConferenciaPagamento([{id:"a",numTit:"A"},{id:"b",numTit:"B"}], [dado("b","19"),dado("a","3")]);
  assert.equal(r.itens[0].conteudo.tipo,"CONTA"); assert.equal(r.itens[1].conteudo.tipo,"PIX");
  assert.ok(!JSON.stringify(r.itens[0].conteudo).includes("b@example"));
  assert.equal(r.itens[1].conteudo.itens[0].valor,"b@example.invalid");
});

test("Titulo nao localizado ou consulta ausente nao e declarado conferido", () => {
  const r=montarConferenciaPagamento([{id:"a",numTit:"A"},{numTit:"B"}], [{...dado("a","19"),achouNoSenior:false}]);
  assert.equal(r.itens.length,0); assert.deepEqual(r.naoConferidos,["A","B"]);
});

test("HTTP 500 com XML valido nao confirma dados da Senior", async () => {
  globalThis.fetch=async()=>new Response(`<pmReturnGetDBInfo>${Buffer.from("<lines><line><CODFPG>19</CODFPG></line></lines>").toString("base64")}</pmReturnGetDBInfo>`,{status:500});
  try {await assert.rejects(consultarSenior("SELECT CODFPG FROM E420OCP"),/HTTP 500/);} finally {globalThis.fetch=fetchOriginal;}
});

test("erroExecucao da Senior nao e interpretado como dado ausente", async () => {
  globalThis.fetch=async()=>new Response("<result><erroExecucao>consulta recusada</erroExecucao><pmReturnGetDBInfo/></result>");
  try {await assert.rejects(consultarSenior("SELECT CODFPG FROM E420OCP"),/recusou/);} finally {globalThis.fetch=fetchOriginal;}
});

test("Conferencia de remessa bloqueia cartao mesmo com conta valida e revisao aprovada", async () => {
  const titulo=await prisma.tituloContasAPagar.create({data:{numTit:`C${randomUUID()}`,codFil:"1",codFor:"999999",tipo:"DUP",situacao:"AB",pago:false,dataEmissao:dataTeste,valorOriginal:100,valorAberto:100,codFpg:"20",revisadoStatus:"APROVADO"}});
  try {
    const item=itemTeste("01");
    const r=await conferirItensRemessa([{...item,tituloId:titulo.id,favorecidoTipoDoc:item.favorecidoTipoDocumento,dataPagamento:"2026-10-08"}]);
    assert.equal(r.resumo.comErro,1); assert.ok(r.linhas[0].problemas.some(p=>p.mensagem.includes("Cartão de Crédito")));
    assert.equal((await prisma.tituloContasAPagar.findUniqueOrThrow({where:{id:titulo.id}})).revisadoStatus,"APROVADO");
  } finally {await prisma.tituloContasAPagar.delete({where:{id:titulo.id}});}
});

test("Forma da OC nunca substitui forma ausente do titulo na conferencia", () => {
  const d = {...dado("a","19"), codFpgTitulo:null, formaPagamentoTitulo:null};
  const r = montarConferenciaPagamento([{id:"a",numTit:"A"}], [d]);
  assert.equal(r.itens[0].codFpg,null); assert.equal(r.itens[0].formaPagamento,null);
});
