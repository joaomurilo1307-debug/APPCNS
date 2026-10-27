// Rotas reais em banco EXCLUSIVO da homologacao; nunca executa contra producao ou ERP real.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname) && url.pathname === "/consominas_gestao_itau_homologacao");
assert.equal(process.env.APP_ENV, "homologacao");
const base = "http://localhost:3001";
const db = new PrismaClient();
const stamp = Date.now().toString();
const ccus = ["98" + stamp.slice(-8), "97" + stamp.slice(-8)];
const projectIds: string[] = [], userIds: string[] = [], contratoIds: string[] = [];
let teamId: string | undefined, planTeamId: string | undefined, syncId: string | undefined, cenarios = 0;
type Client = { cookies: Map<string, string>; request: (path: string, body?: unknown, method?: string) => Promise<{ status: number; data: any }> };
function client(): Client {
  const cookies = new Map<string, string>();
  return { cookies, async request(path, body, method) {
    const response = await fetch(base + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { Cookie: [...cookies].map(([k, v]) => `${k}=${v}`).join("; "), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual" });
    for (const item of response.headers.getSetCookie()) { const pair = item.split(";")[0], pos = pair.indexOf("="); cookies.set(pair.slice(0, pos), pair.slice(pos + 1)); }
    const text = await response.text(); let data: any; try { data = JSON.parse(text); } catch { data = { html: text.slice(0, 120) }; }
    return { status: response.status, data };
  } };
}
async function login(email: string, password: string) {
  const c = client(), csrf = await c.request("/api/auth/csrf");
  const response = await fetch(base + "/api/auth/callback/credentials", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: [...c.cookies].map(([k, v]) => `${k}=${v}`).join("; ") }, body: new URLSearchParams({ csrfToken: csrf.data.csrfToken, email, password, callbackUrl: base + "/inicio", json: "true" }) });
  for (const item of response.headers.getSetCookie()) { const pair = item.split(";")[0], pos = pair.indexOf("="); c.cookies.set(pair.slice(0, pos), pair.slice(pos + 1)); }
  assert.ok((await c.request("/api/auth/session")).data.user, "Login ficticio falhou");
  return c;
}
function passou(texto: string) { cenarios++; console.log("PASS CONTRATOS: " + texto); }
async function main() {
  const anonimo = client(), ambiente = await anonimo.request("/api/homologacao/ambiente");
  assert.equal(ambiente.status, 200, "Servidor nao confirmou homologacao local");
  assert.deepEqual(ambiente.data, { ambiente: "homologacao", senior: "SIMULADA", baseTeste: true }, "Alvo nao confirmou isolamento; nenhuma escrita permitida");
  assert.equal((await anonimo.request("/api/contract-goals")).status, 401);
  passou("API de metas exige sessao e o teste confirma banco isolado");
  const admin = await login(process.env.HOMOLOGACAO_LOGIN!, process.env.HOMOLOGACAO_PASSWORD!);
  const adminId = (await admin.request("/api/auth/session")).data.user.id;
  try {
    for (const [i, codccu] of ccus.entries()) {
      const contrato = await db.contrato.create({ data: { codccu, nome: `CONTRATO FICTICIO ${stamp}-${i}`, status: i ? "ENCERRADO" : "ATIVO" } });
      contratoIds.push(contrato.id); assert.equal(contrato.acompanharResultados, true);
      await db.custoContaFinanceira.create({ data: { codccu, contrato: contrato.nome, contaFinanceira: "Combustível", competencia: new Date("2026-08-01T00:00:00Z"), valor: i ? 200 : 1000 } });
    }
    syncId = (await db.atualizacaoCusto.create({ data: { status: "OK", finalizadoEm: new Date(), disparadoPor: "HOMOLOGACAO-CONTRATOS-" + stamp } })).id;
    teamId = (await db.team.create({ data: { name: "EQUIPE FICTICIA " + stamp, codccu: ccus[0] } })).id;
    const password = process.env.HOMOLOGACAO_PASSWORD!;
    const reader = await db.user.create({ data: { email: `consulta-${stamp}@example.invalid`, name: "CONSULTA FICTICIA", role: "VISUALIZADOR", passwordHash: await bcrypt.hash(password, 10), acessosCentroCusto: { create: { codccu: ccus[0], area: "AMBOS" } } } });
    userIds.push(reader.id);
    const outsider = await db.user.create({ data: { email: `fora-${stamp}@example.invalid`, name: "SEM CCU FICTICIO", role: "COLABORADOR", passwordHash: await bcrypt.hash(password, 10) } });
    userIds.push(outsider.id);
    const consulta = await login(reader.email, password), semAcesso = await login(outsider.email, password);
    const listaInicial = await admin.request("/api/contratos?opcoes=1");
    assert.ok(ccus.every((ccu) => listaInicial.data.contratos.some((c: any) => c.codccu === ccu)));
    passou("Novos contratos ativos e encerrados comecam incluidos por padrao");

    const indicador = { codccu: ccus[0], kind: "INDICADOR", title: "Reduzir glosa ficticia", category: "GLOSA", unit: "%", baselineValue: 10, targetValue: 5, direction: "REDUZIR", source: "MANUAL", ownerId: adminId };
    const criado = await admin.request("/api/contract-goals", indicador); assert.equal(criado.status, 201, JSON.stringify(criado.data));
    const goalId = criado.data.id;
    assert.equal((await semAcesso.request("/api/contract-goals/" + goalId)).status, 403);
    assert.equal((await consulta.request("/api/contract-goals/" + goalId, { operation: "measurement", value: 7.5, measuredAt: new Date().toISOString() }, "PATCH")).status, 403);
    assert.equal((await admin.request("/api/contract-goals", { ...indicador, targetValue: 15 })).status, 422);
    passou("CCU e consulta impedem escrita; direcao incoerente e rejeitada");
    const plano = await admin.request("/api/contract-goals", { codccu: ccus[0], kind: "PLANO", title: "Melhorar acompanhamento do contrato", category: "GERAL", source: "MANUAL", ownerId: adminId });
    assert.equal(plano.status, 422, "Planos novos devem executar uma meta, sem criar outra iniciativa solta.");
    // Fixture de compatibilidade: representa um plano gravado antes da evolução do módulo.
    const planoLegado = await db.contractGoal.create({ data: { contratoId: contratoIds[0], kind: "PLANO", title: "Plano anterior fictício", category: "GERAL", source: "MANUAL", ownerId: adminId } });
    const planoId = planoLegado.id;
    const livre = await admin.request("/api/contract-goals/" + planoId);
    assert.equal(livre.data.baselineValue, null); assert.equal(livre.data.targetValue, null); assert.equal(livre.data.fraction, null);
    assert.equal((await admin.request("/api/contract-goals/" + planoId, { operation: "measurement", value: 50, measuredAt: new Date().toISOString() }, "PATCH")).status, 422);
    passou("Novo plano solto é recusado; plano legado permanece legível sem inventar resultado financeiro");
    const projetoPlano = await admin.request(`/api/contract-goals/${planoId}/plan`, { mode: "create", name: `PLANO FICTICIO ${stamp}` });
    assert.equal(projetoPlano.status, 200, JSON.stringify(projetoPlano.data));
    projectIds.push(projetoPlano.data.projectId);
    planTeamId = (await db.project.findUniqueOrThrow({ where: { id: projetoPlano.data.projectId } })).teamId;
    for (const title of ["Definir rotina de acompanhamento", "Validar melhoria com a equipe"]) {
      assert.equal((await admin.request("/api/contract-goals/" + planoId, { operation: "action", title, ownerId: adminId }, "PATCH")).status, 200);
    }
    const acoes = await admin.request("/api/contract-goals/" + planoId);
    assert.equal(acoes.data.actions.length, 2);
    assert.equal((await admin.request("/api/contract-goals/" + planoId, { operation: "updateAction", actionId: acoes.data.actions[0].id, status: "CONCLUIDA" }, "PATCH")).status, 200);
    const execucao = await admin.request("/api/contract-goals/" + planoId);
    assert.equal(execucao.data.executionFraction, 0.5); assert.equal(execucao.data.currentValue, null);
    passou("Acoes do plano tem execucao separada do indicador");

    const project = await admin.request("/api/projects", { name: "PROJETO FICTICIO " + stamp, teamId, codccu: ccus[0], contractGoalIds: [goalId, planoId, goalId] });
    assert.equal(project.status, 201, JSON.stringify(project.data)); projectIds.push(project.data.id);
    assert.equal(await db.goal.count({ where: { projectId: project.data.id } }), 2);
    assert.equal((await admin.request(`/api/projects/${project.data.id}/goals`, { contractGoalId: goalId, title: indicador.title })).status, 201);
    assert.equal(await db.goal.count({ where: { projectId: project.data.id } }), 2);
    passou("Novo projeto associa meta e plano sem duplicar vinculos");
    assert.equal((await admin.request("/api/contract-goals/" + goalId, { operation: "measurement", value: 7.5, measuredAt: new Date().toISOString(), period: "2026-08", note: "Afericao ficticia" }, "PATCH")).status, 200);
    const lida = await admin.request("/api/contract-goals/" + goalId), metasProjeto = await admin.request(`/api/projects/${project.data.id}/goals`);
    assert.equal(lida.data.currentValue, 7.5); assert.equal(lida.data.fraction, 0.5); assert.equal(lida.data.measurements.length, 1);
    const vinculada = metasProjeto.data.find((g: any) => g.contractGoalId === goalId);
    assert.equal(vinculada.contractGoal.currentValue, 7.5); assert.equal(vinculada.fraction, 0.5);
    assert.equal((await semAcesso.request("/api/goals/" + vinculada.id)).status, 403);
    passou("Medicao canonica reflete no projeto, guarda historico e nao vaza por API antiga");
    const errada = await admin.request("/api/contract-goals", { ...indicador, codccu: ccus[1], title: "META OUTRO CONTRATO" }); assert.equal(errada.status, 201);
    const quantidade = await db.project.count();
    assert.equal((await admin.request("/api/projects", { name: "NAO DEVE CRIAR", teamId, codccu: ccus[0], contractGoalIds: [errada.data.id] })).status, 422);
    assert.equal(await db.project.count(), quantidade);
    passou("Associacao entre contratos diferentes falha sem criar projeto parcial");
    const automatica = await admin.request("/api/contract-goals", { ...indicador, title: "Custo automatico ficticio", category: "CUSTO", source: "CUSTO", unit: "R$", baselineValue: 1200, targetValue: 900, periodStart: "2026-08", periodEnd: "2026-08" });
    assert.equal(automatica.status, 201, JSON.stringify(automatica.data));
    const custo = await admin.request("/api/contract-goals/" + automatica.data.id);
    assert.equal(custo.data.currentValue, 1000); assert.equal(await db.contractGoalMeasurement.count({ where: { goalId: automatica.data.id } }), 0);
    assert.equal((await admin.request("/api/contract-goals/" + automatica.data.id, { operation: "measurement", value: 1, measuredAt: new Date().toISOString() }, "PATCH")).status, 422);
    passou("Custo automatico le a fonte local e nao cria medicao ou aceita sobrescrita manual");

    assert.equal((await admin.request("/api/contratos/" + ccus[0], { acompanharResultados: false }, "PATCH")).status, 200);
    assert.equal((await db.contrato.findUniqueOrThrow({ where: { codccu: ccus[0] } })).status, "ATIVO");
    assert.ok(!(await admin.request("/api/contratos?opcoes=1")).data.contratos.some((c: any) => c.codccu === ccus[0]));
    assert.ok(!(await admin.request("/api/demandas/opcoes")).data.contratos.some((c: any) => c.codccu === ccus[0]));
    assert.ok(!(await admin.request("/api/custos-conta")).data.contratos.some((c: any) => c.codccu === ccus[0]));
    assert.ok((await admin.request("/api/custos-conta?ccu=" + ccus[0])).data.contratos.some((c: any) => c.codccu === ccus[0]));
    assert.ok((await admin.request("/api/contratos?acompanhamento=todos&ignorarSelecao=1")).data.contratos.some((c: any) => c.codccu === ccus[0]));
    assert.equal((await admin.request("/api/projects", { name: "FORA DOS RESULTADOS", teamId, codccu: ccus[0] })).status, 422);
    assert.equal((await admin.request("/api/contract-goals/" + goalId)).status, 200);
    assert.equal((await db.contrato.findUniqueOrThrow({ where: { codccu: ccus[0] } })).acompanharResultados, false);
    passou("Retirar dos resultados atualiza custos e seletores, preserva historico e impede nova associacao");
    assert.equal((await admin.request("/api/contratos/" + ccus[0], { status: "ENCERRADO", acompanharResultados: true }, "PATCH")).status, 200);
    assert.ok((await admin.request("/api/contratos?opcoes=1")).data.contratos.some((c: any) => c.codccu === ccus[0]));
    assert.equal((await consulta.request("/api/contratos/" + ccus[0])).status, 200);
    assert.equal((await semAcesso.request("/api/contratos/" + ccus[0])).status, 403);
    assert.equal((await consulta.request("/api/contratos/" + ccus[0], { acompanharResultados: false }, "PATCH")).status, 403);
    passou("Contrato encerrado pode ser acompanhado com ACL preservada e controle apenas administrativo");
    console.log(`VALIDADOS CONTRATOS: ${cenarios} cenarios HTTP com NextAuth e Postgres isolado.`);
  } finally {
    await db.project.deleteMany({ where: { id: { in: projectIds } } });
    await db.contractGoal.deleteMany({ where: { contratoId: { in: contratoIds } } });
    await db.auditLog.deleteMany({ where: { entityType: "Contrato", entityId: { in: contratoIds } } });
    await db.custoContaFinanceira.deleteMany({ where: { codccu: { in: ccus } } });
    await db.contrato.deleteMany({ where: { id: { in: contratoIds } } });
    if (teamId) await db.team.delete({ where: { id: teamId } });
    if (planTeamId) await db.team.delete({ where: { id: planTeamId } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    if (syncId) await db.atualizacaoCusto.delete({ where: { id: syncId } });
    await db.$disconnect();
  }
}
main().catch((error) => { console.error(error.message); process.exitCode = 1; });
