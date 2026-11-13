// Complemento do dossie (dados da OC, itens/rateio com Reembolsavel, historico de pagamentos, reembolso, sem nota, DANFE,
// fatura de locacao). Sem banco nem Senior: a consulta e' simulada.
import assert from "node:assert/strict";
import test from "node:test";
import {
  MARCADOR_DANFE,
  MARCADOR_HISTORICO,
  MARCADOR_ITENS,
  MARCADOR_OC,
  aplicarComplemento,
  chavesDasNotas,
  codigosDoGrupoDoFornecedor,
  coletarComplemento,
  motivoReembolso,
  montarHtmlComplemento,
  parcelamento,
} from "../src/lib/dossie/complemento";
import { cnpjCpf, moeda } from "../src/lib/dossie/formatar";

const CHAVE = "15260902464837000117550010000630861345857990";
type Cenario = { contas?: string[]; semNf?: boolean; semOc?: boolean; usuReemb?: string; historico?: Record<string, string>[]; consultas?: string[] };
const linhas = (sql: string, c: Cenario) => {
  c.consultas?.push(sql);
  if (/FROM E420OCP/.test(sql)) return c.semOc ? [] : [{ OBSOCP: "Compra de EPI", CODFOR: "605160", CODCPG: "001", CODFPG: "18", USU_REEMB: c.usuReemb ?? "", VLRLIQ: "0", VLRORI: "899" }];
  if (/FROM E095FOR/.test(sql)) return [{ CODFOR: "605160", NOMFOR: "MERCANTIL OLIVEIRA", CGCCPF: "2464837000117", INSEST: "1", ENDFOR: "RIO MARMORE", BAIFOR: "VILA", CIDFOR: "ORIXIMINA", SIGUFS: "PA", CEPFOR: "68275000" }];
  if (/FROM E028CPG/.test(sql)) return [{ DESCPG: "A VISTA" }];
  // Uma linha de rateio por conta, todas no produto 1, com PERRAT = 100 e o VLRRAT como fatia (como a Senior grava).
  if (/FROM E420RAT/.test(sql)) {
    const contas = c.contas ?? ["68"];
    return contas.map((CTAFIN, i) => ({ SEQRAT: String(i + 1), SEQIPO: "1", SEQISO: "0", CODCCU: "190", CTAFIN, PERCTA: "100", PERRAT: "100", VLRCTA: "899", VLRRAT: String(899 / contas.length).replace(".", ",") }));
  }
  if (/FROM E044CCU/.test(sql)) return [{ CODCCU: "190", DESCCU: "OBRA ORIXIMINA" }];
  if (/FROM E091PLF/.test(sql)) return [{ CTAFIN: "68", DESCTA: "MATERIAL DE SEGURANCA" }, { CTAFIN: "181", DESCTA: "REEMBOLSO CLIENTE" }];
  if (/FROM E070FIL/.test(sql)) return [{ NOMFIL: "CONSOMINAS", NUMCGC: "7080673000148", ENDENT: "RUA CAMOES, 126", CIDFIL: "BH", SIGUFS: "MG" }];
  if (/FROM E440NFC/.test(sql)) return c.semNf ? [] : [{ NUMNFC: "63086", CODSNF: "NFE", CHVNEL: CHAVE, VLRLIQ: "899", VLRICM: "170,81", OBSNFC: "dados adicionais da nota", CODTRA: "0" }];
  if (/FROM E440IPC/.test(sql)) return [{ CODPRO: "888236", CPLIPC: "PERNEIRA", QTDREC: "10", PREUNI: "89,9", VLRBRU: "899" }];
  if (/FROM E501TCP/.test(sql)) return c.historico ?? [];
  return []; // E440ISC
};
const fluxo = (comNota = true, descricao = "PERNEIRA") => ({
  produtos: [{ sequencia: 1, produto: { codigo: "888236", descricao }, unidade: "UN", quantidades: { pedida: 10 }, valores: { unitario: 89.9, liquido: 0, original: 899 } }],
  servicos: [],
  documentosFiscais: comNota ? [{ filial: 1, fornecedor: 605160, numero: 63086, serie: "NFE" }] : [],
  titulos: [{ filial: 1, fornecedor: 605160, numero: "63086A", tipo: "DP", datas: { emissao: "2026-10-01", vencimentoAtual: "2026-10-31" }, valores: { original: 899, aberto: 899 }, situacao: { descricao: "Aberto" } }],
});
const oc = { codFil: 1, numOcp: 15500 };

