// Exercicio pelas rotas HTTP reais, com NextAuth e SOAP local. Nunca usa ERP real.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import { writeFileSync, mkdirSync } from "node:fs";
import { criarSeniorSimulado } from "../scripts/homologacao/senior-simulado";
import { contaTeste, itemTeste, mudarCampo, dataTeste, boletoTeste } from "../scripts/homologacao/fixtures";
import { montarRetornoSimulado } from "../src/lib/pagamentos/casarRetorno";
import { identificacaoBeneficiarioBoleto } from "../src/lib/pagamentos/beneficiarioBoleto";

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
const ocIds: string[] = [];
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
  return { ...i, tituloId: titulo.id, favorecidoTipoDoc: i.favorecidoTipoDocumento, dataPagamento: "2026-10-08", beneficiarioBoletoConferido:identificacaoBeneficiarioBoleto(i.favorecidoDocumento,i.codigoBarras) };
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

    const cartao = await criarItem();
    await db.tituloContasAPagar.update({where:{id:cartao.tituloId},data:{codFpg:"20"}});
    const listaCartao = await http("/api/titulos-pagar");
    const visualCartao = listaCartao.data.titulos.find((t:{id:string})=>t.id===cartao.tituloId);
    assert.equal(visualCartao.cartaoCredito,true); assert.equal(visualCartao.revisadoStatus,"APROVADO");
    passou("Cartao de credito identificado pelo titulo sem sobrescrever revisao manual");
    const antesCartao = await db.remessaPagamento.count();
    const bloqueadoCartao = await http("/api/pagamentos-itau/remessas",{contaBancariaId:"homologacao-conta",itens:[cartao]});
    assert.equal(bloqueadoCartao.status,422,JSON.stringify(bloqueadoCartao.data));
    assert.equal(await db.remessaPagamento.count(),antesCartao);
    passou("Geracao via HTTP bloqueia cartao de credito mesmo com conta e dados validos");

    const numOcp = `8${String(Date.now()).slice(-9)}`;
    const tituloConferencia = await criarItem();
    const oc = await db.aprovacaoSenior.create({data:{numOcp,codFil:"1",fornecedorCodigo:"999999",fornecedorNome:"TESTE DE CONFERENCIA",dataEmissao:dataTeste,valor:100,numApr:"0",situacaoAtual:"APR"}});
    ocIds.push(oc.id);
    await db.tituloContasAPagar.update({where:{id:tituloConferencia.tituloId},data:{numOcp,filOcp:"1",codFpg:"18"}});
    const mapa = await http(`/api/senior/aprovacoes/${numOcp}`);
    assert.equal(mapa.status,200); assert.equal(mapa.data.titulosVinculados[0].id,tituloConferencia.tituloId);
    passou("Modal recebe identificacao exata do titulo vinculado para consulta ao vivo");
    const dadosConsulta = await http("/api/pagamentos-itau/dados-senior",{tituloIds:[tituloConferencia.tituloId],conferencia:true});
    assert.equal(dadosConsulta.status,200); assert.equal(dadosConsulta.data.completo,true,JSON.stringify(dadosConsulta.data));
    assert.equal(dadosConsulta.data.dados[0].codFpgTitulo,"3");
    assert.equal(dadosConsulta.data.dados[0].conta.fonte,"cadastro");
    assert.equal(dadosConsulta.data.dados[0].conta.conta,"99999");
    const consultasConferencia = await (await fetch("http://127.0.0.1:3099/_controle")).json();
    assert.ok(consultasConferencia.consultas.filter((s:string)=>s.includes("E501TCP")).every((s:string)=>s.includes("NUMTIT IN")),"Conferencia nao deve buscar todos os titulos de fornecedores.");
    passou("Conferencia usa titulo atual e cadastro corretos com consulta restrita aos titulos pedidos");
    await modo("CONFERENCIA_SEM_FORMA");
    const semFormaTitulo = await http("/api/pagamentos-itau/dados-senior",{tituloIds:[tituloConferencia.tituloId],conferencia:true});
    assert.equal(semFormaTitulo.data.dados[0].codFpg,null);
    assert.equal(semFormaTitulo.data.dados[0].codFpgTitulo,null);
    passou("Forma da OC permanece separada e nao substitui forma ausente do titulo na conferencia");
    await modo("CONFERENCIA_OUTRO_TIPO");
    const outroTipo = await http("/api/pagamentos-itau/dados-senior",{tituloIds:[tituloConferencia.tituloId],conferencia:true});
    assert.equal(outroTipo.data.completo,true); assert.equal(outroTipo.data.dados[0].codFpgTitulo,"3");
    passou("Titulos com mesmo numero e tipo diferente nao trocam dados na conferencia");
    await modo("OK");

    await modo("CONFERENCIA_BANCO_PARCIAL");
    const contaParcial = await http("/api/pagamentos-itau/dados-senior",{tituloIds:[tituloConferencia.tituloId]});
    assert.equal(contaParcial.data.dados[0].conta.banco,"237");assert.equal(contaParcial.data.dados[0].conta.conta,"12345678");assert.equal(contaParcial.data.dados[0].conta.dac,"");
    assert.match(contaParcial.data.dados[0].problemas.join(" "),/sem digito verificador/);
    passou("Conta sem DAC preserva banco agencia e conta preenchidos no titulo, sem inventar digito");

    await modo("CONFERENCIA_AMBIGUA");
    const antesAmbiguo=await db.remessaPagamento.count();
    const ambiguo=await http("/api/pagamentos-itau/remessas",{contaBancariaId:"homologacao-conta",itens:[tituloConferencia]});
    assert.equal(ambiguo.status,422);assert.equal(await db.remessaPagamento.count(),antesAmbiguo);
    passou("Geracao faz releitura completa e bloqueia identificacao ambigua na Senior");

    await modo("LEITURA_FALHA");
    const falhaLeitura=await http("/api/pagamentos-itau/remessas",{contaBancariaId:"homologacao-conta",itens:[tituloConferencia]});
    assert.equal(falhaLeitura.status,422);assert.equal(await db.remessaPagamento.count(),antesAmbiguo);
    passou("Senior indisponivel bloqueia geracao sem aproveitar dados antigos como confirmados");

    await modo("CONFERENCIA_BOLETO");
    const formaErrada = await http("/api/pagamentos-itau/remessas", { contaBancariaId: "homologacao-conta", itens: [tituloConferencia] });
    assert.equal(formaErrada.status, 422);
    assert.match(JSON.stringify(formaErrada.data), /Forma de pagamento do carrinho difere/);
    passou("Titulo definido como boleto nao pode gerar TED com forma antiga do carrinho");
    const boletoConferido=await criarItem("30");
    const semBeneficiario=await http("/api/pagamentos-itau/remessas",{contaBancariaId:"homologacao-conta",itens:[{...boletoConferido,beneficiarioBoletoConferido:null}]});
    assert.equal(semBeneficiario.status,422);
    const outroBoleto={...boletoConferido,codigoBarras:boletoTeste(101),beneficiarioBoletoConferido:identificacaoBeneficiarioBoleto(boletoConferido.favorecidoDocumento,boletoTeste(101))};
    const cruzado=await http("/api/pagamentos-itau/remessas",{contaBancariaId:"homologacao-conta",itens:[outroBoleto]});
    assert.equal(cruzado.status,422);assert.ok(cruzado.data.conferencia.linhas[0].problemas.some((p:{mensagem:string})=>p.mensagem.includes("difere do codigo atual")));
    passou("Boleto exige conferencia do beneficiario e impede codigo pertencente a outro titulo");
    const remessaConferida=await gerar(boletoConferido);
    const audit=await db.auditLog.findFirst({where:{entityType:"RemessaItemPagamento",entityId:remessaConferida.itens[0].id,action:"REMESSA_DADOS_CONFERIDOS"}});
    assert.ok(audit?.userId);assert.equal(JSON.parse(audit!.metadata!).beneficiarioBoletoConferido,true);
    passou("Geracao conferida registra usuario e dados utilizados na auditoria");
    // Libera o boleto artificial para a regressao de retorno abaixo; a protecao
    // de duplicidade correta impediria reutilizar um pagamento ainda pendente.
    await db.remessaItemPagamento.update({where:{id:remessaConferida.itens[0].id},data:{status:"REJEITADO"}});
    await modo("OK");

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

    const reservado = await criarItem();
    const paraArquivar = await gerar(reservado);
    assert.equal((await http("/api/pagamentos-itau/remessas/limpar", { acao: "limpar", remessaIds: [paraArquivar.id] }, false)).status, 401);
    const limpa = await http("/api/pagamentos-itau/remessas/limpar", { acao: "limpar", remessaIds: [paraArquivar.id] });
    assert.equal(limpa.status, 200); assert.equal(limpa.data.quantidade, 1);
    assert.ok((await db.remessaPagamento.findUniqueOrThrow({ where: { id: paraArquivar.id } })).arquivadaEm);
    const historicoLimpo = await http("/api/pagamentos-itau/historico");
    assert.ok(historicoLimpo.data.tituloIdsGerados.includes(reservado.tituloId));
    assert.ok(historicoLimpo.data.itens.some((i: {remessaId:string}) => i.remessaId === paraArquivar.id));
    assert.equal((await http("/api/pagamentos-itau/remessas", { contaBancariaId: "homologacao-conta", itens: [reservado] })).status, 422);
    passou("Limpar remessas exige autenticacao e preserva historico e bloqueio de pagamentos ja gerados");
    assert.equal((await http("/api/pagamentos-itau/retornos", { nomeArquivo: "TESTE-ARQUIVADO.ret", conteudo: montarRetornoSimulado(paraArquivar.conteudoArquivo!) })).status, 200);
    const restaura = await http("/api/pagamentos-itau/remessas/limpar", { acao: "restaurar", remessaIds: [paraArquivar.id] });
    assert.equal(restaura.data.quantidade, 1);
    assert.equal((await db.remessaPagamento.findUniqueOrThrow({ where: { id: paraArquivar.id } })).arquivadaEm, null);
    assert.equal(await db.auditLog.count({ where: { entityType: "RemessaPagamento", entityId: paraArquivar.id } }), 2);
    passou("Remessa arquivada continua recebendo retorno e pode ser restaurada com auditoria");

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
    const itensAuditados=await db.remessaItemPagamento.findMany({where:{remessaId:{in:remessaIds}},select:{id:true}});
    await db.auditLog.deleteMany({where:{entityType:"RemessaItemPagamento",entityId:{in:itensAuditados.map(i=>i.id)}}});
    await db.auditLog.deleteMany({where:{entityType:"RemessaPagamento",entityId:{in:remessaIds}}});
    await db.retornoPagamentoArquivo.deleteMany({ where: { remessaId: { in: remessaIds } } });
    await db.remessaPagamento.deleteMany({ where: { id: { in: remessaIds } } });
    await db.tituloContasAPagar.deleteMany({ where: { id: { in: tituloIds } } });
    await db.aprovacaoSenior.deleteMany({where:{id:{in:ocIds}}});
    await db.$disconnect(); await senior.fechar();
  }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
