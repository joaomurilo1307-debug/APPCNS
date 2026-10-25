import test from "node:test";
import assert from "node:assert/strict";
import { abaCustoPorConta, abaEquipe, montarDossie, type FichaDossie } from "../src/lib/contratos/dossie";
import { montarWorkbook } from "../src/lib/exportarExcel";

const ficha: FichaDossie = { codccu: "280", nome: "SVPM CT 072/2024", tipo: "CONTRATO", status: "ATIVO", cliente: "Cliente S.A.", numero: "072/2024", vigenciaInicio: "2024-01-01T00:00:00.000Z", vigenciaFim: "2027-08-30T00:00:00.000Z", valor: 1_000_000 };

const conta = (nome: string, grupoCodigo: string, grupoNome: string, valores: Record<string, number>, reembolsavel = false) => ({
  contaFinanceira: nome, codigo: 1, grupoCodigo, grupoNome, reembolsavel, total: Object.values(valores).reduce((a, b) => a + b, 0),
  meses: Object.entries(valores).map(([m, valor]) => ({ competencia: `${m}-01T00:00:00.000Z`, valor })),
});
const contrato = {
  codccu: "280", contrato: "280 - SVPM CT 072/2024", nome: "SVPM CT 072/2024", teamId: null, teamName: null, projectName: null, totalGeral: 0, ultimaCompetencia: null,
  contas: [
    conta("Combustível", "g1", "Operação", { "2026-08": 1000, "2026-09": 3000 }),
    conta("Aluguel de veículos", "g1", "Operação", { "2026-08": 500, "2026-09": 500 }),
    conta("Diárias", "g2", "Pessoal", { "2026-09": 200 }, true),
    conta("Conta zerada", "g2", "Pessoal", { "2026-08": 0 }),
  ],
};

test("custo por conta x mes: agrupado, ordenado, com participacao e total fora do filtro", () => {
  const aba = abaCustoPorConta(contrato as any, ["2026-08", "2026-09"]);
  assert.equal(aba.linhas.length, 3, "conta zerada nao entra");
  assert.deepEqual(aba.linhas.map((l) => l[1]), ["Combustível", "Aluguel de veículos", "Diárias"], "grupo de maior valor primeiro, e conta maior primeiro");
  assert.deepEqual(aba.rodape?.slice(0, 2), ["", "TOTAL"]);
  assert.equal(aba.rodape?.[5], 5200, "total do periodo");
  assert.equal(aba.linhas[0][5], 4000);
  assert.ok(Math.abs((aba.linhas[0][6] as number) - 4000 / 5200) < 1e-9, "participacao");
  assert.equal(montarWorkbook([aba]).Sheets[aba.nome]["!autofilter"]!.ref.startsWith("A3"), true);
});

test("equipe: gestores primeiro, depois por nome, sem e-mail", () => {
  const aba = abaEquipe("Equipe 280", [
    { role: "MEMBRO", user: { name: "Zeca", cargo: "Topógrafo" } }, { role: "GESTOR", user: { name: "Bruno" } }, { role: "MEMBRO", user: { name: "Ana" } },
  ]);
  assert.deepEqual(aba.linhas.map((l) => [l[0], l[1]]), [["Bruno", "Gestor"], ["Ana", "Membro"], ["Zeca", "Membro"]]);
  assert.equal(aba.colunas.length, 3);
});

const lancamentos = { total: 5200, linhas: [{ codccu: "280", centroDeCusto: "SVPM", competencia: "2026-09", contaCodigo: 1, contaFinanceira: "Combustível", numTit: "123", codFor: "9", fornecedor: "Posto", dataEntrada: "2026-09-01", dataVencimento: "2026-09-10", valorRateado: 3000, dataPagamento: "2026-09-12", competenciaNota: "2026-09", formaBaixa: "Itaú" }] };
const medicaoLista = { contratos: [{ numCtr: "5001", codccu: "280", valorContratado: 800000, valorMedido: 200000, saldo: 600000 }] };
const medicaoDetalhe = {
  periodo: { de: "2026-01", ate: "2026-09" }, meses: ["2026-08", "2026-09"], contrato: { codccu: "280", numCtr: "5001" },
  linhas: [{ descricao: "Topografia", unidade: "dia", precoUnit: 100, qtdContratada: 10, valorContratado: 1000, antes: { valor: 0 }, porMes: { "2026-09": { valor: 100, qtd: 1 } }, qtdFaturada: 1, valorFaturado: 100, saldoQtd: 9, saldoValor: 900, pctQtd: 0.1, pctValor: 0.1 }],
};
const previsao = { planilha: { dim: "conta", filhoDim: "fornecedor", meses: ["2026-10"], truncadas: 0, totais: { chave: "t", rotulo: "TOTAL", total: 10, programado: 10, previsto: 0, qtd: 1, antes: 0, depois: 0, semData: 0, porMes: { "2026-10": 10 } }, linhas: [{ chave: "a", rotulo: "Combustível", total: 10, programado: 10, previsto: 0, qtd: 1, antes: 0, depois: 0, semData: 0, porMes: { "2026-10": 10 } }] } };
const times = [{ id: "t1", name: "Equipe 280", codccu: "280", members: [{ role: "GESTOR", user: { name: "Bruno" } }, { role: "MEMBRO", user: { name: "Ana" } }] }, { id: "t2", name: "Outra", codccu: "70", members: [] }];

