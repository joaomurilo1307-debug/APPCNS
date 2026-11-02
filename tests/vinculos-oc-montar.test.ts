import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { montarVinculos } from "../src/lib/senior/vinculosOc";

test("caminho feliz: itens de NF (produto e servico) e USU_NUMOCP do titulo viram vinculos", () => {
  const r = montarVinculos(
    [{ CODFIL: "1", CODFOR: "10", NUMNFC: "8313", NUMOCP: "500" }],
    [{ CODFIL: "1", CODFOR: "11", NUMNFC: "77", NUMOCP: "501" }],
    [{ CODFIL: "1", CODFOR: "12", NUMTIT: "T9", USU_NUMOCP: "502" }],
  );
  assert.deepEqual(r, [
    { origem: "NF", codFil: "1", codFor: "10", chave: "8313", numOcp: "500" },
    { origem: "NF", codFil: "1", codFor: "11", chave: "77", numOcp: "501" },
    { origem: "TITULO", codFil: "1", codFor: "12", chave: "T9", numOcp: "502" },
  ]);
});

test("itens repetidos da mesma NF e da mesma OC contam uma vez so'; NF com duas OCs mantem as duas", () => {
  const item = { CODFIL: "1", CODFOR: "10", NUMNFC: "8313", NUMOCP: "500" };
  const r = montarVinculos([item, item, { ...item, NUMOCP: "503" }], [], []);
  assert.equal(r.length, 2);
  assert.deepEqual(r.map((l) => l.numOcp).sort(), ["500", "503"]);
});

test("falhas: OC zero, vazia, texto, sem NF ou sem numero do titulo sao ignoradas; zeros a esquerda saem limpos", () => {
  const r = montarVinculos(
    [
      { CODFIL: "1", CODFOR: "10", NUMNFC: "1", NUMOCP: "0" },
      { CODFIL: "1", CODFOR: "10", NUMNFC: "2", NUMOCP: "" },
      { CODFIL: "1", CODFOR: "10", NUMNFC: "3", NUMOCP: "abc" },
      { CODFIL: "1", CODFOR: "10", NUMNFC: "", NUMOCP: "500" },
      { CODFIL: "1", CODFOR: "10", NUMNFC: "4", NUMOCP: "0016211" },
    ],
    [],
    [
      { CODFIL: "1", CODFOR: "10", NUMTIT: "", USU_NUMOCP: "501" },
      { CODFIL: "1", CODFOR: "10", NUMTIT: "T1", USU_NUMOCP: "0" },
    ],
  );
  assert.deepEqual(r, [{ origem: "NF", codFil: "1", codFor: "10", chave: "4", numOcp: "16211" }]);
});

test("leitura vazia da Senior gera lista vazia (quem grava recusa e nao apaga a tabela)", () => {
  assert.deepEqual(montarVinculos([], [], []), []);
});

// O PR #67 importou garantirVinculosOcAtualizados() e nunca a chamou: a tabela ficou vazia em producao. Estes dois testes travam essa regressao.
const fonte = (arq: string) => readFileSync(join(process.cwd(), arq), "utf8");
test("a Programacao de Pagamento dispara a atualizacao dos vinculos (chamada, nao so' import)", () => {
  assert.match(fonte("src/app/api/titulos-pagar/route.ts"), /void garantirVinculosOcAtualizados\(\)/);
});
test("o agendador do servidor tambem atualiza os vinculos, mesmo sem ninguem abrir a tela", () => {
  assert.match(fonte("src/lib/custos/agendador.ts"), /void garantirVinculosOcAtualizados\(\)/);
});
