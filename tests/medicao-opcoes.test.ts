import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { escopoDeCustos, escopoDeVisao, podeVerCcu, type EscopoCustos } from "../src/lib/custos/acesso";

// Handler real com banco/autenticacao simulados. Nao carrega Prisma nem consulta o Senior.
const codigoRota = ts.transpileModule(readFileSync(resolve("src/app/api/medicao/route.ts"), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
}).outputText;
const referencias = [
  { codccu: "440", numOfi: "CEMIG 8503 - OS 009", codccusItens: "440,990", valorContratado: 83900.54 },
  { codccu: "440", numOfi: "CEMIG 8503 CANCELADO", codccusItens: "440", valorContratado: 295106.92 },
  { codccu: "270", numOfi: "PM CONTAGEM CT 17 21", codccusItens: "270", valorContratado: 525460.87 },
  { codccu: "270", numOfi: "PM CONTAGEM CT 17 21", codccusItens: "270", valorContratado: 420402.72 },
  { codccu: "230", numOfi: "MRN CT 3687 2023", codccusItens: "230", valorContratado: 33910000 },
  { codccu: "999", numOfi: "Acesso apenas a projetos", codccusItens: "999", valorContratado: 123 },
  { codccu: "450", numOfi: "Contrato da equipe", codccusItens: "450", valorContratado: 456 },
  { codccu: "460", numOfi: "", codccusItens: "460", valorContratado: 789 },
  { codccu: null, numOfi: "Sem centro identificado", codccusItens: "990", valorContratado: 111 },
  { codccu: "", numOfi: "Centro vazio", codccusItens: "990", valorContratado: 222 },
];

function rota({ autenticado = true, modulo = true, role = "VISUALIZADOR", excluidos = [] as string[], semAcesso = false, vazia = false } = {}) {
  const chamadas = { modulo: 0, usuario: 0, acompanhamento: 0, referencias: 0, nomes: [] as string[][], estado: 0, sincronizacao: 0, itens: 0, linhas: 0 };
  const json = (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), { ...init, headers: { "content-type": "application/json", ...init?.headers } });
  const proibido = (campo: "estado" | "sincronizacao" | "itens" | "linhas") => {
    chamadas[campo]++;
    throw new Error(`Consulta de opcoes nao deve executar ${campo}`);
  };
  const prisma = {
    user: { findUnique: async () => {
      chamadas.usuario++;
      return { verTodosCustos: false, acessosCentroCusto: semAcesso ? [] : [
        { codccu: "270", area: "AMBOS" }, { codccu: "440", area: "FINANCEIRO" }, { codccu: "999", area: "PROJETOS" },
      ], teams: semAcesso ? [] : [{ team: { codccu: "450" } }] };
    } },
    contrato: { findMany: async ({ where }: { where: { acompanharResultados: boolean } }) => {
      chamadas.acompanhamento++;
      assert.equal(where.acompanharResultados, false);
      return excluidos.map((codccu) => ({ codccu }));
    } },
    medicaoContrato: { findMany: async ({ select }: { select: Record<string, boolean> }) => {
      chamadas.referencias++;
      assert.deepEqual(Object.keys(select).sort(), ["codccu", "numOfi"]);
      return (vazia ? [] : referencias).map(({ codccu, numOfi }) => ({ codccu, numOfi }));
    } },
    medicaoItem: { groupBy: async () => proibido("itens"), findMany: async () => proibido("itens") },
    medicaoLinha: { findMany: async () => proibido("linhas") },
  };
  const mockRequire = (nome: string) => {
    if (nome === "next/server") return { NextResponse: { json } };
    if (nome === "next-auth") return { getServerSession: async () => autenticado ? { user: { id: "teste", role } } : null };
    if (nome === "@/lib/auth") return { authOptions: {} };
    if (nome === "@/lib/prisma") return { prisma };
    if (nome === "@/lib/acesso/servidor") return { negarSemModulo: async (_user: unknown, id: string) => {
      chamadas.modulo++;
      assert.equal(id, "medicao");
      return modulo ? null : json({ error: "Sem permissão para este módulo" }, { status: 403 });
    } };
    if (nome === "@/lib/custos/acesso") return {
      escopoDeCustos, podeVerCcu,
      escopoDeVisao: async (escopo: EscopoCustos, opcoes: { ignorarSelecao?: boolean; incluirForaDosResultados?: boolean }, db: unknown) => {
        assert.equal(opcoes.ignorarSelecao, true, "cookie temporario nao deve restringir as opcoes");
        assert.notEqual(opcoes.incluirForaDosResultados, true);
        assert.equal(db, prisma);
        return escopoDeVisao(escopo, opcoes, prisma as any);
      },
    };
    if (nome === "@/lib/contratos/aoVivoServidor") return { nomesDosCentros: async (_db: unknown, ccus: string[]) => {
      chamadas.nomes.push([...ccus]);
      return new Map(ccus.includes("270") ? [["270", "Contagem - nome da ficha encerrada"]] : []);
    } };
    if (nome === "@/lib/medicao/sincronizar") return { estadoMedicao: async () => proibido("estado"), dispararMedicao: async () => proibido("sincronizacao") };
    if (nome === "@/lib/financeiro/alertas") return { hojeBR: () => { throw new Error("Opcoes nao precisa de periodo financeiro"); } };
    if (nome === "@/lib/medicao/competencia") return { somaMes: () => { throw new Error("Opcoes nao calcula serie mensal"); } };
    if (nome === "@/lib/medicao/consolidado") return { normalizarPeriodoConsolidado: () => { throw new Error("Opcoes nao normaliza periodo"); } };
    throw new Error(`Dependencia nao esperada nas opcoes locais: ${nome}`);
  };
  const moduloRota = { exports: {} as { GET: (req: Request) => Promise<Response> } };
  runInNewContext(codigoRota, { URL, exports: moduloRota.exports, module: moduloRota, require: mockRequire });
  return {
    GET: (query = "opcoes=1") => moduloRota.exports.GET(new Request(`https://local.test/api/medicao?${query}`, { headers: { cookie: "visao_ccus=230" } })),
    chamadas,
  };
}