test("Reembolso: conta 179 nao, 180 em diante sim; USU_REEMB=S tambem", () => {
  assert.equal(motivoReembolso([68, 179], ""), null);
  assert.match(motivoReembolso([68, 180], "")!, /180/);
  assert.match(motivoReembolso([201], "")!, /201/);
  assert.match(motivoReembolso([68], "S")!, /USU_REEMB/);
});

test("Notas do fluxo: ignora sem numero/serie e nao repete", () => {
  const k = chavesDasNotas([{ numero: 5, serie: "A" }, { numero: 5, serie: "A" }, { numero: null, serie: "A" }, { numero: 7, serie: "" }], 1, 9);
  assert.deepEqual(k, [{ codFil: 1, codFor: 9, numNfc: 5, codSnf: "A" }]);
});

test("CNPJ da Senior perde o zero a esquerda; CPF e vazio", () => {
  assert.equal(cnpjCpf("2464837000117"), "02.464.837/0001-17");
  assert.equal(cnpjCpf("12345678901"), "123.456.789-01");
  assert.equal(cnpjCpf("0"), "-");
});

test("Caminho feliz: dados da OC + itens com Reembolsavel NAO + rateio nomeado + DANFE; sem aviso de 'sem nota' nem de reembolso", async () => {
  const d = await coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, {}));
  const h = montarHtmlComplemento(d);
  assert.match(h.oc, /Dados da Ordem de Compra/);
  assert.match(h.oc, /02\.464\.837\/0001-17/);
  assert.match(h.oc, /RIO MARMORE/);
  assert.match(h.oc, /001 - A VISTA/);
  assert.match(h.oc, /Compra de EPI/);
  assert.match(h.oc, /R\$\s899,00/); // VLRLIQ = 0 na OC liquidada: mostra o original
  assert.match(h.oc, /Despesa reembolsável<\/th><td colspan="3">Não</);
  assert.doesNotMatch(h.oc, /SEM NOTA FISCAL|ITEM REEMBOLSÁVEL/);
  assert.match(h.itens, /<th>Valor Total<\/th><th>Reembolsável<\/th>/);
  assert.match(h.itens, /PERNEIRA<\/td><td>UN<\/td><td class="num">10<\/td><td class="num">R\$\s89,90<\/td><td class="num">R\$\s899,00<\/td><td>NÃO<\/td>/);
  assert.match(h.itens, /190 - OBRA ORIXIMINA/);
  assert.match(h.itens, /68 - MATERIAL DE SEGURANCA/);
  assert.match(h.danfe, /DANFE/);
  assert.match(h.danfe, /1526 0902 4648/);
  assert.match(h.danfe, /dados adicionais da nota/);
});

test("Reembolsavel misto: aviso + item SIM + rateio linha a linha + campo 'Despesa reembolsavel' com as duas partes", async () => {
  const d = await coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, { contas: ["68", "181"] }));
  const h = montarHtmlComplemento(d);
  assert.match(h.oc, /ITEM REEMBOLSÁVEL/);
  assert.match(h.oc, /conta financeira 181/);
  assert.match(h.oc, /OC mista/);
  assert.match(h.oc, /Mista — R\$\s449,50 reembolsável e R\$\s449,50 não reembolsável/);
  assert.match(h.oc, /PERNEIRA/);
  assert.match(h.oc, /02\.464\.837\/0001-17/);
  assert.match(h.itens, /R\$\s899,00<\/td><td class="reemb-sim">SIM<\/td>/); // o item tem parte reembolsavel
  assert.match(h.itens, /68 - MATERIAL DE SEGURANCA<\/td><td>-<\/td><td class="num">50%<\/td><td class="num">R\$\s449,50<\/td><td>NÃO<\/td>/);
  assert.match(h.itens, /181 - REEMBOLSO CLIENTE<\/td><td>-<\/td><td class="num">50%<\/td><td class="num">R\$\s449,50<\/td><td class="reemb-sim">SIM<\/td>/);
});

test("USU_REEMB = 'S': toda a OC reembolsavel, mesmo com conta abaixo de 180", async () => {
  const h = montarHtmlComplemento(await coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, { usuReemb: "S" })));
  assert.match(h.oc, /Sim — toda a OC/);
  assert.match(h.itens, /R\$\s899,00<\/td><td class="reemb-sim">SIM<\/td>/);
});

