import { test } from "node:test";
import assert from "node:assert/strict";
import { criarMotorVinculo, type OcParaVinculo, type TituloParaVinculo } from "../src/lib/vinculoOcTitulo";

const oc = (numOcp: string, fornecedorCodigo = "10"): OcParaVinculo => ({
  numOcp, codFil: "1", fornecedorCodigo, fornecedorNome: "FORN", valor: 100, dataEmissao: new Date("2026-10-01"),
  situacaoAtual: "APR", usuNumTit: null, usuNumNfc: null, codccu: null, contratoNome: null, temRateio: false, previsaoPagamento: null,
});
const titulo = (extra: Partial<TituloParaVinculo> = {}): TituloParaVinculo => ({
  numTit: "T1", codFil: "1", codFor: "10", fornecedorNome: "FORN", tipo: "NFC", numNfc: null,
  valorOriginal: 100, dataEmissao: new Date("2026-10-01"), vencimentoProgramado: null, ...extra,
});
const v = (origem: string, chave: string, numOcp: string, codFor = "10") => ({ origem, codFil: "1", codFor, chave, numOcp });

test("vincula pela OC gravada na NF do titulo", () => {
  const r = criarMotorVinculo([oc("500")], [v("NF", "8313", "500")]).ocRelacionadaDe(titulo({ numNfc: "8313" }));
  assert.equal(r.ocRelacionada?.numOcp, "500");
});

test("vincula pelo USU_NUMOCP do titulo", () => {
  const r = criarMotorVinculo([oc("501")], [v("TITULO", "T1", "501")]).ocRelacionadaDe(titulo());
  assert.equal(r.ocRelacionada?.numOcp, "501");
});

test("sem NF nem USU_NUMOCP: Sem OC, mesmo com USU_NUMTIT, fornecedor, valor e data batendo", () => {
  const o = { ...oc("502"), usuNumTit: "T1", usuNumNfc: "8313" };
  const r = criarMotorVinculo([o], []).ocRelacionadaDe(titulo({ numNfc: "8313" }));
  assert.equal(r.ocRelacionada, null);
  assert.equal(r.ocEsperada, true);
});

test("NF ligada a duas OCs: nao escolhe nenhuma", () => {
  const r = criarMotorVinculo([oc("500"), oc("503")], [v("NF", "8313", "500"), v("NF", "8313", "503")]).ocRelacionadaDe(titulo({ numNfc: "8313" }));
  assert.equal(r.ocRelacionada, null);
  assert.match(r.motivoSemOC ?? "", /2 OCs/);
});

test("OC do vinculo nao sincronizada: explica e nao vincula", () => {
  const r = criarMotorVinculo([], [v("NF", "8313", "999")]).ocRelacionadaDe(titulo({ numNfc: "8313" }));
  assert.equal(r.ocRelacionada, null);
  assert.match(r.motivoSemOC ?? "", /999/);
});

test("NF de outro fornecedor ou filial nao casa; USU_NUMOCP com fornecedor diferente da OC e' conflito", () => {
  const m = criarMotorVinculo([oc("500", "77")], [v("NF", "8313", "500", "77"), v("TITULO", "T1", "500")]);
  assert.equal(m.ocRelacionadaDe(titulo({ numNfc: "8313" })).ocRelacionada, null); // vinculo e' do fornecedor 77, titulo e' do 10
  const conflito = m.ocRelacionadaDe(titulo());
  assert.equal(conflito.ocRelacionada, null);
  assert.match(conflito.motivoSemOC ?? "", /fornecedor/);
});

test("PRV nunca ganha OC", () => {
  const r = criarMotorVinculo([oc("501")], [v("TITULO", "T1", "501")]).ocRelacionadaDe(titulo({ tipo: "PRV" }));
  assert.equal(r.ocRelacionada, null);
  assert.equal(r.ocEsperada, false);
});
