import test from "node:test";
import assert from "node:assert/strict";
import { gerarBaixaPorLoteCP, lerRespostaBaixar, liquidadoNaSenior, montarEnvelopeBaixar, situacaoDoTituloNaSenior } from "../src/lib/senior/baixaTitulos";

const lote = {
  codEmp: 1, codFil: 1, datBai: new Date(Date.UTC(2026, 9, 20)), numCco: "341",
  titulos: [
    { numInt: "REF-1", codFor: 78, codFil: 1, numTit: "705A1", codTpt: "NFS", valor: 642.05 },
    { numInt: "REF-2", codFor: 34, codFil: 1, numTit: "15080A1", codTpt: "NFS", valor: 497.42 },
  ],
};
const resposta = (a: string, b: string, extra = "") =>
  `<S:Envelope><S:Body><ns2:BaixarResponse><result>${extra}` +
  `<resultado><codFor>78</codFor><ideExt>1</ideExt><msgRet>${a === "OK" ? "Baixado" : "Titulo nao encontrado"}</msgRet><numTit>705A1</numTit><resultado>${a}</resultado><tipRet>1</tipRet></resultado>` +
  `<resultado><codFor>34</codFor><ideExt>2</ideExt><msgRet>x</msgRet><numTit>15080A1</numTit><resultado>${b}</resultado><tipRet>1</tipRet></resultado>` +
  `</result></ns2:BaixarResponse></S:Body></S:Envelope>`;

test("Baixar: envelope na ordem do XSD, valores com virgula e ideExt = indice", () => {
  const x = montarEnvelopeBaixar(lote, "u", "s");
  assert.match(x, /<ser:Baixar>/);
  assert.match(x, /<codEmp>1<\/codEmp><codFil>1<\/codFil><codFor>78<\/codFor><codTns>90550<\/codTns><codTpt>NFS<\/codTpt><datMov>20\/10\/2026<\/datMov><datPgt>20\/10\/2026<\/datPgt><ideExt>1<\/ideExt><numCco>341<\/numCco><numTit>705A1<\/numTit><tnsCxb>90650<\/tnsCxb><vlrLiq>642,05<\/vlrLiq><vlrMov>642,05<\/vlrMov>/);
  assert.match(x, /<ideExt>2<\/ideExt>/);
});
test("Baixar: todos OK -> ok; um ERRO -> so aquele item falha e o lote nao e ok", () => {
  assert.equal(lerRespostaBaixar(resposta("OK", "OK"), lote).ok, true);
  const r = lerRespostaBaixar(resposta("OK", "ERRO"), lote);
  assert.equal(r.ok, false); assert.equal(r.resultado, "ERRO");
  assert.deepEqual(r.itens.map(i => [i.numInt, i.msgErr]), [["REF-1", ""], ["REF-2", "x"]]);
});
test("Baixar: resposta incompleta, erroExecucao e fault nunca contam como OK", () => {
  assert.equal(lerRespostaBaixar(resposta("OK", "OK").replace(/<resultado><codFor>34[\s\S]*?<\/resultado><\/result>/, "</result>"), lote).ok, false);
  assert.equal(lerRespostaBaixar(resposta("OK", "OK", "<erroExecucao>falhou</erroExecucao>"), lote).ok, false);
  assert.equal(lerRespostaBaixar("<faultstring>boom</faultstring>", lote).erroExecucao, "boom");
});
test("SENIOR_BAIXA_PORTA=padrao troca a URL e o envelope; sem a variavel segue o GerarBaixaPorLoteCP", async () => {
  process.env.SENIOR_WS_SAPIENS_USER = "u"; process.env.SENIOR_WS_SAPIENS_PASSWORD = "s";
  const chamadas: { url: string; body: string }[] = [];
  const fetchImpl = (async (url: string, init: any) => { chamadas.push({ url, body: init.body }); return new Response(resposta("OK", "OK"), { status: 200 }); }) as any;
  process.env.SENIOR_BAIXA_PORTA = "padrao";
  try {
    const r = await gerarBaixaPorLoteCP(lote, { fetchImpl });
    assert.equal(r.ok, true); assert.match(chamadas[0].url, /int_padrao_titulos_contaspagar$/); assert.match(chamadas[0].body, /<ser:Baixar>/);
  } finally { delete process.env.SENIOR_BAIXA_PORTA; }
  await gerarBaixaPorLoteCP(lote, { fetchImpl });
  assert.match(chamadas[1].url, /co_mfi_cpa_titulos$/); assert.match(chamadas[1].body, /GerarBaixaPorLoteCP/);
});

test("liquidadoNaSenior decide pela leitura do titulo, nao pela resposta do webservice", () => {
  const lido = (SITTIT: string, VLRABE: string) => situacaoDoTituloNaSenior([{ NUMTIT: "1A1", CODTPT: "NFS", CODFOR: "1", SITTIT, VLRABE, ULTPGT: "21/10/2026" } as any]);
  assert.equal(liquidadoNaSenior(lido("LQ", "0")), true);
  assert.equal(liquidadoNaSenior(lido("AB", "2280")), false);
  assert.equal(liquidadoNaSenior(lido("LQ", "100")), false);
  assert.equal(liquidadoNaSenior(situacaoDoTituloNaSenior([])), false);
});
