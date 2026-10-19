import { test } from "node:test";
import assert from "node:assert/strict";
import { centrosDoTitulo, repartirValor } from "../src/lib/contratos/centrosDoTitulo";
import { linhasDoRateioDosTitulos, chaveDoTitulo } from "../src/lib/contratos/rateioTitulos";
import { itemDaOc, itemDoTitulo, montarAoVivo, SEM_LINHA, type ItemAoVivo } from "../src/lib/contratos/aoVivo";
import { linhasDaOc, codigoDaContaDaOc } from "../src/lib/contratos/aoVivoServidor";
import type { TituloComCentro } from "../src/lib/contratos/titulosPrevistos";

// ---------------------------------------------------------------- a que centro de custo pertence o titulo
test("centros: rateio do Senior manda; reparte pela proporcao", () => {
  const r = centrosDoTitulo({ codccuTitulo: "999", rateio: [{ codccu: "10", ctaFin: "5", valor: 300 }, { codccu: "20", ctaFin: "5", valor: 100 }], oc: null });
  assert.equal(r.linhas.length, 2);
  assert.deepEqual(r.linhas.map((l) => [l.ccu, l.proporcao, l.origem]), [["10", 0.75, "rateio"], ["20", 0.25, "rateio"]]);
});

test("centros: sem rateio usa o CC do titulo; sem ele usa o da OC; OC rateada nao e atribuida", () => {
  assert.deepEqual(centrosDoTitulo({ codccuTitulo: "7", rateio: [], oc: { codccu: "8", temRateio: false } }).linhas.map((l) => [l.ccu, l.origem]), [["7", "titulo"]]);
  assert.deepEqual(centrosDoTitulo({ codccuTitulo: null, rateio: [], oc: { codccu: "8", temRateio: false } }).linhas.map((l) => [l.ccu, l.origem]), [["8", "oc"]]);
  const rateada = centrosDoTitulo({ codccuTitulo: null, rateio: [], oc: { codccu: "8", temRateio: true } });
  assert.equal(rateada.linhas.length, 0);
  assert.equal(rateada.semCentro, "oc-rateada");
  assert.deepEqual(centrosDoTitulo({ codccuTitulo: null, rateio: [], oc: null }), { linhas: [], semCentro: null });
});

test("centros: estorno (valor negativo) e linha zerada nao entram na proporcao", () => {
  const r = centrosDoTitulo({ codccuTitulo: null, rateio: [{ codccu: "10", ctaFin: "5", valor: 100 }, { codccu: "20", ctaFin: "5", valor: -40 }, { codccu: "30", ctaFin: "5", valor: 0 }], oc: null });
  assert.deepEqual(r.linhas.map((l) => l.ccu), ["10"]);
  assert.equal(r.linhas[0].proporcao, 1);
});

test("centros: duas linhas de entrada do mesmo CC e conta somam numa so", () => {
  const r = centrosDoTitulo({ codccuTitulo: null, rateio: [{ codccu: "10", ctaFin: "5", valor: 100 }, { codccu: "10", ctaFin: "5", valor: 100 }], oc: null });
  assert.equal(r.linhas.length, 1);
  assert.equal(r.linhas[0].proporcao, 1);
});

test("repartirValor nao perde nem cria centavo", () => {
  const partes = repartirValor(100, [1 / 3, 1 / 3, 1 / 3]);
  assert.equal(Math.round(partes.reduce((s, x) => s + x, 0) * 100), 10000);
  assert.deepEqual(repartirValor(10, [1]), [10]);
  assert.deepEqual(repartirValor(10, []), []);
});

// ---------------------------------------------------------------- rateio guardado
test("rateio dos titulos: so' entrada/previsao, so' de titulo conhecido, sem valor zero", () => {
  const base = { numTit: "A1", codFil: "1", codTpt: "PRV", codFor: "9", seqMov: "1", ctaFin: "55", codCcu: "102315", vlrRat: "1.234,50", mesAno: "01/11/2026", codTns: "90503" };
  const conhecidos = new Set([chaveDoTitulo({ numTit: "A1", codFil: "1", codTpt: "PRV", codFor: "9" })]);
  const l = linhasDoRateioDosTitulos([base, { ...base, codTns: "90550" }, { ...base, numTit: "ZZ" }, { ...base, vlrRat: "0" }], conhecidos);
  assert.equal(l.length, 1);
  assert.equal(l[0].valor, 1234.5);
  assert.equal(l[0].codccu, "102315");
  assert.equal(l[0].mesAno?.toISOString().slice(0, 10), "2026-11-01");
});

// ---------------------------------------------------------------- OC
test("codigo da conta da OC: numero no comeco ou nome conhecido", () => {
  assert.equal(codigoDaContaDaOc("1234 - Material"), "1234");
  assert.equal(codigoDaContaDaOc(""), null);
  assert.equal(codigoDaContaDaOc(undefined), null);
});

