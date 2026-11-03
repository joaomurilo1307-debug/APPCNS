import { test } from "node:test";
import assert from "node:assert/strict";
import { classificar, formatarDocumento, limparDescricao, montarReembolsaveis, TIPOS_DE_SERVICO, type EntradaReembolso } from "../src/lib/contratos/reembolsaveis";

const nome = (c: string) => `CC ${c}`;
const base = { mes: "2026-09", pode: () => true, nomeDoCentro: nome };
const ent = (extra: Partial<EntradaReembolso> = {}): EntradaReembolso => ({
  ccu: "230", conta: "Despesas Reembolsáveis", codConta: 67, numTit: "T1", tipoTitulo: "NFS", codFor: "10", fornecedor: "FORN", documento: "41480496000125", valor: 100, dataPagamento: "2026-09-10", dataRealizacao: "2026-09-01", descricao: null, ...extra,
});

test("limparDescricao: tira o cabecalho 'VALOR BRUTO', o 'PAGAMENTO REFERENTE A' e o rabo 'EM ATENDIMENTO / C/C'", () => {
  assert.equal(limparDescricao("VALOR BRUTO:R$ 125,30 - PAGAMENTO REFERENTE A COMPRA DE 05 CONES 50CM EM ATENDIMENTO A CONTRATO - DATA: 28/09/2026 - C/C: MRN CT 3687/2023"), "Compra de 05 cones 50cm");
  assert.equal(limparDescricao("VALOR BRUTO:R$ 6.120,00 - PAGAMENTO REFERENTE A LOCACAO DE IMOVEL ENDERECO: RUA X PERIODO: 06/10/2026 A 05/11/2026 - C/C: MRN CT 3687/2023 LT"), "Locacao de imovel endereco: rua x");
  assert.equal(limparDescricao(null), "");
  assert.equal(limparDescricao("   "), "");
  assert.equal(limparDescricao("Jantar para 4 pessoas"), "Jantar para 4 pessoas");
});

test("formatarDocumento: CNPJ e CPF formatados; outro tamanho nao e' inventado", () => {
  assert.equal(formatarDocumento("41480496000125"), "41.480.496/0001-25");
  assert.equal(formatarDocumento("75242214287"), "752.422.142-87");
  assert.equal(formatarDocumento("123"), "123");
  assert.equal(formatarDocumento(null), null);
  assert.equal(formatarDocumento(""), null);
});

test("classificar: conta R vale mais que o texto e vem marcada como 'conta'", () => {
  assert.deepEqual(classificar(215, "qualquer coisa de alimentacao"), { tipo: "Combustível veículos (camionetes)", origem: "conta" });
  assert.equal(classificar(182, null).tipo, "Alimentação na execução dos serviços");
});

test("classificar: na conta antiga (67) so' SUGERE pelo texto, e sem pista fica 'Nao classificado'", () => {
  assert.deepEqual(classificar(67, "Jantar para 4 pessoas"), { tipo: "Alimentação na execução dos serviços", origem: "sugerido" });
  assert.equal(classificar(67, "Locação de lancha (01/08 a 19/08/2026)").tipo, "Aluguel de embarcações com abastecimento de combustível");
  assert.equal(classificar(67, "Abastecimento das camionetes primeira quinzena").tipo, "Combustível veículos (camionetes)");
  assert.equal(classificar(67, "Passagens aéreas Belém x Porto Trombetas").tipo, "Passagens aéreas traslados de mobilização e desmobilização");
  assert.equal(classificar(67, "Locação de ônibus (Período de agosto)").tipo, "Aluguel de camionetes");
  assert.deepEqual(classificar(67, "Serviço diverso sem pista"), { tipo: "Não classificado", origem: "nao_classificado" });
  assert.deepEqual(classificar(null, ""), { tipo: "Não classificado", origem: "nao_classificado" });
});

