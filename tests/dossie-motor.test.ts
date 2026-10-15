import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { executarFluxo, NOME_ENTRADA, renderizar, type Item } from "../src/lib/dossie/motor";

// Gabarito: uma execucao REAL do workflow n8n (GET /executions/{id}?includeData=true), guardada fora
// do repositorio (traz dados de fornecedor). Defina DOSSIE_ORACULO=<arquivo.json> para rodar a
// comparacao no a no; sem ele esses testes sao pulados.
const arquivo = process.env.DOSSIE_ORACULO;
const oraculo: any = arquivo && fs.existsSync(arquivo) ? JSON.parse(fs.readFileSync(arquivo, "utf8")) : null;
const runData = oraculo?.data?.resultData?.runData ?? {};
// Comparacao independente da ordem das chaves (o splitOut do n8n posiciona o campo em outro lugar).
const estavel = (v: any): any => (Array.isArray(v) ? v.map(estavel) : v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, estavel(v[k])])) : v);
const saidaDoN8n = (nome: string): Item[] => runData[nome]?.[0]?.data?.main?.[0] ?? [];

test("renderizar: expressoes {{ }} do corpo SOAP", () => {
  const ctx = { $json: { codEmp: 1, numOcp: 15394, x: { y: "a&b" } }, $: () => ({ first: () => ({ json: { k: 7 } }) }), $node: {} };
  assert.equal(renderizar("=<v>{{$json.codEmp}}</v><w>{{ $json.x.y }}</w><z>{{$('N').first().json.k}}</z>", ctx), "<v>1</v><w>a&b</w><z>7</z>");
  assert.equal(renderizar("sem expressao", ctx), "sem expressao");
  assert.equal(renderizar("={{$json.naoExiste}}", ctx), "");
});

test("gabarito: cada no do fluxo reproduz a saida do n8n (respostas SOAP gravadas)", { skip: !oraculo }, async () => {
  const entradaN8n = saidaDoN8n("Entrada por Título")[0].json;
  const divergentes: string[] = [];
  const executados: string[] = [];
  await executarFluxo(
    { codEmp: entradaN8n.codEmp, codFil: entradaN8n.codFil, numOcp: entradaN8n.numOcp },
    {
      extras: { "Entrada por Título": [{ json: entradaN8n }] },
      http: async (nome, _corpo, i) => {
        const item = saidaDoN8n(nome)[i];
        assert.ok(item, `sem resposta gravada para ${nome}#${i}`);
        return item.json.data;
      },
      aoTerminar: (nome, saidas) => {
        executados.push(nome);
        const esperado = saidaDoN8n(nome);
        const obtido = saidas[0] ?? [];
        // o n8n guarda campos de controle que nao existem aqui (pairedItem); compara so o json
        const a = JSON.stringify(estavel(esperado.map((x) => x.json)));
        const b = JSON.stringify(estavel(obtido.map((x) => x.json)));
        if (a !== b) divergentes.push(`${nome} (n8n ${esperado.length} itens, motor ${obtido.length})`);
      },
    }
  );
  assert.ok(executados.length >= 60, `executou so ${executados.length} nos`);
  assert.deepEqual(divergentes, [], `nos com saida diferente do n8n: ${divergentes.join(" | ")}`);
});
