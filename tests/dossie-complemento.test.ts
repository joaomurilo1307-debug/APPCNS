// Complemento do dossie (dados completos da OC, reembolso, sem nota, DANFE). Sem banco nem Senior: a consulta e' simulada.
import assert from "node:assert/strict";
import test from "node:test";
import { MARCADOR_DANFE, MARCADOR_OC, aplicarComplemento, chavesDasNotas, codigosDoGrupoDoFornecedor, coletarComplemento, motivoReembolso, montarHtmlComplemento } from "../src/lib/dossie/complemento";
import { cnpjCpf } from "../src/lib/dossie/formatar";

const CHAVE = "15260902464837000117550010000630861345857990";
const linhas = (sql: string, c: { contas?: string[]; semNf?: boolean; semOc?: boolean; usuReemb?: string }) => {
  if (/FROM E420OCP/.test(sql)) return c.semOc ? [] : [{ OBSOCP: "Compra de EPI", CODFOR: "605160", CODCPG: "001", CODFPG: "18", USU_REEMB: c.usuReemb ?? "", VLRLIQ: "0", VLRORI: "899" }];
  if (/FROM E095FOR/.test(sql)) return [{ CODFOR: "605160", NOMFOR: "MERCANTIL OLIVEIRA", CGCCPF: "2464837000117", INSEST: "1", ENDFOR: "RIO MARMORE", BAIFOR: "VILA", CIDFOR: "ORIXIMINA", SIGUFS: "PA", CEPFOR: "68275000" }];
  if (/FROM E028CPG/.test(sql)) return [{ DESCPG: "A VISTA" }];
  if (/FROM E420RAT/.test(sql)) return (c.contas ?? ["68"]).map((CTAFIN) => ({ CTAFIN }));
  if (/FROM E070FIL/.test(sql)) return [{ NOMFIL: "CONSOMINAS", NUMCGC: "7080673000148", ENDENT: "RUA CAMOES, 126", CIDFIL: "BH", SIGUFS: "MG" }];
  if (/FROM E440NFC/.test(sql)) return c.semNf ? [] : [{ NUMNFC: "63086", CODSNF: "NFE", CHVNEL: CHAVE, VLRLIQ: "899", VLRICM: "170,81", OBSNFC: "dados adicionais da nota", CODTRA: "0" }];
  if (/FROM E440IPC/.test(sql)) return [{ CODPRO: "888236", CPLIPC: "PERNEIRA", QTDREC: "10", PREUNI: "89,9", VLRBRU: "899" }];
  return []; // E440ISC
};
const fluxo = (comNota = true) => ({
  produtos: [{ produto: { codigo: "888236", descricao: "PERNEIRA" }, unidade: "UN", quantidades: { pedida: 10 }, valores: { unitario: 89.9, liquido: 0, original: 899 } }],
  servicos: [],
  documentosFiscais: comNota ? [{ filial: 1, fornecedor: 605160, numero: 63086, serie: "NFE" }] : [],
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

test("Caminho feliz: dados da OC + DANFE com chave, sem aviso de 'sem nota' nem de reembolso; valor original (OC liquidada)", async () => {
  const d = await coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, {}));
  const h = montarHtmlComplemento(d);
  assert.match(h.oc, /Dados da Ordem de Compra/);
  assert.match(h.oc, /02\.464\.837\/0001-17/);
  assert.match(h.oc, /RIO MARMORE/);
  assert.match(h.oc, /001 - A VISTA/);
  assert.match(h.oc, /Compra de EPI/);
  assert.match(h.oc, /R\$\s899,00/); // VLRLIQ = 0 na OC liquidada: mostra o original
  assert.doesNotMatch(h.oc, /SEM NOTA FISCAL|ITEM REEMBOLSÁVEL/);
  assert.match(h.danfe, /DANFE/);
  assert.match(h.danfe, /1526 0902 4648/);
  assert.match(h.danfe, /dados adicionais da nota/);
});

test("Reembolsavel: aviso + itens com valor (usa o original quando o saldo e' 0) + CNPJ do fornecedor", async () => {
  const d = await coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, { contas: ["68", "181"] }));
  const h = montarHtmlComplemento(d).oc;
  assert.match(h, /ITEM REEMBOLSÁVEL/);
  assert.match(h, /conta financeira 181/);
  assert.match(h, /PERNEIRA/);
  assert.match(h, /R\$\s899,00/);
  assert.match(h, /02\.464\.837\/0001-17/);
});

test("Sem nota fiscal: aviso no lugar e nenhuma DANFE (nota citada pelo titulo mas ausente do ERP tambem)", async () => {
  for (const [f, c] of [[fluxo(false), {}], [fluxo(true), { semNf: true }]] as const) {
    const h = montarHtmlComplemento(await coletarComplemento(oc, f, async (sql) => linhas(sql, c)));
    assert.match(h.oc, /SEM NOTA FISCAL/);
    assert.equal(h.danfe, "");
  }
});

test("Falha: Senior fora do ar ou OC inexistente derruba a coleta (o dossie vai para ERRO e e' refeito), nao sai PDF incompleto", async () => {
  await assert.rejects(coletarComplemento(oc, fluxo(), async () => { throw new Error("Senior recusou a consulta."); }), /Senior recusou/);
  await assert.rejects(coletarComplemento(oc, fluxo(), async (sql) => linhas(sql, { semOc: true })), /não encontrada/);
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
  const html = `<style>a{}</style>${MARCADOR_OC}x${MARCADOR_DANFE}`;
  const out = aplicarComplemento(html, { oc: "OC!", danfe: "DANFE!", css: ".c{}" });
  assert.equal(out, "<style>a{}.c{}</style>OC!xDANFE!");
  assert.throws(() => aplicarComplemento("<style></style>sem marcador", { oc: "", danfe: "", css: "" }), /marcadores/);
});

test("Titulo da OC e' buscado por numero E fornecedor (OC 16113: o titulo 39A1 existe em 6 fornecedores e o dossie trouxe 6 notas)", async () => {
  const { default: fluxo } = await import("../src/lib/dossie/fluxo.json");
  const corpo = (fluxo as any).nos["Coletar Títulos Financeiros"].body as string;
  assert.match(corpo, /NUMTIT=:NumTit AND CODFOR IN \(\{\{\$json\.codForGrupo\}\}\)/);
});
