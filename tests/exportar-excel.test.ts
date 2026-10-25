import test from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { abaDeLinhas, lerData, montarWorkbook, nomeDeAba, nomeDeArquivo } from "../src/lib/exportarExcel";

test("nome de aba: ate 31 letras, sem caracteres proibidos e sem repetir", () => {
  const usados = new Set<string>();
  assert.equal(nomeDeAba("Custo/Medição: [2026]?", usados), "Custo Medição 2026");
  assert.equal(nomeDeAba("custo medição 2026", usados), "custo medição 2026 2");
  assert.equal(nomeDeAba("x".repeat(40), usados).length, 31);
  assert.equal(nomeDeAba("   ", usados), "Dados");
});

test("lerData aceita dd/mm/aaaa e aaaa-mm-dd e recusa o resto", () => {
  assert.equal(lerData("15/10/2026")?.toISOString().slice(0, 10), "2026-10-15");
  assert.equal(lerData("2026-10-15T00:00:00.000Z")?.toISOString().slice(0, 10), "2026-10-15");
  assert.equal(lerData("amanha"), null);
  assert.equal(lerData(42), null);
});

test("workbook: abas, cabecalho, numeros e datas de verdade, formato e filtro", () => {
  const wb = montarWorkbook([
    {
      nome: "Contratos", observacao: "Teste",
      colunas: [{ titulo: "Contrato", largura: 30 }, { titulo: "Valor", tipo: "moeda" }, { titulo: "Início", tipo: "data" }, { titulo: "Avanço", tipo: "percentual" }],
      linhas: [["MRN CT 3748", "1.234,56", "15/10/2026", 0.5], ["AGA CT 15140", 99.9, "2026-10-20", null]],
    },
    { nome: "Vazia", colunas: [{ titulo: "A" }], linhas: [] },
  ]);
  assert.deepEqual(wb.SheetNames, ["Contratos", "Vazia"]);
  const ws = wb.Sheets["Contratos"];
  // linha 1 = observacao, linha 2 = vazia, linha 3 = cabecalho, a partir da 4 os dados
  assert.equal(ws["A3"].v, "Contrato");
  assert.equal(ws["B4"].t, "n");
  assert.equal(ws["B4"].v, 1234.56, "texto em pt-BR vira numero");
  assert.equal(ws["B4"].z, "#,##0.00");
  assert.equal(ws["C4"].t, "d");
  assert.equal(ws["C4"].z, "dd/mm/yyyy");
  assert.equal(ws["D4"].z, "0.0%");
  assert.equal(ws["B5"].v, 99.9);
  assert.equal(ws["D5"], undefined, "celula vazia fica vazia");
  assert.equal(ws["!cols"]![0].wch, 30);
  assert.equal(ws["!autofilter"]!.ref, "A3:D5");
  assert.equal(wb.Sheets["Vazia"]["!autofilter"], undefined);
});

test("workbook sobrevive a escrita e leitura do arquivo", () => {
  const wb = montarWorkbook([{ nome: "A", colunas: [{ titulo: "Nome" }, { titulo: "Qtd", tipo: "inteiro" }], linhas: [["a", 1], ["b", 2]] }]);
  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  const volta = XLSX.read(buf, { type: "buffer" });
  assert.deepEqual(XLSX.utils.sheet_to_json(volta.Sheets["A"]), [{ Nome: "a", Qtd: 1 }, { Nome: "b", Qtd: 2 }]);
});

test("nome de arquivo: sem acento nem simbolo e com a data", () => {
  assert.match(nomeDeArquivo("Gantt geral — Projetos/2026"), /^Gantt_geral_Projetos_2026_\d{4}-\d{2}-\d{2}\.xlsx$/);
});

test("abaDeLinhas deduz o tipo: numero, inteiro, data; codigo e texto continuam texto", () => {
  const aba = abaDeLinhas("Custo", [
    ["Contrato", "CCU", "Valor", "Qtd", "Data"],
    ["MRN CT 3748", "00280", 1234.5, 3, "15/10/2026"],
    ["AGA CT 15140", "00070", 99, 2, "20/10/2026"],
  ]);
  assert.deepEqual(aba.colunas.map((c) => c.tipo), ["texto", "texto", "numero", "inteiro", "data"]);
  assert.equal(aba.linhas.length, 2);
  const wb = montarWorkbook([aba]);
  assert.equal(wb.Sheets["Custo"]["B2"].v, "00280", "zero a esquerda preservado");
  assert.equal(wb.Sheets["Custo"]["C2"].t, "n");
  assert.equal(wb.Sheets["Custo"]["E2"].t, "d");
});

test("abaDeLinhas com coluna vazia ou sem linhas nao quebra", () => {
  const aba = abaDeLinhas("Vazia", [["A", "B"]]);
  assert.deepEqual(aba.colunas.map((c) => c.tipo), ["texto", "texto"]);
  assert.equal(montarWorkbook([aba]).Sheets["Vazia"]["!autofilter"], undefined);
  assert.equal(abaDeLinhas("Nada", []).colunas.length, 0);
});

test("linha de TOTAL fica depois de uma linha em branco e fora do filtro", () => {
  const aba = abaDeLinhas("Quadro", [["Conta", "Valor"], ["A", 10], ["B", 5.5], ["TOTAL", 15.5]], undefined, true);
  assert.equal(aba.linhas.length, 2);
  assert.deepEqual(aba.rodape, ["TOTAL", 15.5]);
  assert.deepEqual(aba.colunas.map((c) => c.tipo), ["texto", "numero"], "o total nao entra na deducao do tipo");
  const ws = montarWorkbook([aba]).Sheets["Quadro"];
  assert.equal(ws["A1"].v, "Conta");
  assert.equal(ws["A4"], undefined, "linha em branco");
  assert.equal(ws["A5"].v, "TOTAL");
  assert.equal(ws["B5"].z, "#,##0.00");
  assert.equal(ws["!autofilter"]!.ref, "A1:B3", "filtro so' nos dados");
});

test("coluna com % no titulo e fracoes de 0 a 1 vira percentual; sem % continua numero", () => {
  const aba = abaDeLinhas("P", [["Conta", "% do centro de custo", "Fator"], ["A", 0.25, 0.5], ["B", 0.75, 1.5]]);
  assert.deepEqual(aba.colunas.map((c) => c.tipo), ["texto", "percentual", "numero"]);
  assert.equal(montarWorkbook([aba]).Sheets["P"]["B2"].z, "0.0%");
});
