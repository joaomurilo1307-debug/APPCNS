import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { gerarArquivoRemessa } from "../src/lib/cnab240/itau/remessa";
import { lerArquivoRetorno } from "../src/lib/cnab240/itau/retorno";
import { alfa, fatiaData, valorMonetario } from "../src/lib/cnab240/itau/campos";
import { montarRetornoSimulado, casarItemDoRetorno } from "../src/lib/pagamentos/casarRetorno";
import { processarRetorno, statusDoItem } from "../src/lib/pagamentos/processarRetorno";
import { conferirItensRemessa } from "../src/lib/pagamentos/conferenciaRemessa";
import { gerarBaixaPorLoteCP, lerRespostaBaixa, montarEnvelopeBaixa, situacaoDoTituloNaSenior, dataPagamentoNaSenior } from "../src/lib/senior/baixaTitulos";
import { registrarBaixaConferida } from "../src/lib/senior/registrarBaixaConferida";
import { homologacaoLocalSegura } from "../src/lib/ambienteHomologacao";
import { erroDoItemBaixa, reservarItemBaixa } from "../src/lib/senior/controleBaixa";
import { contaTeste, itemTeste, dataTeste, mudarCampo } from "../scripts/homologacao/fixtures";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/consominas_gestao_itau_homologacao", "Testes permitidos somente na base local exclusiva de homologacao.");
const db = new PrismaClient();
const runId = randomUUID().slice(0, 8);
let userId: string;
const remessas: string[] = [];
const titulos: string[] = [];
const retornos: string[] = [];
before(async () => {
  const user = await db.user.create({ data: { email: `teste-${runId}@example.invalid`, name: "TESTE AUTOMATICO", passwordHash: "sem-login", role: "ADMIN" } });
  userId = user.id;
});
after(async () => {
  await db.retornoPagamentoArquivo.deleteMany({ where: { processadoPorId: userId } });
  await db.remessaPagamento.deleteMany({ where: { id: { in: remessas } } });
  await db.tituloContasAPagar.deleteMany({ where: { id: { in: titulos } } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

async function pagamento(opcoes: { referencia?: string; seuNumero?: string; status?: "PENDENTE" | "PAGO" } = {}) {
  const ref = opcoes.referencia ?? `TEST-${randomUUID().slice(0, 12).toUpperCase()}`;
  const titulo = await db.tituloContasAPagar.create({ data: { numTit: ref, codFil: "1", codFor: "999999", tipo: "DUP", situacao: "AB", pago: false, dataEmissao: dataTeste, valorOriginal: 100, valorAberto: 100, revisadoStatus: "APROVADO" } });
  titulos.push(titulo.id);
  const remessa = await db.remessaPagamento.create({ data: { contaBancariaId: "homologacao-conta", status: "GERADO" } });
  remessas.push(remessa.id);
  const item = await db.remessaItemPagamento.create({ data: {
    remessaId: remessa.id, tituloId: titulo.id, referenciaEmpresa: ref, seuNumero: opcoes.seuNumero,
    numeroSequencial: 1, segmento: "A", formaPagamento: "01", favorecidoNome: "TESTE", favorecidoTipoDoc: "1", favorecidoDocumento: "52998224725",
    valor: 100, dataPagamento: dataTeste, status: opcoes.status ?? "PENDENTE",
    ...(opcoes.status === "PAGO" ? { valorEfetivado: 100, dataEfetivacao: dataTeste } : {}),
  } });
  return { item, titulo, cnab: itemTeste("01", opcoes.seuNumero ?? ref) };
}
const retornoDe = (...itens: ReturnType<typeof itemTeste>[]) => montarRetornoSimulado(gerarArquivoRemessa(contaTeste, itens, dataTeste).conteudo);
async function importar(conteudo: string) {
  const r = await processarRetorno(db, { conteudo, nomeArquivo: "TESTE-NAO-PAGAR.ret", userId });
  retornos.push(r.retorno.id);
  return r;
}

for (const forma of ["01", "41", "43", "45", "30", "31"] as const) {
  test(`CNAB ${forma}: 240 bytes, trailers, retorno e pagamento unico`, () => {
    const remessa = gerarArquivoRemessa(contaTeste, [itemTeste(forma)], dataTeste);
    const linhas = remessa.conteudo.split("\r\n").filter(Boolean);
    assert.ok(linhas.every(l => Buffer.byteLength(l, "utf8") === 240));
    assert.equal(Number(linhas.at(-1)!.slice(23, 29)), linhas.length);
    const retorno = lerArquivoRetorno(montarRetornoSimulado(remessa.conteudo));
    assert.equal(retorno.itens.length, 1);
    assert.equal(statusDoItem(retorno.itens[0]), "PAGO");
    assert.equal(retorno.itens[0].valorEfetivo, 100);
    assert.equal(retorno.itens[0].dataEfetiva?.toISOString(), dataTeste.toISOString());
    if (forma === "45") assert.equal(linhas[3][13], "B");
    if (["30", "31"].includes(forma)) assert.equal(linhas[3].slice(17, 19), "52");
  });
}
test("PIX por conta completa dispensa B e usa modelo 01", () => {
  const item = { ...itemTeste("45"), bancoFavorecido: "341", agenciaFavorecido: "9999", contaFavorecido: "99999", dacFavorecido: "1" };
  const r = gerarArquivoRemessa(contaTeste, [item], dataTeste);
  const linhas = r.conteudo.split("\r\n").filter(Boolean);
  assert.equal(linhas.length, 5);
  assert.equal(linhas[2].slice(112, 114), "01");
});
test("PIX misturado com boleto/TED e recusado pelo gerador", () => {
  assert.throws(() => gerarArquivoRemessa(contaTeste, [itemTeste("45"), itemTeste("01")]), /separada/);
});
test("Totalizacao monetaria usa centavos sem residuo de ponto flutuante", () => {
  assert.equal(gerarArquivoRemessa(contaTeste, [{ ...itemTeste("01", "TESTE-A"), valor: 0.1 }, { ...itemTeste("01", "TESTE-B"), valor: 0.2 }]).totalValor, 0.3);
});
test("Campos com Unicode nao quebram os 240 bytes e NaN nunca vira zero", () => {
  assert.equal(Buffer.byteLength(alfa("TESTE 😀 São", 30), "utf8"), 30);
  assert.throws(() => valorMonetario(NaN, 13, 2), /finito/);
});
test("Remessa nao pode ser importada como retorno", () => {
  assert.throws(() => lerArquivoRetorno(gerarArquivoRemessa(contaTeste, [itemTeste()], dataTeste).conteudo), /remessa/);
});
test("Retorno de outro banco e recusado", () => {
  assert.throws(() => lerArquivoRetorno(mudarCampo(retornoDe(itemTeste()), 0, 1, 3, "237")), /banco/);
});
test("Linha truncada nao e ignorada", () => {
  const r = retornoDe(itemTeste()).split("\r\n"); r[2] = r[2].slice(0, 239);
  assert.throws(() => lerArquivoRetorno(r.join("\r\n")), /240 bytes/);
});
test("Trailer ausente ou contagem divergente e recusado", () => {
  const r = retornoDe(itemTeste());
  assert.throws(() => lerArquivoRetorno(r.split("\r\n").slice(0, -2).join("\r\n")), /Trailer/);
  assert.throws(() => lerArquivoRetorno(mudarCampo(r, 4, 24, 29, "999999")), /registros/);
  assert.throws(() => lerArquivoRetorno(mudarCampo(r, 3, 18, 23, "999999")), /registros/);
});
test("Data inexistente nao e normalizada e valor nao numerico e recusado", () => {
  assert.throws(() => fatiaData("31022026", 1, 8), /inexistente/);
  assert.throws(() => lerArquivoRetorno(mudarCampo(retornoDe(itemTeste()), 2, 163, 177, "00000000000X000")), /Valor CNAB/);
});
test("Agendamento nao disponibiliza data/valor efetivo como prova de pagamento", () => {
  const item = lerArquivoRetorno(mudarCampo(retornoDe(itemTeste()), 2, 231, 240, "BD")).itens[0];
  assert.equal(statusDoItem(item), "AGENDADO");
});
test("BE e agendamento; SS e cancelamento; ocorrencia desconhecida exige conferencia", () => {
  for (const [cod, status] of [["BE", "AGENDADO"], ["SS", "CANCELADO"]]) {
    assert.equal(statusDoItem(lerArquivoRetorno(mudarCampo(retornoDe(itemTeste()), 2, 231, 240, cod)).itens[0]), status);
  }
  assert.throws(() => statusDoItem(lerArquivoRetorno(mudarCampo(retornoDe(itemTeste()), 2, 231, 240, "XX")).itens[0]), /manual/);
});
test("00 com erro/cancelamento nao e tratado como pago", () => {
  assert.throws(() => statusDoItem(lerArquivoRetorno(mudarCampo(retornoDe(itemTeste()), 2, 231, 240, "RJ00")).itens[0]), /juntos/);
});
test("Confirmacao sem data/valor e recusada", () => {
  assert.throws(() => statusDoItem(lerArquivoRetorno(mudarCampo(retornoDe(itemTeste()), 2, 155, 162, "00000000")).itens[0]), /efetivo/);
});
test("Importacao concorrente e idempotente, inclusive com LF e outro nome", async () => {
  const p = await pagamento(); const r = retornoDe(p.cnab);
  const resultados = await Promise.all([importar(r), importar(r.replace(/\r\n/g, "\n"))]);
  assert.equal(resultados.filter(x => x.duplicado).length, 1);
  const item = await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: p.item.id } });
  assert.equal(item.status, "PAGO"); assert.equal(JSON.parse(item.ocorrencias!).length, 1);
  const titulo = await db.tituloContasAPagar.findUniqueOrThrow({ where: { id: p.titulo.id } });
  assert.equal(titulo.revisadoStatus, "ENVIADO_AGUARDANDO_BAIXA"); assert.equal(titulo.pago, false);
});
test("Falha no ultimo item desfaz alteracoes nos anteriores e log", async () => {
  const a = await pagamento(); const b = await pagamento({ status: "PAGO" });
  let r = retornoDe(a.cnab, b.cnab);
  r = mudarCampo(r, 2, 231, 240, "BD"); r = mudarCampo(r, 3, 231, 240, "BD");
  const antes = await db.retornoPagamentoArquivo.count();
  await assert.rejects(importar(r), /ja confirmado/);
  assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: a.item.id } })).status, "PENDENTE");
  assert.equal(await db.retornoPagamentoArquivo.count(), antes);
});
test("Seu Numero legado repetido nunca escolhe arbitrariamente uma remessa", async () => {
  const numero = `LEGADO-${runId}`;
  const a = await pagamento({ seuNumero: numero }); await pagamento({ seuNumero: numero });
  await assert.rejects(casarItemDoRetorno(db, numero, lerArquivoRetorno(retornoDe(a.cnab)).itens[0]), /mais de uma/);
});
test("Referencia certa em conta errada e recusada sem alterar pagamento", async () => {
  const p = await pagamento(); const r = mudarCampo(retornoDe(p.cnab), 1, 53, 57, "01234");
  await assert.rejects(importar(r), /diverge/);
  assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: p.item.id } })).status, "PENDENTE");
});
test("CPF/CNPJ divergente no retorno nunca confirma o favorecido errado", async () => {
  const p = await pagamento();
  await assert.rejects(importar(mudarCampo(retornoDe(p.cnab), 2, 204, 217, "00112223330018")), /favorecido/);
});
test("Erro do Segmento B participa da decisao de status do PIX", () => {
  let r = retornoDe(itemTeste("45"));
  r = mudarCampo(r, 2, 231, 240, "BD"); r = mudarCampo(r, 3, 231, 240, "BI");
  assert.equal(statusDoItem(lerArquivoRetorno(r).itens[0]), "REJEITADO");
});
test("Reserva bloqueia o mesmo titulo em remessas historicas diferentes", async () => {
  const a = await pagamento({ status: "PAGO" }); const b = await pagamento({ status: "PAGO" });
  await db.remessaItemPagamento.update({ where: { id: b.item.id }, data: { tituloId: a.titulo.id } });
  assert.equal(await reservarItemBaixa(db, a.item.id, userId), true);
  assert.equal(await reservarItemBaixa(db, b.item.id, userId), false);
});
test("Chave de titulo longa nao e truncada na escrita Senior", () => {
  assert.throws(() => montarEnvelopeBaixa({ codEmp: 1, codFil: 1, datBai: dataTeste, numCco: "TESTE", titulos: [{ numInt: "TESTE", codFor: 999999, codFil: 1, numTit: "TITULO-MUITO-LONGO-123", codTpt: "DUP", valor: 100 }] }, "ficticio", "ficticio"), /truncado/);
});
test("Rejeicao apos agendamento limpa marca de enviado sem forcar pago", async () => {
  const p = await pagamento();
  await importar(mudarCampo(retornoDe(p.cnab), 2, 231, 240, "BD"));
  await importar(mudarCampo(retornoDe(p.cnab), 2, 231, 240, "RJ"));
  const t = await db.tituloContasAPagar.findUniqueOrThrow({ where: { id: p.titulo.id } });
  assert.equal(t.revisadoStatus, null); assert.equal(t.pago, false);
});
test("Conferencia bloqueia titulo que ja tem pagamento ativo", async () => {
  const p = await pagamento();
  const i = p.cnab;
  const r = await conferirItensRemessa([{ ...i, tituloId: p.titulo.id, favorecidoTipoDoc: i.favorecidoTipoDocumento, dataPagamento: "2026-10-08" }]);
  assert.equal(r.resumo.comErro, 1);
  assert.ok(r.linhas[0].problemas.some(x => x.gravidade === "erro" && x.mensagem.includes("Já consta")));
});
test("Reserva concorrente de baixa permite um unico envio", async () => {
  const p = await pagamento({ status: "PAGO" });
  const r = await Promise.all([reservarItemBaixa(db, p.item.id, userId), reservarItemBaixa(db, p.item.id, userId)]);
  assert.equal(r.filter(Boolean).length, 1);
});
test("Saldo ausente, invalido ou chave ambiguamente consultada nao vira JA_BAIXADO", () => {
  assert.throws(() => situacaoDoTituloNaSenior([{ SITTIT: "AB", VLRABE: "" }]), /invalido/);
  assert.throws(() => situacaoDoTituloNaSenior([{ SITTIT: "AB", VLRABE: "erro" }]), /invalido/);
  assert.throws(() => situacaoDoTituloNaSenior([{ SITTIT: "AB", VLRABE: "0,00" }, { SITTIT: "AB", VLRABE: "0,00" }]), /mais de uma/);
});
test("SOAP usa ordem XSD, virgula decimal e data UTC", () => {
  const xml = montarEnvelopeBaixa({ codEmp: 1, codFil: 1, datBai: dataTeste, numCco: "TESTE", titulos: [{ numInt: "TESTE", codFor: 999999, codFil: 1, numTit: "TESTE1", codTpt: "DUP", valor: 100 }] }, "usuario-ficticio", "senha-ficticia");
  assert.ok(xml.includes("<vlrBai>100,00</vlrBai>")); assert.ok(xml.includes("<datBai>08/10/2026</datBai>"));
  assert.ok(xml.indexOf("<codFil>") < xml.indexOf("<codFor>"));
});
test("Resposta SOAP com namespace e erro individual nao gera sucesso", () => {
  const r = lerRespostaBaixa('<s:resultado>OK</s:resultado><s:gridRetorno><s:numInt>TESTE</s:numInt><s:msgErr>Permissao negada</s:msgErr></s:gridRetorno>');
  assert.equal(r.ok, true); assert.equal(erroDoItemBaixa(r, "TESTE"), "Permissao negada");
  assert.equal(lerRespostaBaixa('<s:faultstring>Falha</s:faultstring>').ok, false);
});
test("HTTP 500 com XML OK nao e sucesso; transporte utiliza somente fetch simulado", async () => {
  const r = await gerarBaixaPorLoteCP({ codEmp: 1, codFil: 1, datBai: dataTeste, numCco: "TESTE", titulos: [{ numInt: "TESTE", codFor: 999999, codFil: 1, numTit: "TESTE1", codTpt: "DUP", valor: 100 }] }, {
    fetchImpl: (async () => new Response("<resultado>OK</resultado>", { status: 500 })) as typeof fetch,
  });
  assert.equal(r.ok, false); assert.match(r.erroExecucao, /HTTP 500/);
  assert.equal(r.httpOk, false);
});

