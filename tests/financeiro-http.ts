// Exercicio pelas rotas HTTP reais, com NextAuth e SOAP local. Nunca usa ERP real.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { criarSeniorSimulado } from "../scripts/homologacao/senior-simulado";
import { contaTeste, itemTeste, mudarCampo, dataTeste } from "../scripts/homologacao/fixtures";
import { montarRetornoSimulado } from "../src/lib/pagamentos/casarRetorno";

const dbUrl = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(dbUrl.hostname) && dbUrl.pathname === "/consominas_gestao_itau_homologacao");
assert.equal(process.env.SENIOR_WS_SAPIENS_URL, "http://127.0.0.1:3099/leitura");
assert.equal(process.env.SENIOR_WS_BAIXA_URL, "http://127.0.0.1:3099/baixa");
const base = "http://localhost:3001";
const db = new PrismaClient();
const cookies = new Map<string, string>();
const resultados: string[] = [];
const tituloIds: string[] = [];
const remessaIds: string[] = [];
const stamp = Date.now().toString(36);
let contador = 0;
const senior = criarSeniorSimulado();
function passou(descricao: string) { resultados.push(descricao); console.log(`PASS: ${descricao}`); }
async function http(path: string, body?: unknown, auth = true) {
  const res = await fetch(base + path, { method: body ? "POST" : "GET", headers: {
    ...(body ? { "Content-Type": "application/json" } : {}), ...(auth ? { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; ") } : {}),
  }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "manual" });
  for (const cookie of res.headers.getSetCookie()) { const c = cookie.split(";")[0]; const idx = c.indexOf("="); cookies.set(c.slice(0, idx), c.slice(idx + 1)); }
  const text = await res.text();
  let data: any; try { data = JSON.parse(text); } catch { data = { html: text.slice(0, 200) }; }
  return { status: res.status, data, text };
}
async function modo(modo: string) { await fetch("http://127.0.0.1:3099/_controle", { method: "POST", body: JSON.stringify({ modo }) }); }
async function estadoSenior() { return await (await fetch("http://127.0.0.1:3099/_controle")).json() as { envios: number }; }
async function criarItem(forma: Parameters<typeof itemTeste>[0] = "01") {
  const numTit = `H${stamp}${++contador}`;
  const titulo = await db.tituloContasAPagar.create({ data: {
    numTit, codFil: "1", codFor: "999999", tipo: "DUP", situacao: "AB", pago: false,
    dataEmissao: dataTeste, valorOriginal: 100, valorAberto: 100, revisadoStatus: "APROVADO",
  } });
  tituloIds.push(titulo.id);
  const i = itemTeste(forma);
  return { ...i, tituloId: titulo.id, favorecidoTipoDoc: i.favorecidoTipoDocumento, dataPagamento: "2026-10-08" };
}
async function gerar(item: Awaited<ReturnType<typeof criarItem>>) {
  const r = await http("/api/pagamentos-itau/remessas", { contaBancariaId: "homologacao-conta", itens: [item] });
  assert.equal(r.status, 201, JSON.stringify(r.data));
  const id = r.data.remessas[0].id; remessaIds.push(id);
  const registro = await db.remessaPagamento.findUniqueOrThrow({ where: { id }, include: { itens: true } });
  return registro;
}
async function pago(item: Awaited<ReturnType<typeof criarItem>>) {
  const r = await gerar(item);
  const retorno = await http("/api/pagamentos-itau/retornos", { nomeArquivo: `TESTE-${r.id}.ret`, conteudo: montarRetornoSimulado(r.conteudoArquivo!) });
  assert.equal(retorno.status, 200, JSON.stringify(retorno.data));
  return r;
}

async function main() {
  const alvo = await http("/api/homologacao/ambiente", undefined, false);
  assert.equal(alvo.status, 200, "Servidor alvo nao confirmou homologacao local com Senior simulada; nenhuma escrita autorizada pela suite.");
  assert.deepEqual(alvo.data, { ambiente: "homologacao", senior: "SIMULADA", baseTeste: true });
  await senior.iniciar();
  try {
    assert.equal((await http("/api/pagamentos-itau/remessas", undefined, false)).status, 401);
    passou("Rotas financeiras exigem autenticacao");
    const csrf = await http("/api/auth/csrf");
    const login = await fetch(base + "/api/auth/callback/credentials", { method: "POST", headers: {
      "Content-Type": "application/x-www-form-urlencoded", Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "),
    }, body: new URLSearchParams({ csrfToken: csrf.data.csrfToken, email: process.env.HOMOLOGACAO_LOGIN!, password: process.env.HOMOLOGACAO_PASSWORD!, callbackUrl: base + "/inicio", json: "true" }), redirect: "manual" });
    for (const cookie of login.headers.getSetCookie()) { const c = cookie.split(";")[0]; const idx = c.indexOf("="); cookies.set(c.slice(0, idx), c.slice(idx + 1)); }
    assert.equal((await http("/api/pagamentos-itau/contas")).status, 200);
    passou("Login NextAuth real com usuario exclusivo da homologacao");

    const credito = await criarItem("01"); const pix = await criarItem("45");
    const antes = await db.remessaPagamento.count();
    const sim = await http("/api/pagamentos-itau/remessas", { contaBancariaId: "homologacao-conta", itens: [credito, pix], simular: true });
    assert.equal(sim.status, 200, JSON.stringify(sim.data)); assert.equal(sim.data.desfeita, true);
    assert.equal(sim.data.remessas.length, 2);
    for (const r of sim.data.remessas) { assert.equal(r.retornoSimulado.casadasNoItemCerto, 1); assert.equal(r.retornoSimulado.casadasNoItemErrado, 0); }
    assert.equal(await db.remessaPagamento.count(), antes);
    passou("Carrinho misto gera 2 arquivos, simula retorno e desfaz a transacao");

    const concorrentes = await Promise.all([http("/api/pagamentos-itau/remessas", { contaBancariaId: "homologacao-conta", itens: [credito] }), http("/api/pagamentos-itau/remessas", { contaBancariaId: "homologacao-conta", itens: [credito] })]);
    assert.equal(concorrentes.filter(r => r.status === 201).length, 1, JSON.stringify(concorrentes));
    const id = concorrentes.find(r => r.status === 201)!.data.remessas[0].id; remessaIds.push(id);
    assert.equal(await db.remessaItemPagamento.count({ where: { tituloId: credito.tituloId } }), 1);
    passou("Duas geracoes simultaneas produzem apenas um pagamento");

    const remessa = await db.remessaPagamento.findUniqueOrThrow({ where: { id }, include: { itens: true } });
    assert.equal(remessa.itens[0].seuNumero, null);
    const conteudo = montarRetornoSimulado(remessa.conteudoArquivo!);
    const bd = await http("/api/pagamentos-itau/retornos", { nomeArquivo: "TESTE-AGENDADO.ret", conteudo: mudarCampo(conteudo, 2, 231, 240, "BD") });
    assert.equal(bd.data.prontosParaBaixa, 0);
    const agendado = await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: remessa.itens[0].id } });
    assert.equal(agendado.dataEfetivacao, null); assert.equal(agendado.valorEfetivado, null);
    passou("BD agenda sem criar prova de liquidacao nem liberar baixa");
    const ok = await http("/api/pagamentos-itau/retornos", { nomeArquivo: "TESTE-PAGO.ret", conteudo });
    assert.equal(ok.data.prontosParaBaixa, 1);
    assert.equal(ok.data.remessasVinculadas[0].id, id);
    const repetido = await http("/api/pagamentos-itau/retornos", { nomeArquivo: "TESTE-RENOMEADO.ret", conteudo: conteudo.replace(/\r\n/g, "\n") });
    assert.equal(repetido.data.duplicado, true);
    assert.equal(repetido.data.prontosParaBaixa, 1);
    const auditoria = await http("/api/pagamentos-itau/retornos");
    const arquivoPago = auditoria.data.retornos.find((a: { id: string }) => a.id === ok.data.retorno.id);
    assert.equal(arquivoPago.remessasVinculadas[0].qtdProntos, 1);
    passou("00 confirma pagamento; reimportacao com outro nome/LF nao duplica historico");
    const antesBaixa = (await estadoSenior()).envios;
    const previa = await http(`/api/pagamentos-itau/remessas/${id}/baixa-senior`, {});
    assert.equal(previa.data.elegiveis.length, 1, JSON.stringify(previa.data));
    assert.equal((await estadoSenior()).envios, antesBaixa);
    passou("Previa confere conta e titulo sem executar baixa");
    const baixas = await Promise.all([http(`/api/pagamentos-itau/remessas/${id}/baixa-senior`, { confirmar: true }), http(`/api/pagamentos-itau/remessas/${id}/baixa-senior`, { confirmar: true })]);
    assert.equal(baixas.reduce((s, r) => s + (r.data.enviados ?? 0), 0), 1, JSON.stringify(baixas));
    assert.equal((await estadoSenior()).envios - antesBaixa, 1);
    assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: remessa.itens[0].id } })).baixaSeniorStatus, "ENVIADA");
    passou("Confirmacoes concorrentes executam um SOAP e conferem saldo zero apos baixa");
    const espelho = await db.tituloContasAPagar.findUniqueOrThrow({ where: { id: credito.tituloId } });
    assert.equal(espelho.pago, true); assert.equal(espelho.valorAberto, 0);
    assert.equal(espelho.dataPagamento?.toISOString().slice(0, 10), "2026-10-08");
    assert.equal(espelho.revisadoStatus, null);
    const aposBaixa = await http("/api/pagamentos-itau/retornos");
    assert.equal(aposBaixa.data.retornos.find((a: { id: string }) => a.id === ok.data.retorno.id).remessasVinculadas[0].qtdConcluidos, 1);
    passou("Liquidacao conferida atualiza programacao e pendencias do retorno imediatamente");

    await modo("ERRO_ITEM");
    const erro = await pago(await criarItem("41"));
    const rErro = await http(`/api/pagamentos-itau/remessas/${erro.id}/baixa-senior`, { confirmar: true });
    assert.equal(rErro.data.enviados, 0); assert.equal(rErro.data.comErro, 1);
    assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: erro.itens[0].id } })).baixaSeniorStatus, "ERRO");
    passou("OK geral com erro individual nao marca baixa enviada");

    await modo("ERRO_ITEM_PARCIAL");
    const parciais = [await criarItem("01"), await criarItem("01")];
    const loteParcial = await http("/api/pagamentos-itau/remessas", { contaBancariaId: "homologacao-conta", itens: parciais });
    assert.equal(loteParcial.status, 201);
    const parcialId = loteParcial.data.remessas[0].id; remessaIds.push(parcialId);
    const parcial = await db.remessaPagamento.findUniqueOrThrow({ where: { id: parcialId } });
    assert.equal((await http("/api/pagamentos-itau/retornos", { nomeArquivo: "TESTE-PARCIAL.ret", conteudo: montarRetornoSimulado(parcial.conteudoArquivo!) })).status, 200);
    const retornoParcial = await http(`/api/pagamentos-itau/remessas/${parcialId}/baixa-senior`, { confirmar: true });
    assert.equal(retornoParcial.data.enviados, 1); assert.equal(retornoParcial.data.comErro, 1); assert.equal(retornoParcial.data.titulosAtualizados, 1);
    const itensParciais = await db.remessaItemPagamento.findMany({ where: { remessaId: parcialId }, include: { titulo: true } });
    assert.equal(itensParciais.filter(i => i.baixaSeniorStatus === "ENVIADA" && i.titulo?.pago).length, 1);
    assert.equal(itensParciais.filter(i => i.baixaSeniorStatus === "ERRO" && !i.titulo?.pago).length, 1);
    passou("Lote com resultado parcial conclui apenas o titulo efetivamente liquidado");

    await modo("SEM_RESPOSTA");
    const perdido = await pago(await criarItem("45"));
    await http(`/api/pagamentos-itau/remessas/${perdido.id}/baixa-senior`, { confirmar: true });
    assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: perdido.itens[0].id } })).baixaSeniorStatus, "INDETERMINADO");
    const listaPendencias = await http("/api/pagamentos-itau/remessas");
    assert.equal(listaPendencias.data.remessas.find((r: { id: string }) => r.id === perdido.id).qtdBaixaConferir, 1);
    const chamadas = (await estadoSenior()).envios;
    const retry = await http(`/api/pagamentos-itau/remessas/${perdido.id}/baixa-senior`, { confirmar: true });
    assert.equal(retry.data.bloqueados.length, 1); assert.equal((await estadoSenior()).envios, chamadas);
    passou("Falha de transporte fica indeterminada e bloqueia reenvio automatico");

    await modo("SEM_RESPOSTA_APOS_BAIXA");
    const recuperavel = await pago(await criarItem("01"));
    await http(`/api/pagamentos-itau/remessas/${recuperavel.id}/baixa-senior`, { confirmar: true });
    assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: recuperavel.itens[0].id } })).baixaSeniorStatus, "INDETERMINADO");
    const enviosRecuperacao = (await estadoSenior()).envios;
    const previaRecuperacao = await http(`/api/pagamentos-itau/remessas/${recuperavel.id}/baixa-senior`, {});
    assert.equal(previaRecuperacao.data.elegiveis.length, 0); assert.equal(previaRecuperacao.data.jaBaixados.length, 1);
    const reconciliado = await http(`/api/pagamentos-itau/remessas/${recuperavel.id}/baixa-senior`, { confirmar: true });
    assert.equal(reconciliado.data.titulosAtualizados, 1);
    assert.equal((await estadoSenior()).envios, enviosRecuperacao);
    assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: recuperavel.itens[0].id } })).baixaSeniorStatus, "JA_BAIXADO");
    assert.equal((await db.tituloContasAPagar.findUniqueOrThrow({ where: { id: recuperavel.itens[0].tituloId! } })).pago, true);
    passou("Resposta perdida apos liquidacao e reconciliada sem reenviar SOAP");

    await modo("HTTP_500_ERRO");
    const falhaHttp = await pago(await criarItem("01"));
    await http(`/api/pagamentos-itau/remessas/${falhaHttp.id}/baixa-senior`, { confirmar: true });
    assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: falhaHttp.itens[0].id } })).baixaSeniorStatus, "INDETERMINADO");
    passou("HTTP 500 com XML ERRO permanece inconclusivo, sem liberar repeticao");

    await modo("ACEITE_SEM_BAIXA");
    const aceite = await pago(await criarItem("01"));
    const naoLiquidou = await http(`/api/pagamentos-itau/remessas/${aceite.id}/baixa-senior`, { confirmar: true });
    assert.equal(naoLiquidou.data.enviados, 0); assert.equal(naoLiquidou.data.comErro, 1);
    assert.equal((await db.remessaItemPagamento.findUniqueOrThrow({ where: { id: aceite.itens[0].id } })).baixaSeniorStatus, "INDETERMINADO");
    passou("SOAP OK sem saldo zero posterior nao e considerado baixa concluida");

    await modo("OK");
    const boleto = await pago(await criarItem("30"));
    const rb = await http(`/api/pagamentos-itau/remessas/${boleto.id}/baixa-senior`, { confirmar: true });
    assert.equal(rb.data.enviados, 1, JSON.stringify(rb.data));
    passou("Boleto J/J-52 gera, retorna, reconcilia e baixa via SOAP simulado");

    const sinc = await fetch(base + "/api/senior/titulos-pagar/sync?modo=incremental", { method: "POST", headers: { "Content-Type": "application/json", "x-sync-key": process.env.SENIOR_SYNC_KEY! }, body: JSON.stringify({ itens: [{
      numTit: credito.tituloId ? (await db.tituloContasAPagar.findUniqueOrThrow({ where: { id: credito.tituloId } })).numTit : "", codFil: "1", codFor: "999999", tipo: "DUP", situacao: "LQ", pago: true,
      dataEmissao: "2026-10-08", fornecedorNome: "TESTE", vencimentoOriginal: null, vencimentoProgramado: null,
      valorOriginal: 100, valorAberto: 0, dataPagamento: "2026-10-08", codccu: null, ccuNome: null, numOcp: null,
    }] }) });
    assert.equal(sinc.status, 200);
    const tituloFinal = await db.tituloContasAPagar.findUniqueOrThrow({ where: { id: credito.tituloId } });
    assert.equal(tituloFinal.pago, true); assert.equal(tituloFinal.valorAberto, 0); assert.ok(tituloFinal.dataPagamento);
    passou("Sincronizacao incremental de liquidacao atualiza programacao e data de pagamento");

    mkdirSync("tmp/homologacao", { recursive: true });
    writeFileSync("tmp/homologacao/resultado-http.json", JSON.stringify({ geradoEm: new Date().toISOString(), total: resultados.length, aprovados: resultados }, null, 2));
    console.log(`VALIDADOS: ${resultados.length} cenarios HTTP com NextAuth, Postgres e Senior simulada.`);
  } finally {
    await db.retornoPagamentoArquivo.deleteMany({ where: { remessaId: { in: remessaIds } } });
    await db.remessaPagamento.deleteMany({ where: { id: { in: remessaIds } } });
    await db.tituloContasAPagar.deleteMany({ where: { id: { in: tituloIds } } });
    await db.$disconnect(); await senior.fechar();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