test("linhas da OC: um CC, rateada e ilegivel", () => {
  assert.deepEqual(linhasDaOc({ codccu: "10", temRateio: false, valor: 500, rateioDetalhe: null }), [{ ccu: "10", ctaFin: null, valor: 500 }]);
  const det = JSON.stringify([{ codccu: "10", contaFinanceira: "77", valor: 300 }, { codccu: "20", contaFinanceira: "77", perc: 40 }]);
  assert.deepEqual(linhasDaOc({ codccu: "10", temRateio: true, valor: 500, rateioDetalhe: det }), [{ ccu: "10", ctaFin: "77", valor: 300 }, { ccu: "20", ctaFin: "77", valor: 200 }]);
  assert.equal(linhasDaOc({ codccu: "10", temRateio: true, valor: 500, rateioDetalhe: "isto nao e json" }), "ilegivel");
  assert.deepEqual(linhasDaOc({ codccu: null, temRateio: false, valor: 500, rateioDetalhe: null }), []);
});

// ---------------------------------------------------------------- feed "ao vivo"
const hoje = "2026-10-19";
const nome = (c: string) => (c === "5" ? "Combustível" : c === "6" ? "Aluguel" : null);
const tit = (o: Partial<TituloComCentro>): TituloComCentro => ({
  id: "t1", numTit: "100", codFil: "1", codFor: "9", tipo: "NFS", fornecedorNome: "FORN", descricao: null, numOcp: null, numNfc: null, pago: false, dataEmissao: "2026-10-01", dataLancamento: "2026-10-02",
  dataPagamento: null, vencimento: "2026-11-10", valorOriginal: 1000, valorAberto: 1000, ccu: "10", ctaFin: "5", origemCcu: "rateio", numOcpVinculada: null, ocSituacao: null, ...o,
});

test("item do titulo: status de pagamento", () => {
  assert.equal(itemDoTitulo(tit({ pago: true, dataPagamento: "2026-10-15", valorAberto: 0 }), hoje, nome).pagamento, "pago");
  assert.equal(itemDoTitulo(tit({ pago: true, dataPagamento: "2026-10-15", valorAberto: 0 }), hoje, nome).valor, 1000);
  assert.equal(itemDoTitulo(tit({ vencimento: "2026-10-01" }), hoje, nome).pagamento, "vencido");
  assert.equal(itemDoTitulo(tit({ vencimento: "2026-11-10" }), hoje, nome).pagamento, "a_pagar");
  assert.equal(itemDoTitulo(tit({ tipo: "PRV", vencimento: "2026-08-01" }), hoje, nome).pagamento, "previsao");
  assert.equal(itemDoTitulo(tit({ vencimento: "2030-12-31" }), hoje, nome).pagamento, "a_pagar"); // data-sentinela nao vira "vencido"
  assert.equal(itemDoTitulo(tit({ vencimento: "2030-12-31" }), hoje, nome).vencimento, null);
});

test("item do titulo: OC ao lado e linha de custo", () => {
  const i = itemDoTitulo(tit({ numOcpVinculada: "55", ocSituacao: "APR" }), hoje, nome);
  assert.equal(i.ocRotulo, "Aprovada");
  assert.equal(i.numOcp, "55");
  assert.equal(i.linhaCusto, "Combustível");
  assert.equal(itemDoTitulo(tit({}), hoje, nome).ocRotulo, "Sem OC");
  assert.equal(itemDoTitulo(tit({ ctaFin: null }), hoje, nome).linhaCusto, null);
});

const oc = (o: Partial<Parameters<typeof itemDaOc>[0]> = {}) => itemDaOc({ numOcp: "77", ccu: "10", ctaFin: "6", valor: 500, situacaoAtual: "ANA", dataEmissao: "2026-10-18", fornecedor: "FORN OC", descricao: "aluguel de equipamento", previsaoPagamento: null, ...o }, nome);

function feed(): ItemAoVivo[] {
  return [
    itemDoTitulo(tit({ id: "a", pago: true, dataPagamento: "2026-10-17", valorAberto: 0, valorOriginal: 400 }), hoje, nome), // pago
    itemDoTitulo(tit({ id: "b", vencimento: "2026-09-01", valorAberto: 250 }), hoje, nome), // vencido
    itemDoTitulo(tit({ id: "c", tipo: "PRV", ctaFin: "6", vencimento: "2026-12-05", valorAberto: 900 }), hoje, nome), // previsao
    itemDoTitulo(tit({ id: "d", ccu: "20", valorAberto: 70 }), hoje, nome), // outro CC
    itemDoTitulo(tit({ id: "e", ctaFin: null, valorAberto: 10 }), hoje, nome), // sem linha de custo
    oc(), // OC em analise
    oc({ numOcp: "78", situacaoAtual: "APR", valor: 120 }), // OC aprovada
    oc({ numOcp: "79", situacaoAtual: "REP", valor: 60 }), // OC reprovada
  ];
}

