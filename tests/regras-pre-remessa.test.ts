import { test } from "node:test";
import assert from "node:assert/strict";
import {
  acharPossivelDuplicidade,
  avaliarDataPagamento,
  avaliarValorDoBoleto,
  descreverDuplicidade,
  ehDiaUtil,
  feriadosBancarios,
  instanteBrasilia,
  motivoDiaNaoUtil,
  proximoDiaUtil,
  type TituloParaDuplicidade,
} from "../src/lib/pagamentos/regrasPreRemessa";

// Regras puras (sem banco): rodam com `tsx --test` sem .env de homologacao.

test("Calendario bancario 2026: feriados fixos e moveis, fim de semana e proximo dia util", () => {
  const f = feriadosBancarios(2026);
  assert.equal(f.get("2026-10-12"), "Nossa Senhora Aparecida");
  assert.equal(f.get("2026-04-03"), "Sexta-feira Santa"); // Pascoa 2026 = 05/04
  assert.equal(f.get("2026-06-04"), "Corpus Christi");
  assert.equal(f.get("2026-02-16"), "Carnaval");
  assert.equal(f.get("2026-02-17"), "Carnaval");
  assert.equal(f.get("2026-11-20"), "Consciência Negra");
  assert.equal(motivoDiaNaoUtil("2026-10-10"), "sábado");
  assert.equal(motivoDiaNaoUtil("2026-10-11"), "domingo");
  assert.equal(motivoDiaNaoUtil("2026-10-12"), "Nossa Senhora Aparecida");
  assert.equal(ehDiaUtil("2026-10-13"), true);
  assert.equal(proximoDiaUtil("2026-10-09"), "2026-10-09"); // sexta: ja e' util
  assert.equal(proximoDiaUtil("2026-10-10"), "2026-10-13"); // sab -> dom -> feriado seg -> ter
});

test("Instante em Brasilia: o servidor roda em UTC e virava o dia 3h antes", () => {
  assert.deepEqual(instanteBrasilia(new Date("2026-10-13T17:30:00Z")), { iso: "2026-10-13", hora: 14.5 });
  assert.deepEqual(instanteBrasilia(new Date("2026-10-13T02:00:00Z")), { iso: "2026-10-12", hora: 23 });
});

test("TED no mesmo dia so ate 15:00; data em dia sem expediente avisa o proximo dia util", () => {
  const depois = avaliarDataPagamento({ forma: "41", dataPagamento: "2026-10-13", hoje: "2026-10-13", hora: 15.5 });
  assert.equal(depois.length, 1);
  assert.equal(depois[0].gravidade, "erro");
  assert.match(depois[0].mensagem, /15:00/);
  assert.deepEqual(avaliarDataPagamento({ forma: "41", dataPagamento: "2026-10-13", hoje: "2026-10-13", hora: 14.9 }), []);
  assert.deepEqual(avaliarDataPagamento({ forma: "30", dataPagamento: "2026-10-13", hoje: "2026-10-13", hora: 18 }), []); // boleto nao tem essa regra
  const sabado = avaliarDataPagamento({ forma: "30", dataPagamento: "2026-10-10", hoje: "2026-10-08", hora: 10 });
  assert.equal(sabado.length, 1);
  assert.equal(sabado[0].gravidade, "aviso");
  assert.match(sabado[0].mensagem, /sábado/);
  assert.match(sabado[0].mensagem, /13\/10/); // 12/10 e' feriado
  assert.deepEqual(avaliarDataPagamento({ forma: "30", dataPagamento: "", hoje: "2026-10-08", hora: 10 }), []);
});

