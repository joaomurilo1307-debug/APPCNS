import { test } from "node:test";
import assert from "node:assert/strict";
import { centroDoRateio } from "../src/lib/titulos/centroDoRateio";

test("um centro so': devolve ele; varios: todos, sem repetir e em ordem numerica", () => {
  assert.deepEqual(centroDoRateio([{ codTpt: "NFS", codccu: "13" }, { codTpt: "NFS", codccu: "13" }], "NFS"), ["13"]);
  assert.deepEqual(centroDoRateio([{ codTpt: "NFS", codccu: "102285" }, { codTpt: "NFS", codccu: "20" }, { codTpt: "NFS", codccu: "20" }], "NFS"), ["20", "102285"]);
});

test("o tipo do titulo separa numeros iguais de tipos diferentes; linha sem tipo vale para qualquer tipo", () => {
  const linhas = [{ codTpt: "NFS", codccu: "13" }, { codTpt: "OUT", codccu: "1120" }, { codTpt: null, codccu: "12" }];
  assert.deepEqual(centroDoRateio(linhas, "NFS"), ["12", "13"]);
  assert.deepEqual(centroDoRateio(linhas, "OUT"), ["12", "1120"]);
  assert.deepEqual(centroDoRateio(linhas, null), ["12", "13", "1120"], "sem tipo no titulo: todas as linhas do numero e fornecedor");
});

test("sem rateio (ex.: conta fora do custo, titulo em aberto) devolve vazio e ignora centro em branco", () => {
  assert.deepEqual(centroDoRateio([], "NFS"), []);
  assert.deepEqual(centroDoRateio([{ codTpt: "NFS", codccu: " " }], "NFS"), []);
});
