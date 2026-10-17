import { test } from "node:test";
import assert from "node:assert/strict";
import { gravarDetalhe, gravarItens } from "../src/lib/custos/atualizacaoCusto";
import type { ItemCusto, LinhaDetalheCusto } from "../src/lib/custos/motorCustoContrato";

// Banco em memoria so' com o que a gravacao usa (nada de Postgres): confere o que e' criado, atualizado e REMOVIDO.
type Linha = { id: string; codccu: string; contaFinanceira: string; competencia: Date; valor: number; contrato: string; teamId: string | null };

function bancoFalso(inicial: Linha[], times: { id: string; codccu: string }[] = []) {
  const contas = [...inicial];
  let detalhe: any[] = [];
  let seq = 100;
  const api: any = {
    team: { findMany: async () => times },
    custoContaFinanceira: {
      findMany: async () => contas.map((c) => ({ ...c })),
      deleteMany: async ({ where }: any) => {
        for (const id of where.id.in) {
          const i = contas.findIndex((c) => c.id === id);
          if (i >= 0) contas.splice(i, 1);
        }
      },
      update: async ({ where, data }: any) => Object.assign(contas.find((c) => c.id === where.id)!, data),
      createMany: async ({ data, skipDuplicates }: any) => {
        for (const d of data) {
          const dup = contas.some((c) => c.codccu === d.codccu && c.contaFinanceira === d.contaFinanceira && c.competencia.getTime() === d.competencia.getTime());
          if (dup && skipDuplicates) continue;
          contas.push({ id: "n" + seq++, ...d });
        }
      },
    },
    custoFinanceiroDetalhe: {
      deleteMany: async () => {
        detalhe = [];
      },
      createMany: async ({ data }: any) => {
        detalhe.push(...data);
      },
    },
    $transaction: async (fn: any) => fn(api),
  };
  return { api, contas, detalhe: () => detalhe };
}

const d = (m: string) => new Date(`${m}-01T00:00:00.000Z`);
const item = (codccu: string, conta: string, mes: string, valor: number): ItemCusto => ({ codccu, contaCodigo: "1", contaFinanceira: conta, competencia: `${mes}-01`, valor });

test("gravarItens: mantem o igual, atualiza o que mudou, cria o novo e remove o que sumiu da fonte (inclui nome antigo sem acento)", async () => {
  const banco = bancoFalso(
    [
      { id: "a", codccu: "190", contaFinanceira: "Internet", competencia: d("2026-01"), valor: 100, contrato: "190 - FLORA", teamId: "t1" },
      { id: "b", codccu: "190", contaFinanceira: "Combustível", competencia: d("2026-01"), valor: 50, contrato: "190 - FLORA", teamId: "t1" },
      { id: "c", codccu: "190", contaFinanceira: "Telefonia Fixa", competencia: d("2026-01"), valor: 9, contrato: "190 - FLORA", teamId: "t1" }, // sumiu da fonte
      { id: "e", codccu: "190", contaFinanceira: "Combustivel", competencia: d("2026-01"), valor: 50, contrato: "190 - FLORA", teamId: "t1" }, // nome antigo sem acento
    ],
    [{ id: "t1", codccu: "190" }, { id: "t2", codccu: "270" }]
  );
  const nome = (c: string) => (c === "190" ? "190 - FLORA" : `${c} - NOVO`);
  const r = await gravarItens(banco.api, [item("190", "Internet", "2026-01", 100), item("190", "Combustível", "2026-01", 75), item("270", "Internet", "2026-02", 5)], nome);
  assert.deepEqual(r, { criadas: 1, atualizadas: 1, removidas: 2 });
  const resumo = banco.contas.map((c) => `${c.codccu}|${c.contaFinanceira}|${c.competencia.toISOString().slice(0, 7)}|${c.valor}|${c.teamId}|${c.contrato}`).sort();
  assert.deepEqual(resumo, ["190|Combustível|2026-01|75|t1|190 - FLORA", "190|Internet|2026-01|100|t1|190 - FLORA", "270|Internet|2026-02|5|t2|270 - NOVO"]);
});

test("gravarItens: duplicata na base e' removida e contrato/equipe corrigidos", async () => {
  const banco = bancoFalso(
    [
      { id: "a", codccu: "190", contaFinanceira: "Internet", competencia: d("2026-01"), valor: 100, contrato: "nome velho", teamId: null },
      { id: "dup", codccu: "190", contaFinanceira: "Internet", competencia: d("2026-01"), valor: 100, contrato: "nome velho", teamId: null },
    ],
    [{ id: "t1", codccu: "190" }]
  );
  const r = await gravarItens(banco.api, [item("190", "Internet", "2026-01", 100)], () => "190 - FLORA");
  assert.equal(r.removidas, 1);
  assert.equal(r.atualizadas, 1);
  assert.equal(banco.contas.length, 1);
  assert.equal(banco.contas[0].contrato, "190 - FLORA");
  assert.equal(banco.contas[0].teamId, "t1");
});

test("gravarItens: base vazia cria tudo", async () => {
  const banco = bancoFalso([]);
  const r = await gravarItens(banco.api, [item("1", "A", "2026-01", 1), item("1", "A", "2026-02", 2)], (c) => c);
  assert.deepEqual(r, { criadas: 2, atualizadas: 0, removidas: 0 });
});

test("gravarDetalhe: substitui tudo e preenche fornecedor/datas pelo titulo", async () => {
  const banco = bancoFalso([]);
  const linhas: LinhaDetalheCusto[] = [
    { codccu: "190", contaCodigo: "1", contaFinanceira: "Internet", competencia: "2026-01-01", numTit: "T1", codFil: "1", codFor: "100", valorRateado: 10.5 },
    { codccu: "190", contaCodigo: "1", contaFinanceira: "Internet", competencia: "2026-01-01", numTit: "T2", codFil: "1", codFor: "200", valorRateado: 3 },
  ];
  await gravarDetalhe(banco.api, [{ ...linhas[0], numTit: "ANTIGO" }], new Map()); // conteudo anterior
  await gravarDetalhe(banco.api, linhas, new Map([["T1|100", { fornecedorNome: "FORN A", dataEntrada: "2026-01-05", dataVencimento: null }]]));
  const gravado = banco.detalhe();
  assert.equal(gravado.length, 2, "a substituicao apaga o anterior");
  assert.equal(gravado[0].fornecedorNome, "FORN A");
  assert.equal(gravado[0].dataEntrada.toISOString().slice(0, 10), "2026-01-05");
  assert.equal(gravado[0].dataVencimento, null);
  assert.equal(gravado[1].fornecedorNome, null);
  assert.equal(gravado[1].valorRateado, 3);
});
