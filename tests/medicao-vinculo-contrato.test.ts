import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { resumirVinculosMedicao, type ContratoParaVinculo } from "../src/lib/medicao/vinculoContrato";
import { montarEscopo, podeVerCcu, type EscopoCustos } from "../src/lib/custos/acesso";

const contratos: ContratoParaVinculo[] = [
  { numCtr: "108", numOfi: "PM CONTAGEM CT 17 21", codccu: "270", valorContratado: 525460.87, valorMedido: 499338.24 },
  { numCtr: "36", numOfi: "PM CONTAGEM CT 17 21", codccu: "270", valorContratado: 420402.72, valorMedido: 281064.56 },
  { numCtr: "69", numOfi: "CEMIG 8503 CANCELADO", codccu: "440", valorContratado: 295106.92, valorMedido: 291575.72 },
  { numCtr: "67", numOfi: "CEMIG 8503 - OS 009", codccu: "440", valorContratado: 83900.54, valorMedido: 83760.46 },
];

test("ficha CCU 270 e 440 inclui todos os numeros Senior e preserva os acumulados individuais", () => {
  const contagem = resumirVinculosMedicao("270", contratos);
  assert.deepEqual(contagem.contratos.map((c) => c.numCtr), ["36", "108"]);
  assert.deepEqual(contagem.totais, { contratado: 945863.59, medido: 780402.8, saldo: 165460.79, pct: 780402.8 / 945863.59 });
  const cemig = resumirVinculosMedicao("440", contratos);
  assert.equal(cemig.contratos.length, 2);
  assert.deepEqual(cemig.totais, { contratado: 379007.46, medido: 375336.18, saldo: 3671.28, pct: 375336.18 / 379007.46 });
  assert.equal(contagem.contratos.find((c) => c.numCtr === "108")?.valorMedido, 499338.24);
});

test("vinculo nao usa nome, rateio secundario nem contrato sem CCU, e nao modifica a entrada", () => {
  const entrada = [...contratos, { ...contratos[0], numCtr: "outro", codccu: "999", codccusItens: "999,270" }, { ...contratos[0], numCtr: "sem", codccu: null }];
  const antes = JSON.stringify(entrada);
  assert.equal(resumirVinculosMedicao("270", entrada).contratos.length, 2);
  assert.equal(resumirVinculosMedicao("440", entrada).contratos.length, 2);
  assert.deepEqual(resumirVinculosMedicao("ausente", entrada), { contratos: [], totais: { contratado: 0, medido: 0, saldo: 0, pct: 0 } });
  assert.equal(JSON.stringify(entrada), antes);
});

// Executa o handler real com fronteiras de autenticacao/banco simuladas; nenhuma conexao externa ou Senior.
const codigoRota = ts.transpileModule(readFileSync(resolve("src/app/api/contratos/[codccu]/medicao/route.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;

function rota({ autenticado = true, modulo = true, escopo = montarEscopo(true, []), existe = true }: {
  autenticado?: boolean; modulo?: boolean; escopo?: EscopoCustos; existe?: boolean;
} = {}) {
  const chamadas = { ficha: 0, medicao: 0, atualizacao: 0 };
  const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const mockRequire = (nome: string) => {
    if (nome === "next/server") return { NextResponse: { json } };
    if (nome === "next-auth") return { getServerSession: async () => autenticado ? { user: { id: "teste", role: "VISUALIZADOR" } } : null };
    if (nome === "@/lib/auth") return { authOptions: {} };
    if (nome === "@/lib/acesso/servidor") return { negarSemModulo: async (_user: unknown, id: string) => {
      assert.equal(id, "medicao");
      return modulo ? null : json({ error: "Sem permissão para este módulo" }, { status: 403 });
    } };
    if (nome === "@/lib/custos/acesso") return { escopoDeCustos: async () => escopo, podeVerCcu };
    if (nome === "@/lib/financeiro/alertas") return { hojeBR: () => "2026-10-25" };
    if (nome === "@/lib/medicao/vinculoContrato") return { resumirVinculosMedicao };
    if (nome === "@/lib/prisma") return { prisma: {
      contrato: { findUnique: async () => { chamadas.ficha++; return existe ? { id: "ficha" } : null; } },
      medicaoContrato: { findMany: async ({ where }: { where: { codccu: string } }) => { chamadas.medicao++; return contratos.filter((c) => c.codccu === where.codccu); } },
      atualizacaoMedicao: { findFirst: async () => { chamadas.atualizacao++; return { finalizadoEm: "2026-10-25T17:32:35.333Z" }; } },
    } };
    throw new Error(`Dependencia nao esperada no lookup local: ${nome}`);
  };
  const moduloRota = { exports: {} as { GET: (req: Request, context: { params: { codccu: string } }) => Promise<Response> } };
  runInNewContext(codigoRota, { exports: moduloRota.exports, module: moduloRota, require: mockRequire });
  return { GET: (codccu: string) => moduloRota.exports.GET(new Request(`https://local.test/api/contratos/${codccu}/medicao`, { headers: { cookie: "contratos-visao=440" } }), { params: { codccu } }), chamadas };
}

test("lookup local exige sessao e modulo medicao antes de consultar indicadores", async () => {
  const anonimo = rota({ autenticado: false });
  assert.equal((await anonimo.GET("270")).status, 401);
  assert.deepEqual(anonimo.chamadas, { ficha: 0, medicao: 0, atualizacao: 0 });
  const negado = rota({ modulo: false });
  assert.equal((await negado.GET("270")).status, 403);
  assert.deepEqual(negado.chamadas, { ficha: 0, medicao: 0, atualizacao: 0 });
});

test("lookup respeita ACL de CCU e encerrados, sem vazar valores de outro centro", async () => {
  for (const escopo of [montarEscopo(false, ["440"]), montarEscopo(true, [], ["270"])]) {
    const protegido = rota({ escopo });
    const response = await protegido.GET("270");
    assert.equal(response.status, 403);
    assert.doesNotMatch(await response.text(), /945863|780402|PM CONTAGEM/);
    assert.deepEqual(protegido.chamadas, { ficha: 0, medicao: 0, atualizacao: 0 });
  }
});

test("lookup ignora filtro global e devolve apenas CCU autorizado, em dados locais sem sync", async () => {
  const autorizado = rota({ escopo: montarEscopo(false, ["270"]) });
  const response = await autorizado.GET("270");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.equal(body.codccu, "270");
  assert.equal(body.contratos.length, 2);
  assert.equal(body.totais.medido, 780402.8);
  assert.doesNotMatch(JSON.stringify(body), /CEMIG|375336/);
  assert.deepEqual(autorizado.chamadas, { ficha: 1, medicao: 1, atualizacao: 1 });
});

test("ficha ausente retorna 404 e ficha sem medicao retorna resumo vazio sem derrubar a pagina", async () => {
  const ausente = rota({ existe: false });
  assert.equal((await ausente.GET("270")).status, 404);
  assert.deepEqual(ausente.chamadas, { ficha: 1, medicao: 0, atualizacao: 0 });
  const vazio = await rota().GET("999");
  assert.equal(vazio.status, 200);
  assert.deepEqual((await vazio.json()).totais, { contratado: 0, medido: 0, saldo: 0, pct: 0 });
});