test("Sem nota fiscal: aviso no lugar e nenhuma DANFE (nota citada pelo titulo mas ausente do ERP tambem)", async () => {
  for (const [f, c] of [[fluxo(false), {}], [fluxo(true), { semNf: true }]] as const) {
    const h = montarHtmlComplemento(await coletarComplemento(oc, f, async (sql) => linhas(sql, c)));
    assert.match(h.oc, /SEM NOTA FISCAL/);
    assert.equal(h.danfe, "");
  }
});

test("Locacao sem nota: espelho da fatura de locacao no lugar da DANFE e sem o aviso 'SEM NOTA FISCAL'", async () => {
  const h = montarHtmlComplemento(await coletarComplemento(oc, fluxo(false, "LOCAÇÃO DE VEÍCULO PLACA ABC1D23"), async (sql) => linhas(sql, {})));
  assert.doesNotMatch(h.oc, /SEM NOTA FISCAL/);
  assert.match(h.oc, /Locação sem nota fiscal/);
  assert.match(h.danfe, /Fatura de Locação \(espelho\)/);
  assert.match(h.danfe, /Locador: MERCANTIL OLIVEIRA/);
  assert.match(h.danfe, /Nº 63086A/);
  assert.match(h.danfe, /LOCAÇÃO DE VEÍCULO PLACA ABC1D23/);
  assert.match(h.danfe, /CONSOMINAS/); // locatario = filial
  assert.match(h.danfe, /31\/10\/2026/); // vencimento do titulo
  assert.match(h.danfe, /Não substitui a fatura emitida pelo locador/);
  // Com nota lancada, a locacao segue com a DANFE da nota
  const comNota = montarHtmlComplemento(await coletarComplemento(oc, fluxo(true, "LOCAÇÃO DE VEÍCULO"), async (sql) => linhas(sql, {})));
  assert.match(comNota.danfe, /DANFE/);
  assert.doesNotMatch(comNota.danfe, /Fatura de Locação/);
});

test("Historico: 3 pagamentos mais recentes do fornecedor, sem o titulo da propria OC; consulta pelo grupo de empresas", async () => {
  const pago = (NUMTIT: string, ULTPGT: string, extra: Record<string, string> = {}) => ({ CODFIL: "1", NUMTIT, CODTPT: "DP", CODFOR: "605160", SITTIT: "LQ", DATEMI: "01/09/2026", VCTORI: "30/09/2026", VCTPRO: "30/09/2026", VLRORI: "100", VLRABE: "0", ULTPGT, NUMNFC: "0", SNFNFC: "", USU_NUMOCP: "0", ...extra });
  const consultas: string[] = [];
  const historico = [
    pago("A1", "05/09/2026"),
    pago("63086A", "20/10/2026"), // titulo desta OC: fora
    pago("A2", "15/10/2026", { NUMNFC: "777", SNFNFC: "1", USU_NUMOCP: "15001" }),
    pago("A3", "10/10/2026", { CODFOR: "617268" }), // outro cadastro do grupo
    pago("A4", "01/10/2026"),
  ];
  const d = await coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, { historico, consultas }), { fornecedoresDoGrupo: [605160, 617268] });
  assert.deepEqual(d.historico.map((p) => p.numTit), ["A2", "A3", "A4"]);
  assert.ok(consultas.some((s) => /FROM E501TCP WHERE CODEMP = 1 AND CODFOR IN \(605160, 617268\)/.test(s)));
  const h = montarHtmlComplemento(d).historico;
  assert.match(h, /últimos 3 pagamentos/);
  assert.match(h, /777 \/ 1/);
  assert.match(h, /15001/);
  assert.match(h, /forn\. 617268/);
  assert.doesNotMatch(h, /63086A/);
});

test("Falha: Senior fora do ar ou OC inexistente derruba a coleta (o dossie vai para ERRO e e' refeito), nao sai PDF incompleto", async () => {
  await assert.rejects(coletarComplemento(oc, fluxo(), async () => { throw new Error("Senior recusou a consulta."); }), /Senior recusou/);
  await assert.rejects(coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, { semOc: true })), /não encontrada/);
});