test("opcoes de medicao exige sessao e modulo antes de consultar banco", async () => {
  const anonimo = rota({ autenticado: false });
  assert.equal((await anonimo.GET()).status, 401);
  assert.equal(anonimo.chamadas.modulo, 0);
  const negado = rota({ modulo: false });
  assert.equal((await negado.GET()).status, 403);
  for (const caso of [anonimo, negado]) {
    assert.equal(caso.chamadas.usuario, 0);
    assert.equal(caso.chamadas.acompanhamento, 0);
    assert.equal(caso.chamadas.referencias, 0);
    assert.deepEqual(caso.chamadas.nomes, []);
  }
});

test("opcoes deduplica CCU sem ficha, usa nome cadastrado e nao retorna valores financeiros", async () => {
  const local = rota();
  const response = await local.GET();
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const body = await response.json();
  assert.deepEqual(Object.keys(body), ["contratos"]);
  assert.deepEqual(body.contratos, [
    { codccu: "440", nome: "CEMIG 8503 - OS 009" },
    { codccu: "270", nome: "Contagem - nome da ficha encerrada" },
    { codccu: "450", nome: "Contrato da equipe" },
  ]);
  assert.doesNotMatch(JSON.stringify(body), /valor|83900|numCtr|codccusItens|990/);
});

test("opcoes ignora cookie sem ampliar ACL financeira e retira fora dos resultados", async () => {
  const local = rota({ excluidos: ["270"] });
  const body = await (await local.GET("opcoes=1&acompanhamento=todos&ignorarSelecao=0")).json();
  // Cookie pede 230 sem acesso; 999 foi liberado so' em PROJETOS; equipe 450 e financeiro 440 permanecem.
  assert.deepEqual(body.contratos.map((c: { codccu: string }) => c.codccu), ["440", "450"]);
  assert.deepEqual(local.chamadas.nomes[0].sort(), ["440", "450"]);
});

test("ADMIN continua excluindo fora dos resultados e aceita fallback sem ficha ou nome", async () => {
  const body = await (await rota({ role: "ADMIN", excluidos: ["270"] }).GET()).json();
  const porCcu = new Map(body.contratos.map((c: { codccu: string; nome: string }) => [c.codccu, c.nome]));
  assert.equal(porCcu.has("270"), false);
  assert.equal(porCcu.get("440"), "CEMIG 8503 - OS 009");
  assert.equal(porCcu.get("460"), "CC 460");
  assert.equal(porCcu.has(""), false);
  assert.equal(porCcu.has(null), false);
  assert.equal(porCcu.size, 5);
});

test("opcoes sem ACL ou sem dados retorna lista vazia sem estado, itens, linhas ou Senior", async () => {
  for (const opcoes of [{ semAcesso: true }, { vazia: true }, {}]) {
    const local = rota(opcoes);
    const body = await (await local.GET()).json();
    if (opcoes.semAcesso || opcoes.vazia) assert.deepEqual(body, { contratos: [] });
    assert.equal(local.chamadas.estado, 0);
    assert.equal(local.chamadas.sincronizacao, 0);
    assert.equal(local.chamadas.itens, 0);
    assert.equal(local.chamadas.linhas, 0);
    assert.equal(local.chamadas.referencias, 1);
  }
});