test("Suites HTTP nao podem escrever em servidor com banco ou Senior reais", () => {
  assert.equal(homologacaoLocalSegura(), true);
  assert.equal(homologacaoLocalSegura({ ...process.env, APP_ENV: "production" }), false);
  assert.equal(homologacaoLocalSegura({ ...process.env, DATABASE_URL: "postgresql://ficticio:ficticio@localhost:5432/producao" }), false);
  assert.equal(homologacaoLocalSegura({ ...process.env, SENIOR_WS_BAIXA_URL: "https://erp.example.invalid/baixa" }), false);
});

test("Data da liquidacao vem da Senior, sem normalizar datas impossiveis", () => {
  assert.equal(dataPagamentoNaSenior("09/10/2026")?.toISOString(), "2026-10-09T00:00:00.000Z");
  assert.equal(dataPagamentoNaSenior("2026-10-09T00:00:00")?.toISOString(), "2026-10-09T00:00:00.000Z");
  for (const data of ["31/02/2026", "31/12/1900", "", "erro"]) assert.equal(dataPagamentoNaSenior(data), null);
});

test("Baixa sem saldo zero comprovado nunca atualiza titulo para pago", async () => {
  const p = await pagamento({ status: "PAGO" });
  await assert.rejects(registrarBaixaConferida(db, { itemId: p.item.id, status: "ENVIADA", mensagem: "TESTE", userId,
    situacao: situacaoDoTituloNaSenior([{ SITTIT: "AB", VLRABE: "100,00" }]),
  }), /nao confirmada/);
  assert.equal((await db.tituloContasAPagar.findUniqueOrThrow({ where: { id: p.titulo.id } })).pago, false);
});

test("Resumo guarda multiplas remessas e referencias sem correspondencia na reimportacao", async () => {
  const a = await pagamento(); const b = await pagamento();
  const r = retornoDe(a.cnab, b.cnab, itemTeste("01", `SEM-VINCULO-${runId}`));
  const primeiro = await importar(r);
  assert.equal(primeiro.remessasVinculadas.length, 2);
  assert.equal(primeiro.totalReconhecidos, 2);
  assert.deepEqual(primeiro.naoReconhecidos, [`SEM-VINCULO-${runId}`.toUpperCase()]);
  const repetido = await importar(r);
  assert.equal(repetido.duplicado, true);
  assert.equal(repetido.remessasVinculadas.length, 2);
  assert.equal(repetido.prontosParaBaixa, 2);
  assert.deepEqual(repetido.naoReconhecidos, primeiro.naoReconhecidos);
});
