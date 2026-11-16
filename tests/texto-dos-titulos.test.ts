import { test } from "node:test";
import assert from "node:assert/strict";
import { chaveDoTexto, montarConsultasDeTexto, textosDoLote } from "../src/lib/senior/textoDosTitulos";

const c = (numTit: string, codFor = "713337", tipo = "NFC") => ({ numTit, codFor, tipo });

test("montarConsultasDeTexto: lotes de 40, numeros entre aspas, so' fornecedor numerico, sem repetir", () => {
  const chaves = Array.from({ length: 85 }, (_, i) => c(`T${i}`, "100"));
  const lotes = montarConsultasDeTexto([...chaves, c("T0", "100"), c("X", "abc"), c("", "100")]);
  assert.deepEqual(lotes.map((l) => l.chaves.length), [40, 40, 5]);
  assert.match(lotes[0].sql, /^SELECT NUMTIT, CODFIL, CODTPT, CODFOR, OBSTCP FROM E501TCP WHERE CODEMP=1 AND NUMTIT IN \('T0','T1'/);
  assert.match(lotes[0].sql, /AND CODFOR IN \(100\)$/);
});

test("montarConsultasDeTexto: aspas no numero do titulo nao quebram a consulta", () => {
  const [l] = montarConsultasDeTexto([c("A'B")]);
  assert.ok(l.sql.includes("'A''B'"));
});

test("montarConsultasDeTexto: sem chaves validas nao monta consulta", () => {
  assert.deepEqual(montarConsultasDeTexto([]), []);
  assert.deepEqual(montarConsultasDeTexto([c("X", "abc")]), []);
});

test("textosDoLote: texto limpo de quebras de linha; titulo que o Senior nao devolveu vai com texto vazio (nao consulta de novo)", () => {
  const r = textosDoLote([c("147$01"), c("148$01"), c("999")], [
    { NUMTIT: "147$01", CODFIL: "1", CODTPT: "NFC", CODFOR: "713337", OBSTCP: "VALOR BRUTO:R$ 456,00 -\r\n PAGAMENTO REFERENTE A COMPRA DE MATERIAIS   " },
    { NUMTIT: "148$01", CODFIL: "1", CODTPT: "NFC", CODFOR: "713337", OBSTCP: "" },
  ]);
  assert.equal(r[0].texto, "VALOR BRUTO:R$ 456,00 - PAGAMENTO REFERENTE A COMPRA DE MATERIAIS");
  assert.equal(r[1].texto, "");
  assert.equal(r[2].texto, "");
  assert.equal(r.length, 3);
});

test("textosDoLote: mesmo titulo em duas filiais/linhas fica com o texto que nao e' vazio", () => {
  const r = textosDoLote([c("A")], [
    { NUMTIT: "A", CODTPT: "NFC", CODFOR: "713337", OBSTCP: "" },
    { NUMTIT: "A", CODTPT: "NFC", CODFOR: "713337", OBSTCP: "com texto" },
  ]);
  assert.equal(r[0].texto, "com texto");
});

test("chaveDoTexto distingue o tipo do titulo (NFS x ADT com o mesmo numero)", () => {
  assert.notEqual(chaveDoTexto(c("955", "1", "NFS")), chaveDoTexto(c("955", "1", "ADT")));
});
