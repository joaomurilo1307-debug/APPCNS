import { test } from "node:test";
import assert from "node:assert/strict";
import { conciliar, type DocConc, type ItemConc } from "../src/lib/medicao/conciliacao";
import { origemNoSenior } from "../src/lib/medicao/origem";

const item = (numPed: string, competencia: string, valor: number, extra: Partial<ItemConc> = {}): ItemConc => ({ numPed, competencia, origem: "BOLETIM", boletim: "BM42", situacao: "ABERTO", qtd: 1, valor, dataEmissao: "2026-10-15", ...extra });
const doc = (numero: string, competencia: string, valor: number, extra: Partial<DocConc> = {}): DocConc => ({ chave: `NF|2|A24|${numero}|210`, tipo: "NF", numero, filial: "2", serie: "A24", dataEmissao: "2026-10-16", valor, valorLiquido: valor, valorDoc: valor, codccu: "210", competencia, origem: "EMISSAO", pedidos: null, situacao: "AUTORIZADA", ...extra });

test("origem no Senior: MRN 3686 set/2026 (NF 295 direta na filial 2; pedidos 555 e 556 abertos com 1 item cada)", () => {
  const itens = [item("555", "2026-09", 132.92), item("556", "2026-09", 1342.5)];
  const c = conciliar(itens, [doc("295", "2026-09", 575029.36)], [], "2026-09", "2026-09");
  const o = origemNoSenior(c, "2026-09")!;
  assert.ok(o);
  assert.equal(o.notas.length, 1);
  assert.equal(o.notas[0].titulo, "NF 295");
  assert.match(o.notas[0].texto, /filial 2, série A24, emitida em 16\/10\/2026/);
  assert.match(o.notas[0].texto, /sem pedido de venda ligado/);
  assert.equal(o.pedidos.length, 2);
  assert.match(o.pedidos.map((p) => p.texto).join(" "), /boletim BM42, aberto em 15\/10\/2026, 1 item/);
  assert.match(o.pedidos.map((p) => p.texto).join(" "), /sem nota ligada/);
  assert.doesNotMatch(o.pedidos.map((p) => p.texto).join(" "), /sem nota fiscal emitida/); // a nota do mes existe: so' nao esta ligada ao pedido
  assert.match(o.resumo, /Notas fiscais sem pedido ligado: .*575\.029,36\. Linhas dos pedidos do mês no Senior: .*1\.475,42\. Faltam .*573\.553,94 de medição por lançar/);
  assert.match(o.resumo, /as notas contam na receita/);
});

test("origem no Senior: nota sem nenhum pedido do mes", () => {
  const c = conciliar([], [doc("287", "2026-08", 526047.3)], [], "2026-08", "2026-08");
  const o = origemNoSenior(c, "2026-08")!;
  assert.match(o.resumo, /Não há pedido de medição deste mês no Senior/);
  assert.equal(o.pedidos.length, 0);
});

test("origem no Senior: pedido sem nota fiscal", () => {
  const c = conciliar([item("554", "2026-09", 3401.97, { boletim: "BM2" })], [], [], "2026-09", "2026-09");
  const o = origemNoSenior(c, "2026-09")!;
  assert.equal(o.notas.length, 0);
  assert.match(o.pedidos[0].texto, /sem nota fiscal emitida no Senior/);
  assert.match(o.resumo, /3\.401,97/);
  assert.match(o.resumo, /conta na receita, marcado como sem nota/);
});

test("origem no Senior: mes que fecha e mes fora do periodo nao tem quadro", () => {
  const c = conciliar([item("10", "2026-07", 1000)], [doc("1", "2026-07", 1000)], [], "2026-07", "2026-07");
  assert.equal(origemNoSenior(c, "2026-07"), null);
  assert.equal(origemNoSenior(c, "2025-01"), null);
});

test("origem no Senior: nota duplicada nao aparece como nota sem pedido", () => {
  const c = conciliar([item("555", "2026-09", 100)], [doc("295", "2026-09", 5000), doc("296", "2026-09", 5000, { duplicadaDe: "295" })], [], "2026-09", "2026-09");
  const o = origemNoSenior(c, "2026-09")!;
  assert.equal(o.notas.filter((n) => n.titulo === "NF 296").length, 0);
});

test("origem no Senior: nota acima do pedido (AGA QZ: NF 116 R$ 18.000 acima do pedido 536) nao diz que falta lancar medicao", () => {
  const itens = [item("536", "2026-09", 91410.83, { boletim: "BM12" })];
  const c = conciliar(itens, [doc("116", "2026-09", 109410.83, { filial: "1", serie: "A26", chave: "NF|1|A26|116|102195" })], [], "2026-09", "2026-09");
  const o = origemNoSenior(c, "2026-09")!;
  assert.match(o.resumo, /A nota está .*18\.000,00 acima do pedido/);
  assert.doesNotMatch(o.resumo, /por lançar/);
  assert.doesNotMatch(o.notas[0].texto, /filial/); // filial 1 nao precisa ser dita
});