test("ao vivo: filtra por centro de custo e conta o resumo por situacao", () => {
  const r = montarAoVivo(feed(), { ccu: "10" });
  assert.equal(r.total, 7);
  assert.equal(r.resumo.pagos.n, 1);
  assert.equal(r.resumo.vencidos.n, 1);
  assert.equal(r.resumo.previsoes.n, 1);
  assert.equal(r.resumo.oc_analise.n, 1);
  assert.equal(r.resumo.oc_aprovada.n, 1);
  assert.equal(r.resumo.oc_reprovada.n, 1);
  assert.equal(r.resumo.pagos.valor, 400);
});

test("ao vivo: filtro por linha de custo e opcao 'sem linha'", () => {
  const aluguel = montarAoVivo(feed(), { ccu: "10", conta: "6" });
  assert.deepEqual(aluguel.itens.map((i) => i.chave.split("|")[1]).sort(), ["77", "78", "79", "c"]);
  const sem = montarAoVivo(feed(), { ccu: "10", conta: SEM_LINHA });
  assert.deepEqual(sem.itens.map((i) => i.chave.split("|")[1]), ["e"]);
});

test("ao vivo: lista de linhas de custo mostra as opcoes com os demais filtros aplicados", () => {
  const r = montarAoVivo(feed(), { ccu: "10", situacao: "pagos" });
  assert.deepEqual(r.linhasDeCusto.map((l) => [l.cod, l.n]), [["5", 1]]);
  const todas = montarAoVivo(feed(), { ccu: "10" });
  assert.ok(todas.linhasDeCusto.some((l) => l.cod === SEM_LINHA && l.nome === "Sem linha de custo informada"));
  // escolher uma conta nao some com as outras opcoes de conta
  assert.ok(montarAoVivo(feed(), { ccu: "10", conta: "6" }).linhasDeCusto.length >= 2);
});

test("ao vivo: busca, filtro de OC e ordem do mais recente para o mais antigo", () => {
  assert.equal(montarAoVivo(feed(), { ccu: "10", q: "aluguel" }).total, 4); // 3 OCs (descricao) + a previsao na linha "Aluguel"
  assert.deepEqual(montarAoVivo(feed(), { ccu: "10", situacao: "oc_analise" }).itens.map((i) => i.numOcp), ["77"]);
  assert.deepEqual(montarAoVivo(feed(), { ccu: "10", situacao: "oc_reprovada" }).itens.map((i) => i.numOcp), ["79"]);
  const datas = montarAoVivo(feed(), { ccu: "10" }).itens.map((i) => i.data);
  assert.deepEqual(datas, [...datas].sort().reverse());
});

test("ao vivo: paginacao", () => {
  const muitos = Array.from({ length: 130 }, (_, k) => itemDoTitulo(tit({ id: `x${k}`, dataLancamento: `2026-09-${String((k % 28) + 1).padStart(2, "0")}` }), hoje, nome));
  const p1 = montarAoVivo(muitos, { ccu: "10" }, 1, 60);
  assert.equal(p1.paginas, 3);
  assert.equal(p1.itens.length, 60);
  assert.equal(montarAoVivo(muitos, { ccu: "10" }, 3, 60).itens.length, 10);
  assert.equal(montarAoVivo(muitos, { ccu: "10" }, 99, 60).pagina, 3);
});

test("ao vivo: periodo, mes a mes e escolher um mes", () => {
  const dia = (id: string, data: string, valor: number, pago = false) => itemDoTitulo(tit({ id, dataLancamento: data, dataEmissao: data, pago, dataPagamento: pago ? data : null, valorOriginal: valor, valorAberto: pago ? 0 : valor }), hoje, nome);
  const l = [dia("a", "2026-08-10", 100, true), dia("b", "2026-09-05", 200), dia("c", "2026-09-20", 300, true), dia("d", "2026-10-02", 50), dia("e", "2026-04-01", 999)];
  const r = montarAoVivo(l, { ccu: "10", de: "2026-08", ate: "2026-10" });
  assert.deepEqual(r.meses.map((m) => [m.mes, m.n, m.valor, m.pagos, m.emAberto]), [["2026-08", 1, 100, 100, 0], ["2026-09", 2, 500, 300, 200], ["2026-10", 1, 50, 0, 50]]);
  assert.equal(r.total, 4); // abril fica fora do periodo
  assert.equal(r.resumo.todas.n, 4);
  const set = montarAoVivo(l, { ccu: "10", de: "2026-08", ate: "2026-10", mes: "2026-09" });
  assert.equal(set.total, 2);
  assert.equal(set.resumo.todas.valor, 500);
  assert.equal(set.meses.length, 3); // a tira de meses continua mostrando todos os meses do periodo
  assert.equal(montarAoVivo(l, { ccu: "10", de: "2026-08", ate: "2026-10", situacao: "pagos" }).meses.find((m) => m.mes === "2026-09")!.n, 1);
  assert.equal(montarAoVivo(l, { ccu: "10" }).total, 5); // sem periodo: tudo
});