test("Nome de centro de custo/conta que falha na Senior nao derruba o dossie: a linha mostra so' o codigo", async () => {
  const d = await coletarComplemento(oc, fluxo(), async (sql) => {
    if (/FROM E044CCU|FROM E091PLF/.test(sql)) throw new Error("Senior recusou a consulta.");
    return linhas(sql, {});
  });
  const h = montarHtmlComplemento(d).itens;
  assert.match(h, /<td>190<\/td><td>68<\/td>/);
});

test("Grupo de empresas: fornecedor sem grupo = so' ele; com grupo = todos os cadastros do grupo (marketplace); sem CODFOR = nada", async () => {
  const consultar = async (sql: string) => {
    if (/FROM E420OCP/.test(sql)) return [{ CODFOR: sql.endsWith("= 1") ? "10" : sql.endsWith("= 2") ? "609066" : "" }];
    if (/SELECT CODGRE/.test(sql)) return [{ CODGRE: /= 609066/.test(sql) ? "2" : "0" }];
    if (/WHERE CODGRE = 2/.test(sql)) return [{ CODFOR: "617268" }, { CODFOR: "609066" }, { CODFOR: "712492" }];
    return [];
  };
  assert.deepEqual(await codigosDoGrupoDoFornecedor({ codFil: 1, numOcp: 1 }, consultar), [10]);
  assert.deepEqual(await codigosDoGrupoDoFornecedor({ codFil: 1, numOcp: 2 }, consultar), [609066, 617268, 712492]);
  assert.deepEqual(await codigosDoGrupoDoFornecedor({ codFil: 1, numOcp: 3 }, consultar), []);
});

test("Marcadores: troca no HTML do gerador; sem marcador (gerador desatualizado) da erro", () => {
  const html = `<style>a{}</style>${MARCADOR_OC}x${MARCADOR_ITENS}y${MARCADOR_HISTORICO}z${MARCADOR_DANFE}`;
  const out = aplicarComplemento(html, { oc: "OC!", itens: "ITENS!", historico: "HIST!", danfe: "DANFE!", css: ".c{}" });
  assert.equal(out, "<style>a{}.c{}</style>OC!xITENS!yHIST!zDANFE!");
  assert.throws(() => aplicarComplemento(`<style></style>${MARCADOR_OC}${MARCADOR_DANFE}`, { oc: "", itens: "", historico: "", danfe: "", css: "" }), /COMPLEMENTO_ITENS/);
});

test("Gerador do fluxo deixa os 4 marcadores e nao monta mais itens/rateio/historico por conta propria", async () => {
  const { readFile } = await import("node:fs/promises");
  const fonte = await readFile(new URL("../src/lib/dossie/nos/gerar-html-do-dossie.js", import.meta.url), "utf8");
  for (const m of [MARCADOR_OC, MARCADOR_ITENS, MARCADOR_HISTORICO, MARCADOR_DANFE]) assert.ok(fonte.includes(m), m);
  assert.doesNotMatch(fonte, /<h2>Produtos<\/h2>|<h2>Rateios<\/h2>|<h2>Histórico do Fornecedor<\/h2>/);
});

test("Titulo da OC e' buscado por numero E fornecedor (OC 16113: o titulo 39A1 existe em 6 fornecedores e o dossie trouxe 6 notas)", async () => {
  const { default: fluxo } = await import("../src/lib/dossie/fluxo.json");
  const corpo = (fluxo as any).nos["Coletar Títulos Financeiros"].body as string;
  assert.match(corpo, /NUMTIT=:NumTit AND CODFOR IN \(\{\{\$json\.codForGrupo\}\}\)/);
});

test("Parcelamento: le '2X' da condicao de pagamento e divide o valor da OC (achado OC 16678, 010 - 2X VAREJO)", () => {
  assert.equal(parcelamento("2X VAREJO", 15000), `Parcelado em 2x de ${moeda(7500)}`);
  assert.equal(parcelamento("02X", 300), `Parcelado em 2x de ${moeda(150)}`);
});

test("Parcelamento: nao mostra nada pra condicao a vista, sem 'X', ou 1 parcela so' -- nunca inventa parcela que o texto nao diz", () => {
  assert.equal(parcelamento("A VISTA", 15000), null);
  assert.equal(parcelamento("30/60/90", 15000), null);
  assert.equal(parcelamento("1X VAREJO", 15000), null);
  assert.equal(parcelamento(null, 15000), null);
  assert.equal(parcelamento("", 15000), null);
});

