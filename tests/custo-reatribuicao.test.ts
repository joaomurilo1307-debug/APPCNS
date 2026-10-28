import { test } from "node:test";
import assert from "node:assert/strict";
import { calcularCusto, chaveBaixa, type Baixa, type LinhaRateio } from "../src/lib/custos/motorCustoContrato";
import { centroReatribuido, REATRIBUICOES, type Reatribuicao } from "../src/lib/custos/reatribuicoes";

const rat = (o: Partial<LinhaRateio>): LinhaRateio => ({ numTit: "3A1", codFil: "1", codTpt: "NFS", codFor: "625456", seqMov: "2", ctaFin: "84", codCcu: "260", vlrRat: "9.500,00", mesAno: "01/01/2026", codTns: "90550", ...o });
const baixas = (...ls: Partial<LinhaRateio>[]): Map<string, Baixa> =>
  new Map(ls.map((l) => [chaveBaixa(l.numTit ?? "3A1", l.codFil ?? "1", l.codTpt ?? "NFS", l.codFor ?? "625456", l.seqMov ?? "2"), { tns: l.codTns ?? "90550", dataPagamento: "2026-01-07" }]));

test("a unica excecao hoje: o titulo 3A1 do Breno sai do 260 e vai para ADM ENGENHARIA, com motivo e data", () => {
  assert.equal(REATRIBUICOES.length, 1);
  const e = REATRIBUICOES[0];
  assert.deepEqual([e.numTit, e.codFor, e.codTpt, e.de, e.para, e.decididoEm], ["3A1", "625456", "NFS", "260", "102295", "2026-10-28"]);
  assert.ok(e.motivo.length > 20);
});

test("o custo do titulo vai para o centro novo; so' ele muda (item e detalhe), o valor e a conta ficam", () => {
  const breno = rat({});
  const outro = rat({ numTit: "3A1", codFor: "111", vlrRat: "50,00" }); // mesmo numero, outro fornecedor: nao e' afetado
  const { itens, detalhe } = calcularCusto([breno, outro], baixas(breno, outro));
  assert.deepEqual(itens.map((i) => [i.codccu, i.contaCodigo, i.valor]).sort(), [["102295", "84", 9500], ["260", "84", 50]]);
  assert.deepEqual(detalhe.map((d) => [d.codFor, d.codccu]).sort(), [["111", "260"], ["625456", "102295"]]);
});

test("so' vale enquanto o Senior tem o titulo no centro de origem; se o financeiro corrigir o rateio, a excecao se desliga", () => {
  assert.equal(centroReatribuido({ numTit: "3A1", codFor: "625456", codTpt: "NFS", codCcu: "260" }), "102295");
  assert.equal(centroReatribuido({ numTit: " 3A1 ", codFor: "625456 ", codTpt: "NFS", codCcu: "260" }), "102295", "espacos do Senior nao atrapalham");
  assert.equal(centroReatribuido({ numTit: "3A1", codFor: "625456", codTpt: "NFS", codCcu: "102295" }), null, "ja esta no centro certo no Senior");
  assert.equal(centroReatribuido({ numTit: "3A1", codFor: "625456", codTpt: "OUT", codCcu: "260" }), null, "outro tipo de titulo");
  const lista: Reatribuicao[] = [{ numTit: "9", codFor: "1", codTpt: "NFS", de: "13", para: "12", motivo: "teste", decididoEm: "2026-10-28" }];
  assert.equal(centroReatribuido({ numTit: "9", codFor: "1", codTpt: "NFS", codCcu: "13" }, lista), "12");
});

test("a regra de custo continua igual para tudo que nao esta na lista (conta fora do custo, antes do piso)", () => {
  const forada = rat({ numTit: "7", ctaFin: "162" });
  const { itens, descartadas } = calcularCusto([forada], baixas(forada));
  assert.equal(itens.length, 0);
  assert.equal(descartadas.foraDoCusto, 1);
});