test("montarReembolsaveis: so' o mes escolhido, DOC. numerado em ordem de data de realizacao, valor so' do centro", () => {
  const linhas = [
    ent({ numTit: "A", dataRealizacao: "2026-09-05", valor: 10, descricao: "VALOR BRUTO:R$ 10,00 - PAGAMENTO REFERENTE A JANTAR PARA 4 PESSOAS EM ATENDIMENTO A CONTRATO" }),
    ent({ numTit: "B", dataRealizacao: "2026-08-20", valor: 20.5 }),
    ent({ numTit: "C", dataPagamento: "2026-10-02", valor: 999 }), // outro mes
  ];
  const r = montarReembolsaveis(linhas, base);
  assert.deepEqual(r.linhas.map((l) => [l.doc, l.numTit]), [[1, "B"], [2, "A"]]);
  assert.equal(r.resumo.total, 30.5);
  assert.equal(r.linhas[1].descricao, "Jantar para 4 pessoas");
  assert.equal(r.linhas[1].cnpj, "41.480.496/0001-25");
});

test("resumo: o total do resumo = soma das linhas = soma dos tipos; os 11 tipos aparecem mesmo zerados", () => {
  const r = montarReembolsaveis([ent({ numTit: "A", descricao: "Jantar" , valor: 70.1 }), ent({ numTit: "B", descricao: "Locação de lancha", valor: 200.2 }), ent({ numTit: "C", descricao: "xyz", valor: 3.3 })], base);
  assert.equal(r.resumo.total, 273.6);
  assert.equal(Math.round(r.resumo.porTipo.reduce((s, p) => s + p.valor, 0) * 100) / 100, r.resumo.total);
  for (const t of TIPOS_DE_SERVICO) assert.ok(r.resumo.porTipo.some((p) => p.tipo === t), t);
  assert.equal(r.resumo.porTipo.find((p) => p.tipo === "Não classificado")?.linhas, 1);
  assert.equal(r.resumo.porTipo.find((p) => p.tipo === "Alimentação na execução dos serviços")?.sugeridas, 1);
});

test("acesso e filtros: so' os centros liberados; um centro; um tipo; busca sem acento", () => {
  const dados = [ent({ ccu: "230", numTit: "A", fornecedor: "Construção Ltda" }), ent({ ccu: "210", numTit: "B" }), ent({ ccu: "999", numTit: "C" })];
  assert.deepEqual(montarReembolsaveis(dados, { ...base, pode: (c) => c !== "999" }).linhas.map((l) => l.ccu).sort(), ["210", "230"]);
  assert.deepEqual(montarReembolsaveis(dados, { ...base, ccu: "210" }).linhas.map((l) => l.numTit), ["B"]);
  assert.equal(montarReembolsaveis(dados, { ...base, tipo: "Não classificado" }).linhas.length, 3);
  assert.equal(montarReembolsaveis(dados, { ...base, tipo: "Aluguel de camionetes" }).linhas.length, 0);
  assert.equal(montarReembolsaveis(dados, { ...base, q: "construcao" }).linhas.length, 1);
});

test("falhas: sem acesso a nenhum centro, mes sem lancamento e entradas vazias nao quebram nem inventam linha", () => {
  assert.equal(montarReembolsaveis([ent()], { ...base, pode: () => false }).linhas.length, 0);
  const vazio = montarReembolsaveis([ent()], { ...base, mes: "2026-01" });
  assert.equal(vazio.linhas.length, 0);
  assert.equal(vazio.resumo.total, 0);
  assert.equal(montarReembolsaveis([], base).resumo.porTipo.length, 11);
});

test("linha sem descricao usa o nome da conta; sem data de realizacao ordena pela data do pagamento", () => {
  const r = montarReembolsaveis([ent({ numTit: "Z", dataRealizacao: null, dataPagamento: "2026-09-02" }), ent({ numTit: "Y", dataRealizacao: "2026-09-09" })], base);
  assert.equal(r.linhas[0].numTit, "Z");
  assert.equal(r.linhas[0].descricao, "Despesas Reembolsáveis");
});