test("Valor do item diferente do boleto ainda no prazo e' ERRO (casos reais de 13/10/2026)", () => {
  // 007989: titulo/OC R$ 437,55, boleto gravado de R$ 626,09, vence hoje
  const a = avaliarValorDoBoleto({ valor: 437.55, nominal: 626.09, vencimentoIso: "2026-10-13", dataPagamento: "2026-10-13" })!;
  assert.equal(a.gravidade, "erro");
  assert.match(a.mensagem, /faltam R\$\s*188,54/);
  assert.match(a.mensagem, /ainda no prazo/);
  // 006920_04: boleto R$ 6.098,06 vence sabado 10/10; pagamento terca 13/10 (12/10 e' feriado) -> ainda no prazo, sobram 5 centavos
  const b = avaliarValorDoBoleto({ valor: 6098.11, nominal: 6098.06, vencimentoIso: "2026-10-10", dataPagamento: "2026-10-13" })!;
  assert.equal(b.gravidade, "erro");
  assert.match(b.mensagem, /sobram R\$\s*0,05/);
  // 243042=1: boleto R$ 1.150 cobre NFS + fatura, o titulo e' so' R$ 805
  const c = avaliarValorDoBoleto({ valor: 805, nominal: 1150, vencimentoIso: "2026-10-13", dataPagamento: "2026-10-13" })!;
  assert.equal(c.gravidade, "erro");
});

test("Boleto vencido e' AVISO (o banco recalcula juros/multa); valor igual e no prazo passa limpo", () => {
  // o mesmo boleto do Bradesco pago na quarta 14/10: ja venceu de verdade
  const igual = avaliarValorDoBoleto({ valor: 6098.06, nominal: 6098.06, vencimentoIso: "2026-10-10", dataPagamento: "2026-10-14" })!;
  assert.equal(igual.gravidade, "aviso");
  assert.match(igual.mensagem, /VENCIDO em 10\/10/);
  const diferente = avaliarValorDoBoleto({ valor: 6200, nominal: 6098.06, vencimentoIso: "2026-10-10", dataPagamento: "2026-10-14" })!;
  assert.equal(diferente.gravidade, "aviso");
  assert.equal(avaliarValorDoBoleto({ valor: 100, nominal: 100, vencimentoIso: "2026-10-13", dataPagamento: "2026-10-13" }), null);
  assert.equal(avaliarValorDoBoleto({ valor: 100.005, nominal: 100, vencimentoIso: null, dataPagamento: "2026-10-13" }), null); // tolerancia de 1 centavo
  assert.equal(avaliarValorDoBoleto({ valor: 50, nominal: 0, vencimentoIso: null, dataPagamento: "2026-10-13" }), null); // boleto de valor aberto
});

const titulo = (id: string, numTit: string, codFor: string, valor: number, emissao: string, extra: Partial<TituloParaDuplicidade> = {}): TituloParaDuplicidade => ({
  id, numTit, codFor, valorOriginal: valor, dataEmissao: new Date(`${emissao}T00:00:00Z`), ...extra,
});

test("Duplicidade forte: mesmo fornecedor, valor e emissao; parcelas e recorrencia mensal ficam de fora", () => {
  const novo = titulo("a", "14914$01", "712192", 83, "2026-08-19");
  const pago = titulo("b", "47822$01", "712192", 83, "2026-08-19", { pago: true, situacao: "LQ", dataPagamento: new Date("2026-09-02T00:00:00Z") });
  const achados = acharPossivelDuplicidade(novo, [pago]);
  assert.equal(achados.length, 1);
  assert.match(descreverDuplicidade(achados[0]), /47822\$01.*já pago em 02\/09\/2026/);

  assert.equal(acharPossivelDuplicidade(titulo("a", "7404$01", "1", 100, "2026-08-19"), [titulo("b", "7404$02", "1", 100, "2026-08-19")]).length, 0, "parcelas da mesma NF");
  assert.equal(acharPossivelDuplicidade(titulo("a", "006920_04", "1", 6098.11, "2026-07-08"), [titulo("b", "006920_05", "1", 6098.11, "2026-07-08")]).length, 0, "parcelas _04/_05");
  assert.equal(acharPossivelDuplicidade(titulo("a", "007989", "1", 437.55, "2026-10-09"), [titulo("b", "007751", "1", 437.55, "2026-09-08")]).length, 0, "mensalidade: emissao a ~30 dias");
  assert.equal(acharPossivelDuplicidade(novo, [titulo("c", "47822$01", "999", 83, "2026-08-19")]).length, 0, "outro fornecedor");
  assert.equal(acharPossivelDuplicidade(novo, [titulo("c", "47822$01", "712192", 84, "2026-08-19")]).length, 0, "valor diferente");
  assert.equal(acharPossivelDuplicidade(novo, [titulo("a", "OUTRO", "712192", 83, "2026-08-19")]).length, 0, "o proprio titulo");
});
