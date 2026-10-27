// Metas de setor: apenas banco e contas fictícias da homologação local.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "");
assert.ok(["localhost", "127.0.0.1"].includes(url.hostname));
const metasLocal = url.pathname === "/consominas_metas_homologacao" && url.port === "55439";
const financeiroLocal = url.pathname === "/consominas_gestao_itau_homologacao" && ["5432", "55439"].includes(url.port || "5432");
assert.ok(metasLocal || financeiroLocal, "Somente bancos locais fictícios expressamente permitidos.");
assert.equal(process.env.APP_ENV, "homologacao");
const base = process.env.TEST_BASE_URL ?? (metasLocal ? "http://localhost:3018" : "http://localhost:3001");
assert.ok((metasLocal ? ["http://localhost:3018", "http://127.0.0.1:3018"] : ["http://localhost:3001", "http://127.0.0.1:3001"]).includes(base));
const db = new PrismaClient(), prefix = "SETOR-TESTE-" + Date.now();
const parentIds: string[] = [], childIds: string[] = [], projectIds: string[] = [], users: string[] = [];
const costCcu = "93" + Date.now().toString().slice(-8);
let syncId: string | undefined, passed = 0;
type Result = { status: number; data: any };
function client() {
  const cookies = new Map<string, string>();
  return { async request(path: string, body?: unknown, method?: string): Promise<Result> {
    const response = await fetch(base + path, { method: method ?? (body === undefined ? "GET" : "POST"), headers: { Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; "), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, body: body === undefined ? undefined : JSON.stringify(body), redirect: "manual", signal: AbortSignal.timeout(path === "/api/homologacao/ambiente" ? 90000 : 60000) });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], index = pair.indexOf("="); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    const text = await response.text(); let data: any; try { data = JSON.parse(text); } catch { data = { html: text.slice(0, 80) }; }
    return { status: response.status, data };
  }, async login(email: string, password: string) {
    const csrf = await this.request("/api/auth/csrf");
    const response = await fetch(base + "/api/auth/callback/credentials", { method: "POST", redirect: "manual", headers: { "Content-Type": "application/x-www-form-urlencoded", Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join("; ") }, body: new URLSearchParams({ csrfToken: csrf.data.csrfToken, email, password, callbackUrl: base + "/contratos", json: "true" }) });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], index = pair.indexOf("="); cookies.set(pair.slice(0, index), pair.slice(index + 1)); }
    assert.ok((await this.request("/api/auth/session")).data.user, "Login fictício falhou.");
  } };
}
const success = (text: string) => { passed++; console.log("PASS SETOR: " + text); };

async function main() {
  const admin = client();
  assert.deepEqual((await admin.request("/api/homologacao/ambiente")).data, { ambiente: "homologacao", senior: "SIMULADA", baseTeste: true });
  await admin.login(process.env.HOMOLOGACAO_LOGIN!, process.env.HOMOLOGACAO_PASSWORD!);
  const reader = await db.user.create({ data: { name: prefix + " leitor", email: prefix.toLowerCase() + "@example.invalid", role: "COLABORADOR", passwordHash: await bcrypt.hash(process.env.HOMOLOGACAO_PASSWORD!, 10) } }); users.push(reader.id);
  const outside = client(); await outside.login(reader.email, process.env.HOMOLOGACAO_PASSWORD!);
  const global = async (name: string, assigned = false) => {
    const response = await admin.request("/api/goals", { title: prefix + " " + name, targetValue: 100, unit: "pontos", ...(assigned ? { assignedUserIds: [reader.id] } : {}) });
    assert.equal(response.status, 201, JSON.stringify(response.data)); parentIds.push(response.data.id); return response.data.id as string;
  };
  const child = async (parentGoalId: string, weight: number, name: string, extra: Record<string, unknown> = {}) => {
    const response = await admin.request("/api/contract-goals", { title: prefix + " " + name, category: "GERAL", kind: "INDICADOR", source: "MANUAL", unit: "quantidade", baselineValue: 100, targetValue: 80, direction: "REDUZIR", parentGoalId, contributionWeight: weight, ...extra });
    if (response.status === 201) childIds.push(response.data.id); return response;
  };
  const parent = await global("meta do setor");
  assert.ok(!(await outside.request("/api/sector-goals")).data.goals.some((goal: any) => goal.id === parent));
  assert.equal((await outside.request("/api/goals/" + parent)).status, 403);
  success("metas de setor não atribuídas não aparecem nas opções nem no detalhe");
  const a = await child(parent, 80, "EPI"); assert.equal(a.status, 201, JSON.stringify(a.data));
  const b = await child(parent, 20, "faltas"); assert.equal(b.status, 201, JSON.stringify(b.data));
  assert.ok([409, 422].includes((await child(parent, 1, "peso excedente")).status));
  assert.equal((await child(parent, 0, "peso inválido")).status, 422);
  success("pesos80/20 aceitos e excesso/zero recusados sem criar meta parcial");
  for (const [id, value] of [[a.data.id, 90], [b.data.id, 80]] as const) assert.equal((await admin.request("/api/contract-goals/" + id, { operation: "measurement", value, measuredAt: "2026-09-30T12:00:00.000Z", period: "2026-09" }, "PATCH")).status, 200);
  let summary = (await admin.request("/api/sector-goals")).data.goals.find((goal: any) => goal.id === parent);
  assert.equal(summary.configuredWeight, 100); assert.ok(Math.abs(summary.weightedFraction - 0.6) < 1e-7);
  assert.ok(Math.abs((await admin.request("/api/goals/" + parent)).data.computedCurrentValue - 60) < 1e-7);
  success("indicadores diferentes compõem60% da meta global com os pesos corretos");
  assert.equal((await admin.request(`/api/contract-goals/${a.data.id}/plan`, { mode: "prepare", name: prefix + " plano" })).status, 200);
  const project = await admin.request(`/api/contract-goals/${a.data.id}/plan`, { mode: "create", name: prefix + " projeto" }); assert.equal(project.status, 200, JSON.stringify(project.data)); projectIds.push(project.data.projectId);
  assert.equal((await admin.request(`/api/contract-goals/${a.data.id}`, { operation: "action", title: prefix + " executar melhoria" }, "PATCH")).status, 200);
  const activity = (await admin.request(`/api/contract-goals/${a.data.id}`)).data.actions[0];
  assert.equal((await admin.request(`/api/contract-goals/${a.data.id}`, { operation: "updateAction", actionId: activity.id, status: "CONCLUIDA" }, "PATCH")).status, 200);
  // Estado fictício para comprovar que nem aprovação nem100% de execução substituem o indicador.
  // O comando de aprovação em si é exercitado pela suíte de planos de ação.
  await db.contractGoal.update({ where: { id: a.data.id }, data: { planApprovalStatus: "APROVADO", planApprovedAt: new Date() } });
  const completedPlan = (await admin.request(`/api/contract-goals/${a.data.id}`)).data;
  assert.equal(completedPlan.executionFraction, 1); assert.equal(completedPlan.fraction, 0.5);
  const extraProject = await admin.request("/api/projects", { name: prefix + " contribuição adicional", contractGoalIds: [a.data.id] }); assert.equal(extraProject.status, 201, JSON.stringify(extraProject.data)); projectIds.push(extraProject.data.id);
  summary = (await admin.request("/api/sector-goals")).data.goals.find((goal: any) => goal.id === parent);
  assert.equal(summary.contributionCount, 2); assert.ok(Math.abs(summary.weightedFraction - 0.6) < 1e-7);
  success("referenciar a mesma meta em vários projetos não duplica sua contribuição");
  assert.equal((await admin.request("/api/goals/" + parent, undefined, "DELETE")).status, 409);
  assert.equal((await admin.request(`/api/projects/${project.data.projectId}/goals`, { title: prefix + " composição antiga", parentGoalId: parent, targetValue: 100 })).status, 422);
  const legacyChild = await admin.request(`/api/projects/${project.data.projectId}/goals`, { title: prefix + " submeta anterior", targetValue: 100 });
  assert.equal(legacyChild.status, 201, JSON.stringify(legacyChild.data));
  assert.equal((await admin.request("/api/goals/" + legacyChild.data.id, { parentGoalId: parent }, "PATCH")).status, 422);
  assert.equal((await admin.request("/api/goals/" + parent, { currentValue: 100 }, "PATCH")).status, 422);
  success("remoção parcial e mistura com composição legada não quebram os vínculos e pesos existentes");
  const disputedParent = await global("limite concorrente");
  const results = await Promise.all([child(disputedParent, 60, "disputaA"), child(disputedParent, 60, "disputaB")]);
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 422]);
  assert.equal((await db.contractGoal.aggregate({ where: { parentGoalId: disputedParent }, _sum: { contributionWeight: true } }))._sum.contributionWeight, 60);
  success("criação concorrente não ultrapassa100% do peso reservado");
  const protectedParent = await global("fonte protegida", true);
  await db.custoContaFinanceira.create({ data: { codccu: costCcu, contrato: prefix, contaFinanceira: "EPI E EPC", competencia: new Date("2026-09-01T00:00:00Z"), valor: 900 } });
  syncId = (await db.atualizacaoCusto.create({ data: { status: "OK", finalizadoEm: new Date(), disparadoPor: prefix } })).id;
  const financial = await child(protectedParent, 100, "financeira", { source: "CUSTO", sourceCcu: costCcu, sourceAccount: "EPI E EPC", unit: "R$", baselineValue: 1000, targetValue: 800, periodStart: "2026-09", periodEnd: "2026-09" }); assert.equal(financial.status, 201, JSON.stringify(financial.data));
  const financialProject = await admin.request(`/api/contract-goals/${financial.data.id}/plan`, { mode: "create", name: prefix + " financeiro", peopleIds: [reader.id] }); assert.equal(financialProject.status, 200, JSON.stringify(financialProject.data)); projectIds.push(financialProject.data.projectId);
  const protectedSummary = (await outside.request("/api/sector-goals")).data.goals.find((goal: any) => goal.id === protectedParent);
  assert.equal(protectedSummary.weightedFraction, null); assert.equal(protectedSummary.unevaluatedWeight, 100);
  assert.equal(protectedSummary.contributions[0].fraction, null); assert.equal(protectedSummary.contributions[0].weightedFraction, null);
  const canonical = (await outside.request("/api/contract-goals/" + financial.data.id)).data;
  assert.equal(canonical.baselineValue, null); assert.equal(canonical.targetValue, null); assert.equal(canonical.currentValue, null);
  success("meta global não amplia o acesso financeiro nem transforma fonte negada em zero");
  console.log(JSON.stringify({ passed, failed: 0, productionTouched: false }));
}

main().catch((error) => { console.error(error.message); process.exitCode = 1; }).finally(async () => {
  const teams = await db.project.findMany({ where: { id: { in: projectIds } }, select: { teamId: true } });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.contractGoal.deleteMany({ where: { id: { in: childIds } } });
  await db.goal.deleteMany({ where: { id: { in: parentIds } } });
  await db.team.deleteMany({ where: { id: { in: teams.map((team) => team.teamId) } } });
  await db.user.deleteMany({ where: { id: { in: users } } });
  await db.custoContaFinanceira.deleteMany({ where: { codccu: costCcu } });
  if (syncId) await db.atualizacaoCusto.delete({ where: { id: syncId } });
  await db.auditLog.deleteMany({ where: { entityType: "ContractGoal", entityId: { in: childIds } } });
  await db.$disconnect();
});
