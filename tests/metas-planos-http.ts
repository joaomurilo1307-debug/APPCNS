// Integração real apenas na base isolada de Metas. Nunca usa cadastros reais nem ERP.
import assert from "node:assert/strict";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const url = new URL(process.env.DATABASE_URL ?? "");
const metasLocal = url.hostname === "127.0.0.1" && url.port === "55439" && url.pathname === "/consominas_metas_homologacao";
const homologacaoPadrao = ["localhost", "127.0.0.1"].includes(url.hostname) && ["", "5432", "55439"].includes(url.port) && url.pathname === "/consominas_gestao_itau_homologacao";
assert.ok(metasLocal || homologacaoPadrao, "Testes permitidos somente nos dois bancos locais exclusivos de homologação.");
assert.equal(process.env.APP_ENV, "homologacao");
const base = process.env.TEST_BASE_URL ?? (metasLocal ? "http://localhost:3018" : "http://localhost:3001");
assert.ok((metasLocal ? ["http://localhost:3018", "http://127.0.0.1:3018"] : ["http://localhost:3001", "http://127.0.0.1:3001"]).includes(base));
const db = new PrismaClient();
const stamp = Date.now().toString(), prefix = `METAS-TESTE-${stamp}`;
const metaIds: string[] = [], projectIds: string[] = [], teamIds: string[] = [], userIds: string[] = [];
const ccu = "96" + stamp.slice(-8);
const deniedCcu = "95" + stamp.slice(-8);
let syncId: string | null = null, scenarios = 0;
type Response = { status: number; data: any };
type Client = { request(path: string, body?: unknown, method?: string): Promise<Response> };