function buscarCom(respostas: Record<string, any>) {
  const chamadas: string[] = [];
  return { chamadas, buscar: async (url: string) => { chamadas.push(url); const k = Object.keys(respostas).find((p) => url.startsWith(p)); return k ? respostas[k] : null; } };
}

test("dossie completo: Resumo + 6 abas, na ordem, com os indicadores certos", async () => {
  const { buscar, chamadas } = buscarCom({
    "/api/custos-conta/lancamentos": lancamentos, "/api/custos-conta": { contratos: [contrato], meses: ["2026-08-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z"], mesCorrente: "2026-10-01T00:00:00.000Z" },
    "/api/medicao/5001": medicaoDetalhe, "/api/medicao": medicaoLista, "/api/previsao/mensal": previsao, "/api/teams": times,
  });
  const abas = await montarDossie(ficha, buscar, new Date("2026-10-25T12:00:00Z"));
  assert.deepEqual(abas.map((a) => a.nome), ["Resumo", "Custo por conta x mês", "Lançamentos (Rel114)", "Medição por linha", "Previsão mês a mês", "Equipe"]);
  const resumo = Object.fromEntries(abas[0].linhas.map((l) => [l[0], l[1] || l[2]]));
  assert.equal(resumo["Custo no período (R$)"], 5200);
  assert.equal(resumo["Contratado nas linhas do Senior (R$)"], 800000);
  assert.equal(resumo["Saldo a medir (R$)"], 600000);
  assert.equal(resumo["Medido sobre o contratado"], "25,0%");
  assert.equal(resumo["Meses com custo"], "2");
  assert.match(String(resumo["Equipe"]), /Equipe 280 · 2 pessoa/);
  assert.equal(abas[0].linhas.some((l) => l[0] === "Aviso"), false, "nenhum aviso quando tudo esta disponivel");
  assert.ok(chamadas.some((u) => u.includes("codccu=280") && u.includes("de=2026-08") && u.includes("ate=2026-09") && u.includes("base=pagamento")));
  montarWorkbook(abas); // monta de verdade, sem quebrar
});

test("dossie: o que nao esta disponivel some, e o Resumo avisa (sem quebrar)", async () => {
  const { buscar } = buscarCom({ "/api/custos-conta": { contratos: [contrato], meses: ["2026-09-01T00:00:00.000Z"], mesCorrente: "2026-10-01T00:00:00.000Z" }, "/api/medicao": { contratos: [] } });
  const abas = await montarDossie(ficha, buscar, new Date());
  assert.deepEqual(abas.map((a) => a.nome), ["Resumo", "Custo por conta x mês"]);
  const avisos = abas[0].linhas.filter((l) => l[0] === "Aviso").map((l) => String(l[1]));
  assert.equal(avisos.length, 4);
  assert.ok(avisos.some((a) => a.startsWith("Lançamentos")) && avisos.some((a) => a.startsWith("Medição")) && avisos.some((a) => a.startsWith("Previsão")) && avisos.some((a) => a.startsWith("Equipe")));
});

test("dossie: sem permissao nos custos ou contrato sem custo, so' o que tem aparece", async () => {
  const semNada = await montarDossie(ficha, async () => null, new Date());
  assert.deepEqual(semNada.map((a) => a.nome), ["Resumo"]);
  assert.ok(semNada[0].linhas.some((l) => l[0] === "Aviso" && String(l[1]).startsWith("Custos: não foi possível")));
  const outro = await montarDossie({ ...ficha, codccu: "999" }, buscarCom({ "/api/custos-conta": { contratos: [contrato], meses: ["2026-09-01T00:00:00.000Z"], mesCorrente: "x" } }).buscar, new Date());
  assert.ok(outro[0].linhas.some((l) => l[0] === "Aviso" && String(l[1]).includes("não tem custo lançado")));
});
