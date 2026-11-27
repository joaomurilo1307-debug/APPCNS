// npx tsx --test tests/avisos-aprovacao-remessa.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { sqlCriadoresOc, destinoDaOc, textoOcAprovada, textoRequisicaoAprovada, textoPagamentoRemessa } from "../src/lib/avisosAprovacaoERemessa";

const L = (NUMOCP: string, CODEMP: string, CODFIL: string, INTNET: string, NOMUSU = "fulano") => ({ NUMOCP, CODEMP, CODFIL, INTNET, NOMUSU });

test("SQL dos criadores: um IN so', com join por empresa", () => {
  const sql = sqlCriadoresOc(["15846", " 15846 ", "0016044"])!;
  assert.match(sql, /E420OCP\.NUMOCP IN \(15846,16044\)/);
  assert.match(sql, /E099USU\.CODEMP = E420OCP\.CODEMP AND E099USU\.CODUSU = E420OCP\.USUGER/);
});

test("SQL recusa valor sujo (injecao) e lista vazia", () => {
  assert.equal(sqlCriadoresOc([]), null);
  assert.equal(sqlCriadoresOc(["", "0", "1 OR 1=1", "1;DELETE"]), null);
  assert.doesNotMatch(sqlCriadoresOc(["10", "1 OR 1=1"])!, /OR 1=1/);
});

test("destino: acha o criador da OC na empresa/filial certa", () => {
  const linhas = [L("100", "1", "1", "Ana@Consominas.com.br", "ana"), L("100", "2", "1", "outro@x.com"), L("200", "1", "2", "bia@x.com")];
  assert.deepEqual(destinoDaOc(linhas, "100", 1, 1), { email: "ana@consominas.com.br", nome: "ana" });
  assert.equal(destinoDaOc(linhas, "200", undefined, "2")?.email, "bia@x.com");
});

test("destino: ambiguo (mesma OC em 2 empresas) ou sem e-mail -> null, nao chuta", () => {
  const linhas = [L("100", "1", "1", "ana@x.com"), L("100", "2", "1", "outro@x.com"), L("300", "1", "1", ""), L("400", "1", "1", "caixa-setor")];
  assert.equal(destinoDaOc(linhas, "100"), null);
  assert.equal(destinoDaOc(linhas, "300"), null);
  assert.equal(destinoDaOc(linhas, "400"), null);
  assert.equal(destinoDaOc(linhas, "999"), null);
});

test("textos: numero, fornecedor/produto e aprovador", () => {
  const oc = textoOcAprovada({ numero: 15846, fornecedor: "ACME LTDA", aprovadoPor: "Renata", nome: "Fulano" });
  assert.equal(oc.subject, "OC 15846 aprovada por Renata");
  assert.match(oc.text, /ordem de compra 15846 para o fornecedor ACME LTDA foi aprovada por Renata/);

  const rq = textoRequisicaoAprovada({ numero: 77, sequencia: 2, descricao: "PARAFUSO", quantidade: 1500.5, unidade: "UN", aprovadoPor: "Renata", nome: "F" });
  assert.match(rq.text, /requisição 77 \(item 2: PARAFUSO, 1\.500,5 UN\) foi aprovada por Renata/);

  const pg = textoPagamentoRemessa({
    numOcp: "15846", fornecedor: "ACME", nome: "F",
    titulos: [{ numTit: "1A", valor: 100, dataPagamento: new Date("2026-12-01T00:00:00Z") }, { numTit: "1B", valor: 50.25, dataPagamento: new Date("2026-12-01T00:00:00Z") }],
  });
  assert.match(pg.text, /Título 1A: R\$\s?100,00, pagamento programado para 01\/12\/2026/);
  assert.match(pg.text, /Total: R\$\s?150,25/);
  assert.match(textoOcAprovada({ numero: 1, fornecedor: "", aprovadoPor: "R", nome: "F" }).text, /fornecedor não informado/);
});