function client(): Client {
  const cookies = new Map<string, string>();
  return { async request(path, body, method) {
    const response = await fetch(base + path, { signal: AbortSignal.timeout(180000), redirect: "manual", method: method ?? (body === undefined ? "GET" : "POST"), headers: { Cookie: [...cookies].map(([k,v]) => `${k}=${v}`).join("; "), ...(body === undefined ? {} : { "Content-Type": "application/json" }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
    for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], pos = pair.indexOf("="); cookies.set(pair.slice(0,pos), pair.slice(pos+1)); }
    const text = await response.text(); let data: any; try { data = JSON.parse(text); } catch { data = { html: text.slice(0,160) }; }
    return { status: response.status, data };
  } };
}

async function login(email: string, password: string) {
  // Login por HTTP real e cookie NextAuth; não simula getServerSession.
  const cookies = new Map<string,string>();
  const absorb = (response: globalThis.Response) => { for (const cookie of response.headers.getSetCookie()) { const pair = cookie.split(";")[0], pos=pair.indexOf("="); cookies.set(pair.slice(0,pos),pair.slice(pos+1)); } };
  const header = () => [...cookies].map(([k,v])=>`${k}=${v}`).join("; ");
  const csrfResponse = await fetch(base+"/api/auth/csrf", {signal:AbortSignal.timeout(180000)}); absorb(csrfResponse); const csrf=await csrfResponse.json();
  const response = await fetch(base+"/api/auth/callback/credentials", {signal:AbortSignal.timeout(180000),method:"POST",redirect:"manual",headers:{"Content-Type":"application/x-www-form-urlencoded",Cookie:header()},body:new URLSearchParams({csrfToken:csrf.csrfToken,email,password,callbackUrl:base+"/inicio",json:"true"})}); absorb(response); await response.text();
  const c: Client = { async request(path,body,method) { const r=await fetch(base+path,{signal:AbortSignal.timeout(180000),redirect:"manual",method:method??(body===undefined?"GET":"POST"),headers:{Cookie:header(),...(body===undefined?{}:{"Content-Type":"application/json"})},...(body===undefined?{}:{body:JSON.stringify(body)})}); absorb(r); const text=await r.text(); let data:any;try{data=JSON.parse(text)}catch{data={html:text.slice(0,160)}};return {status:r.status,data}; } };
  assert.ok((await c.request("/api/auth/session")).data.user, "Login fictício falhou");
  return c;
}
const pass = (name: string) => { scenarios++; console.log("PASS METAS: "+name); };
const ok = (response: Response, expected=200) => { assert.equal(response.status,expected,JSON.stringify(response.data)); return response.data; };
const manual = { title: prefix+" Reduzir retrabalho", category:"GERAL", kind:"INDICADOR", source:"MANUAL", metricName:"Horas de retrabalho", unit:"horas", baselineValue:100, targetValue:90, direction:"REDUZIR", targetMode:"PERCENTUAL", targetChange:10, evaluationMode:"PERIODICO", frequency:"MENSAL", periodStart:"2026-08",periodEnd:"2026-12" };
async function createMeta(c:Client, body:any) { const data=ok(await c.request("/api/contract-goals",body),201); metaIds.push(data.id); return data.id as string; }
async function createProject(c:Client,name:string,people:string[]=[]) { const data=ok(await c.request("/api/projects",{name,pessoas:people}),201); projectIds.push(data.id); teamIds.push(data.teamId); return data; }

async function main() {
  const anonymous=client();
  const environment=await anonymous.request("/api/homologacao/ambiente");
  assert.equal(environment.status,200,"Servidor não confirmou homologação antes de qualquer escrita");
  assert.deepEqual(environment.data,{ambiente:"homologacao",senior:"SIMULADA",baseTeste:true});
  assert.equal((await anonymous.request("/api/contract-goals")).status,401);
  pass("alvo confirma banco local e ERP simulado; APIs exigem sessão");
  const password=process.env.HOMOLOGACAO_PASSWORD!;
  const admin=await login(process.env.HOMOLOGACAO_LOGIN!,password);
  const adminId=(await admin.request("/api/auth/session")).data.user.id;
  try {
    const hash=await bcrypt.hash(password,10);
    const actor=async(name:string,role:"COLABORADOR"|"VISUALIZADOR"|"GESTOR_PROJETO",grants:any[]=[])=>{const u=await db.user.create({data:{email:`${name}-${stamp}@example.invalid`,name:prefix+" "+name,role,passwordHash:hash,acessosModulo:{create:grants}}});userIds.push(u.id);return u;};
    const member=await actor("membro","COLABORADOR",[{modulo:"custos",permitido:false},{modulo:"medicao",permitido:false}]);
    const outsider=await actor("externo","COLABORADOR");
    const reader=await actor("consulta","VISUALIZADOR",[{modulo:"custos",permitido:false},{modulo:"medicao",permitido:false}]);
    const sourceReader=await actor("fonte-consulta","VISUALIZADOR",[{modulo:"custos",permitido:true,nivel:"VER"},{modulo:"medicao",permitido:false}]);
    const moduleOnly=await actor("fonte-sem-ccu","COLABORADOR",[{modulo:"custos",permitido:true},{modulo:"medicao",permitido:false}]);
    const planOnly=await actor("plano-sem-projetos","COLABORADOR",[{modulo:"metas",permitido:true,nivel:"EDITAR"},{modulo:"projetos",permitido:false},{modulo:"tarefas",permitido:false}]);
    const approver=await actor("gestor-aprovador","GESTOR_PROJETO",[{modulo:"metas",permitido:false},{modulo:"aprovacoes_projetos",permitido:true,nivel:"EDITAR"},{modulo:"custos",permitido:false},{modulo:"medicao",permitido:false}]);
    await db.acessoCentroCusto.createMany({data:[{userId:sourceReader.id,codccu:ccu,area:"FINANCEIRO"},{userId:reader.id,codccu:ccu,area:"FINANCEIRO"}]});
    const collaborator=await login(member.email,password), outside=await login(outsider.email,password), consulta=await login(reader.email,password);
    const consultaFonte=await login(sourceReader.email,password), semCcu=await login(moduleOnly.email,password);
    const planner=await login(planOnly.email,password), designated=await login(approver.email,password);
    const goal=await createMeta(admin,manual);
    const initial=ok(await admin.request("/api/contract-goals/"+goal));
    assert.equal(initial.contrato,null);assert.equal(initial.creatorId,adminId);assert.equal(initial.ownerId,adminId);assert.equal(initial.canAddAction,false);
    assert.equal((await outside.request("/api/contract-goals/"+goal)).status,403);
    assert.equal((await consulta.request("/api/contract-goals",manual)).status,403);
    assert.equal((await admin.request("/api/contract-goals",{...manual,kind:"PLANO",baselineValue:null,targetValue:null,direction:null,unit:null})).status,422);
    assert.equal((await admin.request("/api/contract-goals/"+goal,{operation:"action",title:"Não criar antes de plano"},"PATCH")).status,422);
    pass("meta genérica sem contrato, criador e responsável; ações exigem plano ligado à meta");

    const beforePrepare=await db.project.count();
    const prepared=ok(await admin.request(`/api/contract-goals/${goal}/plan`,{mode:"prepare",name:prefix+" Plano independente",description:"Plano registrado antes de decidir pela conversão em projeto."}));
    assert.equal(prepared.projectId,null);assert.equal(prepared.hasPlan,true);assert.equal(await db.project.count(),beforePrepare);
    const repeatedPrepare=ok(await admin.request(`/api/contract-goals/${goal}/plan`,{mode:"prepare",name:"Não renomear numa repetição"}));assert.equal(repeatedPrepare.standalonePlan.name,prepared.standalonePlan.name);
    for(const [index,title] of [prefix+" Ação planejada 1",prefix+" Ação planejada 2"].entries()) ok(await admin.request(`/api/contract-goals/${goal}`,{operation:"action",title,ownerId:index?adminId:member.id},"PATCH"));
    const standalone=ok(await admin.request(`/api/contract-goals/${goal}`));assert.equal(standalone.actionPlan,null);assert.equal(standalone.actions.length,2);assert.ok(standalone.actions.every((a:any)=>a.taskId===null));assert.equal(standalone.canConvertPlan,true);
    assert.equal(ok(await collaborator.request(`/api/contract-goals/${goal}`)).actions.length,2,"Responsável de ação possui acesso explícito ao plano, sem liberar finanças");
    for(const action of standalone.actions) ok(await admin.request(`/api/contract-goals/${goal}`,{operation:"updateAction",actionId:action.id,status:"CONCLUIDA"},"PATCH"));
    assert.equal(await db.project.count(),beforePrepare);
    const standaloneIds=standalone.actions.map((a:any)=>a.id).sort();
    pass("plano e ações existem sem projeto; preparar é idempotente e a conversão é opcional");

    const planOnlyGoal=await createMeta(planner,{...manual,title:prefix+" Planejar sem Projetos"});
    ok(await planner.request(`/api/contract-goals/${planOnlyGoal}/plan`,{mode:"prepare",name:prefix+" Plano sem licença de Projetos"}));
    ok(await planner.request(`/api/contract-goals/${planOnlyGoal}`,{operation:"action",title:prefix+" Planejar atividade"},"PATCH"));
    const limitedPlan=ok(await planner.request(`/api/contract-goals/${planOnlyGoal}`));assert.equal(limitedPlan.canAddAction,true);assert.equal(limitedPlan.canConvertPlan,false);
    assert.equal((await planner.request(`/api/contract-goals/${planOnlyGoal}/plan`,{mode:"create"})).status,403);assert.equal(await db.project.count(),beforePrepare);
    pass("editar Metas permite planejar sem acesso a Projetos; conversão exige permissão própria");

    const plans=await Promise.all(Array.from({length:3},()=>admin.request(`/api/contract-goals/${goal}/plan`,{mode:"create",name:prefix+" Plano",peopleIds:[member.id,reader.id]})));
    plans.forEach(p=>ok(p));const plan=plans[0].data.id;assert.ok(plans.every(p=>p.data.id===plan));
    const planDb=await db.project.findUniqueOrThrow({where:{id:plan}});projectIds.push(plan);teamIds.push(planDb.teamId);
    assert.equal(await db.project.count({where:{actionPlanGoalId:goal}}),1);assert.equal(await db.goal.count({where:{projectId:plan,contractGoalId:goal}}),1);
    assert.deepEqual((await db.task.findMany({where:{projectId:plan},select:{sourceGoalActionId:true}})).map(t=>t.sourceGoalActionId).sort(),standaloneIds);
    const primaryGoal=await db.goal.findUniqueOrThrow({where:{projectId_contractGoalId:{projectId:plan,contractGoalId:goal}}});
    assert.equal((await admin.request(`/api/goals/${primaryGoal.id}`,undefined,"DELETE")).status,409);
    assert.ok(await db.goal.findUnique({where:{id:primaryGoal.id}}));
    assert.equal(ok(await admin.request("/api/contract-goals/"+goal)).actionPlan.id,plan);
    assert.ok(ok(await collaborator.request("/api/contract-goals/"+goal)).projects.some((p:any)=>p.id===plan));
    assert.equal((await outside.request(`/api/contract-goals/${goal}/plan`,{mode:"create",name:"Proibido"})).status,404);
    pass("três criações concorrentes produzem um só plano/projeto e vínculo; equipe vê a mesma meta");

    ok(await admin.request("/api/contract-goals/"+goal,{operation:"action",title:prefix+" Atividade",ownerId:member.id,dueDate:"2026-12-20T12:00:00Z"},"PATCH"));
    const withAction=ok(await admin.request("/api/contract-goals/"+goal));assert.equal(withAction.actions.length,3);const task=withAction.actions.find((a:any)=>a.title===prefix+" Atividade");assert.ok(task);assert.equal(task.projectId,plan);assert.equal(task.taskId,task.id);
    assert.equal(await db.contractGoalAction.count({where:{goalId:goal,migratedAt:{not:null}}}),2);assert.equal(await db.task.count({where:{projectId:plan}}),3);
    ok(await collaborator.request(`/api/tasks/${task.id}`,{status:"FEITO"},"PATCH"));
    const finished=ok(await admin.request("/api/contract-goals/"+goal));assert.equal(finished.actions[0].status,"CONCLUIDA");assert.equal(finished.executionFraction,1);assert.equal(finished.fraction,null);
    ok(await collaborator.request("/api/contract-goals/"+goal,{operation:"updateAction",actionId:task.id,status:"EM_ANDAMENTO"},"PATCH"));
    assert.equal((await db.task.findUniqueOrThrow({where:{id:task.id}})).status,"FAZENDO");
    assert.equal((await consulta.request("/api/contract-goals/"+goal,{operation:"updateAction",actionId:task.id,status:"CONCLUIDA"},"PATCH")).status,403);
    pass("atividade é Task única: edição por Projetos e Metas reflete nas duas visões; execução não atinge indicador");

    ok(await admin.request(`/api/tasks/${task.id}`,{startDate:"2026-12-01T12:00:00Z",dueDate:"2026-12-20T12:00:00Z"},"PATCH"));
    const successor=await db.task.create({data:{projectId:plan,title:prefix+" Sucessora FS",durationDays:2,startDate:new Date("2026-12-21T12:00:00Z"),dueDate:new Date("2026-12-23T12:00:00Z")}});
    ok(await admin.request(`/api/tasks/${successor.id}/dependencies`,{predecessorId:task.id,type:"FS",lagDays:0}),201);
    ok(await admin.request("/api/contract-goals/"+goal,{operation:"updateAction",actionId:task.id,status:"EM_ANDAMENTO",dueDate:"2026-12-25T12:00:00Z"},"PATCH"));
    assert.equal((await db.task.findUniqueOrThrow({where:{id:task.id}})).durationDays,null,"Duração derivada permanece nula para futuras alterações de prazo por Projetos");
    const movedByMeta=await db.task.findUniqueOrThrow({where:{id:successor.id}});
    assert.equal(movedByMeta.startDate?.toISOString(),"2026-12-25T12:00:00.000Z");assert.equal(movedByMeta.dueDate?.toISOString(),"2026-12-27T12:00:00.000Z");
    ok(await admin.request(`/api/tasks/${task.id}`,{dueDate:"2026-12-27T12:00:00Z"},"PATCH"));
    const movedByTask=await db.task.findUniqueOrThrow({where:{id:successor.id}});
    assert.equal(movedByTask.startDate?.toISOString(),"2026-12-27T12:00:00.000Z");assert.equal(movedByTask.dueDate?.toISOString(),"2026-12-29T12:00:00.000Z");
    assert.equal((await db.task.findUniqueOrThrow({where:{id:task.id}})).outlookEventId,null,"Usuários fictícios não possuem Outlook conectado");
    pass("alterar prazo pela Meta reprograma dependência FS com a mesma regra de Projetos, sem Outlook real");

    const auditBefore=await db.auditLog.count({where:{entityId:goal,action:"META_ALTERADA"}});
    ok(await admin.request("/api/contract-goals/"+goal,{operation:"goal",...manual,title:manual.title+" revisada"},"PATCH"));
    assert.equal(await db.auditLog.count({where:{entityId:goal,action:"META_ALTERADA"}}),auditBefore+1);
    ok(await admin.request("/api/contract-goals/"+goal,{operation:"measurement",value:94,measuredAt:"2026-09-10T12:00:00Z",period:"2026-08"},"PATCH"));
    assert.equal((await admin.request("/api/contract-goals/"+goal,{operation:"goal",...manual,baselineValue:200,targetValue:180},"PATCH")).status,422);
    assert.equal((await admin.request("/api/contract-goals/"+goal,{operation:"measurement",value:0,measuredAt:"2027-01-10T12:00:00Z",period:"2027-01"},"PATCH")).status,422);
    const history=ok(await admin.request("/api/contract-goals/"+goal));assert.equal(history.measurements.length,1);assert.equal(history.evaluation.periods[0].value,94);assert.equal(history.evaluation.periods[1].value,null);
    pass("configuração registra antes/depois e não reinterpreta medição existente; competências vazias permanecem sem dado");

    const existing=await createProject(admin,prefix+" Existente",[member.id]);
    const otherGoal=await createMeta(admin,{...manual,title:prefix+" Outra melhoria"});
    ok(await admin.request(`/api/contract-goals/${otherGoal}/plan`,{mode:"link",projectId:existing.id}));
    assert.equal(ok(await admin.request("/api/contract-goals/"+otherGoal)).actionPlan.id,existing.id);
    const ownProject=await createProject(collaborator,prefix+" Somente do membro");
    assert.equal((await collaborator.request(`/api/projects/${ownProject.id}/goals`,{contractGoalId:goal,title:manual.title})).status,403);
    assert.equal((await collaborator.request(`/api/contract-goals/${goal}/plan`,{mode:"link",projectId:ownProject.id})).status,403);
    ok(await admin.request(`/api/projects/${existing.id}/goals`,{contractGoalId:goal,title:manual.title}),201);
    const additionalGoal=await db.goal.findUniqueOrThrow({where:{projectId_contractGoalId:{projectId:existing.id,contractGoalId:goal}}});
    ok(await admin.request(`/api/goals/${additionalGoal.id}`,undefined,"DELETE"));
    assert.equal(await db.goal.findUnique({where:{id:additionalGoal.id}}),null);
    pass("projeto existente é associado sem cópia; somente leitura da meta não autoriza ampliar seus vínculos");

    const disputedProject=await createProject(admin,prefix+" Projeto disputado");
    const competitors=await Promise.all([createMeta(admin,{...manual,title:prefix+" Meta disputa A"}),createMeta(admin,{...manual,title:prefix+" Meta disputa B"})]);
    const dispute=await Promise.all(competitors.map(id=>admin.request(`/api/contract-goals/${id}/plan`,{mode:"link",projectId:disputedProject.id})));
    assert.deepEqual(dispute.map(r=>r.status).sort(),[200,409]);
    const winner=await db.project.findUniqueOrThrow({where:{id:disputedProject.id}});
    assert.ok(competitors.includes(winner.actionPlanGoalId!));
    assert.equal(await db.goal.count({where:{projectId:disputedProject.id,contractGoalId:{in:competitors}}}),1);
    pass("duas metas disputando um projeto não sobrescrevem o plano principal nem deixam vínculo parcial");

    await db.custoContaFinanceira.createMany({data:[{codccu:ccu,contrato:prefix,contaFinanceira:"PJ",competencia:new Date("2026-08-01T00:00:00Z"),valor:1000},{codccu:ccu,contrato:prefix,contaFinanceira:"PJ",competencia:new Date("2026-09-01T00:00:00Z"),valor:800},{codccu:ccu,contrato:prefix,contaFinanceira:"Operacional",competencia:new Date("2026-08-01T00:00:00Z"),valor:200},{codccu:deniedCcu,contrato:prefix+" não autorizado",contaFinanceira:"Conta não autorizada",competencia:new Date("2026-08-01T00:00:00Z"),valor:555}]});
    syncId=(await db.atualizacaoCusto.create({data:{status:"OK",finalizadoEm:new Date(),disparadoPor:prefix}})).id;
    const financialBody={...manual,title:prefix+" Custo PJ",source:"CUSTO",sourceCcu:ccu,sourceAccount:"PJ",category:"CUSTO",unit:"R$",baselineValue:1000,targetValue:900};
    const financialGoal=await createMeta(admin,financialBody);
    const fplan=ok(await admin.request(`/api/contract-goals/${financialGoal}/plan`,{mode:"create",name:prefix+" Plano financeiro",peopleIds:[member.id]}));projectIds.push(fplan.id);teamIds.push((await db.project.findUniqueOrThrow({where:{id:fplan.id}})).teamId);
    const permitted=ok(await admin.request("/api/contract-goals/"+financialGoal));assert.equal(permitted.evaluation.periods[0].value,1000);assert.equal(permitted.evaluation.periods[1].value,800);
    const denied=ok(await collaborator.request("/api/contract-goals/"+financialGoal));
    assert.equal(denied.baselineValue,null);assert.equal(denied.targetValue,null);assert.equal(denied.targetChange,null);assert.equal(denied.tolerance,null);assert.equal(denied.currentValue,null);assert.equal(denied.fraction,null);assert.deepEqual(denied.measurements,[]);assert.ok(denied.evaluation.periods.every((p:any)=>p.value===null&&p.target===null&&p.progress===null));
    const projectFinancial=ok(await collaborator.request(`/api/projects/${fplan.id}/goals`))[0];assert.equal(projectFinancial.targetValue,null);assert.equal(projectFinancial.contractGoal.currentValue,null);
    assert.equal((await collaborator.request("/api/contract-goals",financialBody)).status,403);
    assert.equal((await collaborator.request("/api/contract-goals/preview",{source:"CUSTO",sourceCcu:ccu,periodStart:"2026-08",periodEnd:"2026-08"})).status,403);
    pass("fonte por CCU/conta avalia períodos; vínculo a projeto não revela base, alvo, valores ou histórico financeiro");

    const options=ok(await consultaFonte.request("/api/contract-goals/source-options"));
    assert.deepEqual(options.ccus.map((c:any)=>c.codccu),[ccu]);assert.deepEqual(options.accounts,[]);assert.equal(options.sources.CUSTO,true);assert.equal(options.sources.MEDICAO,false);
    const accountOptions=ok(await consultaFonte.request("/api/contract-goals/source-options?codccu="+ccu));assert.deepEqual(accountOptions.accounts,["Operacional","PJ"]);assert.ok(accountOptions.ccus.every((c:any)=>c.codccu===ccu));
    const beforePreview=await Promise.all([db.contractGoal.count(),db.project.count(),db.contractGoalMeasurement.count()]);
    const previewBody={source:"CUSTO",sourceCcu:ccu,sourceAccount:"PJ",periodStart:"2026-08",periodEnd:"2026-08"};
    const preview=ok(await consultaFonte.request("/api/contract-goals/preview",previewBody));assert.equal(preview.value,1000);assert.equal(preview.error,null);assert.ok(preview.updatedAt);
    assert.deepEqual(await Promise.all([db.contractGoal.count(),db.project.count(),db.contractGoalMeasurement.count()]),beforePreview,"Prévia de consulta não cria metas, projetos ou medições");
    for(const deniedClient of [collaborator,consulta,semCcu]) {
      const response=await deniedClient.request("/api/contract-goals/preview",previewBody);assert.equal(response.status,403);assert.deepEqual(Object.keys(response.data),["error"]);
      assert.equal((await deniedClient.request("/api/contract-goals/source-options?codccu="+ccu)).status,403);
    }
    assert.equal((await consultaFonte.request("/api/contract-goals/source-options?codccu="+deniedCcu)).status,403);
    assert.equal((await consultaFonte.request("/api/contract-goals/preview",{...previewBody,sourceCcu:deniedCcu})).status,403);
    assert.equal((await consultaFonte.request("/api/contract-goals/preview",{...previewBody,source:"MANUAL"})).status,422);
    pass("opções e prévia respeitam módulo e CCU; consulta retorna a conta exata sem persistir registros; MANUAL é rejeitado");

    const legacy=await db.contractGoal.create({data:{title:prefix+" Legado",kind:"PLANO",category:"GERAL",ownerId:adminId,creatorId:adminId,actions:{create:[{title:prefix+" Ação antiga",ownerId:adminId}]}}});metaIds.push(legacy.id);
    const converted=ok(await admin.request(`/api/contract-goals/${legacy.id}/plan`,{mode:"create",name:prefix+" Conversão"}));projectIds.push(converted.id);teamIds.push((await db.project.findUniqueOrThrow({where:{id:converted.id}})).teamId);
    const migrated=ok(await admin.request("/api/contract-goals/"+legacy.id));assert.equal(migrated.actions.length,1);const migratedTask=migrated.actions[0].id;assert.ok(migrated.actions[0].taskId);
    await db.task.delete({where:{id:migratedTask}});
    assert.equal(ok(await admin.request("/api/contract-goals/"+legacy.id)).actions.length,0);
    ok(await admin.request(`/api/contract-goals/${legacy.id}/plan`,{mode:"create",name:prefix+" Conversão"}));
    assert.equal(await db.task.count({where:{projectId:converted.id}}),0);
    pass("ação legada migra uma vez; remover atividade não ressuscita ação nem duplica em nova tentativa");
    const approvalGoal=await createMeta(admin,{...manual,title:prefix+" Aprovação de execução"});
    ok(await admin.request(`/api/contract-goals/${approvalGoal}/plan`,{mode:"prepare",name:prefix+" Plano para aprovação"}));
    ok(await admin.request(`/api/contract-goals/${approvalGoal}`,{operation:"action",title:prefix+" Entrega para gestor",ownerId:adminId},"PATCH"));
    assert.equal((await admin.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"submit",approverId:adminId})).status,422);
    assert.equal((await admin.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"submit",approverId:approver.id})).status,409);
    const approvalAction=ok(await admin.request(`/api/contract-goals/${approvalGoal}`)).actions[0];
    ok(await admin.request(`/api/contract-goals/${approvalGoal}`,{operation:"updateAction",actionId:approvalAction.id,status:"CONCLUIDA"},"PATCH"));
    ok(await admin.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"submit",approverId:approver.id}));
    assert.equal((await admin.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"approve"})).status,403);
    const designatedView=ok(await designated.request(`/api/contract-goals/${approvalGoal}`));assert.equal(designatedView.canApprovePlan,true);assert.equal(designatedView.fraction,null);assert.equal(designatedView.effectivePlanApprovalStatus,"PENDENTE");
    ok(await designated.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"approve",note:"Entrega fictícia conferida."}));
    const approved=ok(await admin.request(`/api/contract-goals/${approvalGoal}`));assert.equal(approved.effectivePlanApprovalStatus,"APROVADO");assert.equal(approved.executionFraction,1);assert.equal(approved.fraction,null);
    ok(await admin.request(`/api/contract-goals/${approvalGoal}`,{operation:"updateAction",actionId:approvalAction.id,status:"CONCLUIDA",title:prefix+" Entrega revisada"},"PATCH"));
    assert.equal(ok(await admin.request(`/api/contract-goals/${approvalGoal}`)).effectivePlanApprovalStatus,"REAVALIAR");
    ok(await admin.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"submit",approverId:approver.id}));
    ok(await designated.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"reject",note:"Precisa de nova evidência."}));
    assert.equal(ok(await admin.request(`/api/contract-goals/${approvalGoal}`)).effectivePlanApprovalStatus,"REJEITADO");
    const convertedApproval=ok(await admin.request(`/api/contract-goals/${approvalGoal}/plan`,{mode:"create"}));projectIds.push(convertedApproval.id);teamIds.push((await db.project.findUniqueOrThrow({where:{id:convertedApproval.id}})).teamId);
    ok(await admin.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"submit",approverId:approver.id}));
    ok(await designated.request(`/api/contract-goals/${approvalGoal}/plan/approval`,{operation:"approve"}));
    const actualTask=await db.task.findFirstOrThrow({where:{projectId:convertedApproval.id}});
    ok(await admin.request(`/api/tasks/${actualTask.id}`,{status:"FAZENDO"},"PATCH"));
    const reopened=ok(await admin.request(`/api/contract-goals/${approvalGoal}`));assert.equal(reopened.effectivePlanApprovalStatus,"REAVALIAR");assert.equal(reopened.canSubmitPlan,false);assert.equal(reopened.fraction,null);
    pass("plano 100% segue ao gestor designado sem autoaprovação; decisão não fabrica resultado e edição posterior exige reavaliação");

    const modelGoal=await createMeta(admin,{...manual,title:prefix+" Modelo FOR 1.0.50"});
    ok(await admin.request(`/api/contract-goals/${modelGoal}/plan`,{mode:"prepare",name:prefix+" Plano estruturado"}));
    const planDetails={competence:"2026-09",item:"1.2",account:"EPI e EPC",fact:"Consumo acima da referência",correctiveMeasure:"Revisar distribuição",correctiveHow:"Conferir estoque e entregas",preventiveMeasure:"Planejar consumo",preventiveHow:"Conferência mensal",plannedStart:"2026-08-01",originalDueDate:"2026-08-20",replannedDueDate:"2026-08-25",actualCompletion:null,notes:"Preservar a segurança"};
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"action",title:prefix+" Item estruturado",description:"Fornecedor e contexto da linha",ownerId:member.id,dueDate:"2026-08-25T12:00:00.000Z",planDetails},"PATCH"));
    let structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));assert.deepEqual(structured.actions[0].planDetails,planDetails);assert.equal(structured.actionPlan,null);
    const modelAction=structured.actions[0].id;
    assert.equal((await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:modelAction,status:"A_FAZER",planDetails:{...planDetails,actualCompletion:"2026-08-25"}},"PATCH")).status,422);
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:modelAction,status:"EM_ANDAMENTO"},"PATCH"));
    structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));assert.deepEqual(structured.actions[0].planDetails,planDetails,"Mudança só de status não apaga o formulário");
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:modelAction,status:"CONCLUIDA",planDetails:{...planDetails,actualCompletion:"2026-08-25"}},"PATCH"));
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:modelAction,status:"EM_ANDAMENTO"},"PATCH"));
    structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));assert.deepEqual(structured.actions[0].planDetails,planDetails,"Reabrir limpa o realizado anterior e preserva os demais campos");
    const modelProject=ok(await admin.request(`/api/contract-goals/${modelGoal}/plan`,{mode:"create",name:prefix+" Projeto do modelo",peopleIds:[member.id]}));projectIds.push(modelProject.id);teamIds.push((await db.project.findUniqueOrThrow({where:{id:modelProject.id}})).teamId);
    structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));const modelTask=structured.actions[0].id;assert.ok(structured.actions[0].taskId);assert.deepEqual(structured.actions[0].planDetails,planDetails);assert.equal(structured.actions[0].startDate,"2026-08-01T12:00:00.000Z");assert.equal(await db.task.count({where:{projectId:modelProject.id}}),1);
    ok(await admin.request(`/api/tasks/${modelTask}`,{dueDate:"2026-08-28T12:00:00.000Z",status:"FEITO"},"PATCH"));
    structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));assert.equal(structured.actions[0].dueDate,"2026-08-28T12:00:00.000Z");assert.equal(structured.actions[0].planDetails.originalDueDate,"2026-08-20");assert.ok(structured.actions[0].actualEndedAt);
    assert.equal((await collaborator.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:modelTask,status:"CONCLUIDA",planDetails:{...planDetails,fact:"Sem autorização de gestão"}},"PATCH")).status,403);
    pass("formulário do plano preserva fatos, medidas e datas na conversão; prazo e realizado do projeto são canônicos e os campos exigem gestão");

    const nativeTask=await db.task.create({data:{projectId:modelProject.id,title:prefix+" Atividade nativa do projeto",assigneeId:adminId,status:"FEITO"}});
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:nativeTask.id,status:"CONCLUIDA",planDetails:{fact:"Criada no projeto",correctiveMeasure:"Acompanhar resultado",notes:"Registro de contexto"}},"PATCH"));
    structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));assert.equal(structured.actions.length,2);assert.equal(structured.actions.find((a:any)=>a.id===nativeTask.id).planDetails.fact,"Criada no projeto");assert.equal(await db.task.count({where:{projectId:modelProject.id}}),2);
    ok(await admin.request(`/api/contract-goals/${modelGoal}/plan/approval`,{operation:"submit",approverId:approver.id}));
    const inbox=ok(await designated.request('/api/contract-goals/approvals')).plans.find((p:any)=>p.id===modelGoal);assert.equal(inbox.status,"PENDENTE");assert.equal(inbox.activities.find((a:any)=>a.id===nativeTask.id).planDetails.notes,"Registro de contexto");
    ok(await designated.request(`/api/contract-goals/${modelGoal}/plan/approval`,{operation:"approve"}));
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:nativeTask.id,status:"CONCLUIDA",planDetails:{fact:"Criada no projeto",correctiveMeasure:"Medida revisada",notes:"Registro de contexto"}},"PATCH"));
    structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));assert.equal(structured.effectivePlanApprovalStatus,"REAVALIAR");assert.equal(structured.executionFraction,1);assert.equal(structured.fraction,null);assert.equal(await db.task.count({where:{projectId:modelProject.id}}),2);
    pass("atividade nativa recebe contexto do plano sem duplicar Task; aprovador vê os campos e alterar medida invalida aprovação sem inventar resultado");

    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"action",title:prefix+" Concluída em data informada",ownerId:adminId,status:"CONCLUIDA",planDetails:{actualCompletion:"2026-08-02"}},"PATCH"));
    let datedTask=await db.task.findFirstOrThrow({where:{projectId:modelProject.id,title:prefix+" Concluída em data informada"}});assert.ok(datedTask.actualStartedAt!<=datedTask.actualEndedAt!);assert.equal(datedTask.actualEndedAt!.toISOString(),"2026-08-02T12:00:00.000Z");
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"action",title:prefix+" Concluir depois pelo plano",ownerId:adminId,status:"A_FAZER",planDetails:{}},"PATCH"));
    const newDatedTask=await db.task.findFirstOrThrow({where:{projectId:modelProject.id,title:prefix+" Concluir depois pelo plano"}});
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:newDatedTask.id,status:"CONCLUIDA",planDetails:{actualCompletion:"2026-08-03"}},"PATCH"));
    datedTask=await db.task.findUniqueOrThrow({where:{id:newDatedTask.id}});assert.ok(datedTask.actualStartedAt!<=datedTask.actualEndedAt!);assert.equal(datedTask.actualEndedAt!.toISOString(),"2026-08-03T12:00:00.000Z");
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:newDatedTask.id,status:"EM_ANDAMENTO"},"PATCH"));
    structured=ok(await admin.request(`/api/contract-goals/${modelGoal}`));assert.equal(structured.actions.find((a:any)=>a.id===newDatedTask.id).actualEndedAt,null);
    const startedTask=await db.task.create({data:{projectId:modelProject.id,title:prefix+" Início real registrado",assigneeId:adminId,status:"FAZENDO",actualStartedAt:new Date("2026-08-04T18:30:00.000Z")}});
    assert.equal((await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:startedTask.id,status:"CONCLUIDA",planDetails:{actualCompletion:"2026-08-03"}},"PATCH")).status,422);
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:startedTask.id,status:"CONCLUIDA",planDetails:{actualCompletion:"2026-08-04"}},"PATCH"));
    datedTask=await db.task.findUniqueOrThrow({where:{id:startedTask.id}});assert.equal(datedTask.actualEndedAt!.toISOString(),"2026-08-04T18:30:00.000Z");
    pass("datas realizadas informadas não geram início posterior ao fim e reabrir atividade remove o realizado canônico");

    const scheduleAnchor=await db.task.create({data:{projectId:modelProject.id,title:prefix+" Âncora de cronograma",assigneeId:adminId,startDate:new Date("2026-08-01T12:00:00.000Z"),dueDate:new Date("2026-08-02T12:00:00.000Z"),durationDays:1}});
    const scheduleNative=await db.task.create({data:{projectId:modelProject.id,title:prefix+" Item nativo com duração",assigneeId:adminId,startDate:new Date("2026-08-01T12:00:00.000Z"),dueDate:new Date("2026-08-06T12:00:00.000Z"),durationDays:5}});
    await db.taskDependency.create({data:{predecessorId:scheduleAnchor.id,successorId:scheduleNative.id,type:"FS",lagDays:0}});
    const scheduleDetails={plannedStart:"2026-08-02",originalDueDate:"2026-08-06",replannedDueDate:"2026-08-10",fact:"Revisão do prazo"};
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:scheduleNative.id,status:"A_FAZER",dueDate:"2026-08-10T12:00:00.000Z",planDetails:scheduleDetails},"PATCH"));
    let scheduled=await db.task.findUniqueOrThrow({where:{id:scheduleNative.id}});assert.equal(scheduled.durationDays,8,"A duração segue fim menos início, sem acrescentar um dia");assert.equal(scheduled.startDate!.toISOString(),"2026-08-02T12:00:00.000Z");assert.equal(scheduled.dueDate!.toISOString(),"2026-08-10T12:00:00.000Z","Duração antiga5 não pode sobrescrever prazo novo de8dias");
    await db.task.update({where:{id:scheduleNative.id},data:{startDate:new Date("2026-08-02T00:00:00.000Z"),dueDate:new Date("2026-08-10T00:00:00.000Z")}});
    const untouchedTask=await db.task.create({data:{projectId:modelProject.id,title:prefix+" Outro item não editado",assigneeId:adminId,startDate:new Date("2026-08-10T12:00:00.000Z"),dueDate:new Date("2026-08-15T12:00:00.000Z"),durationDays:5}});
    await db.taskDependency.create({data:{predecessorId:scheduleAnchor.id,successorId:untouchedTask.id,type:"FS",lagDays:0}});
    ok(await admin.request(`/api/contract-goals/${modelGoal}`,{operation:"updateAction",actionId:scheduleNative.id,status:"A_FAZER",dueDate:"2026-08-10T12:00:00.000Z",planDetails:{...scheduleDetails,fact:"Somente análise do contexto foi corrigida"}},"PATCH"));
    scheduled=await db.task.findUniqueOrThrow({where:{id:scheduleNative.id}});assert.equal(scheduled.durationDays,8);assert.equal(scheduled.startDate!.toISOString(),"2026-08-02T00:00:00.000Z");assert.equal(scheduled.dueDate!.toISOString(),"2026-08-10T00:00:00.000Z","O formulário sem horário não muda a hora canônica ao salvar o mesmo dia");
    const untouched=await db.task.findUniqueOrThrow({where:{id:untouchedTask.id}});assert.equal(untouched.startDate!.toISOString(),untouchedTask.startDate!.toISOString());assert.equal(untouched.dueDate!.toISOString(),untouchedTask.dueDate!.toISOString(),"Editar só o contexto não reprograma o projeto");
    pass("datas do formulário atualizam duração nativa antes da rede FS; editar apenas contexto preserva o cronograma");
    console.log(JSON.stringify({passed:scenarios,failed:0,database:url.pathname.slice(1),productionTouched:false}));
  } finally {
    // A guarda acima valida o banco antes de qualquer cadastro ou remoção.
    await db.goal.deleteMany({where:{OR:[{contractGoalId:{in:metaIds}},{projectId:{in:projectIds}}]}});
    await db.project.deleteMany({where:{id:{in:projectIds}}});
    await db.contractGoal.deleteMany({where:{id:{in:metaIds}}});
    await db.team.deleteMany({where:{id:{in:teamIds}}});
    await db.custoContaFinanceira.deleteMany({where:{codccu:{in:[ccu,deniedCcu]}}});
    if(syncId)await db.atualizacaoCusto.delete({where:{id:syncId}});
    await db.auditLog.deleteMany({where:{OR:[{entityId:{in:metaIds}},{userId:{in:userIds}}]}});
    await db.user.deleteMany({where:{id:{in:userIds}}});
  }
}
main().catch(error=>{console.error(error);process.exitCode=1}).finally(()=>db.$disconnect());
