import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pessoasValidas } from "@/lib/pessoas";
import { apresentarMetas, contextoMetas, erroFontePermitida, incluirMetaContrato, statusTarefaDaAcao, temPlanoDeAcao } from "@/lib/contractGoals/server";
import { ErroComposicaoSetor, validarVinculoSetor } from "@/lib/contractGoals/sectorGoals";
import { dadosMeta, erroConfiguracao, medicaoMeta, acaoMeta, alterarAcao } from "@/lib/contractGoals/validacao";
import { canManageTeam, canModifyTaskScoped, canViewProject } from "@/lib/permissions";
import { podeEditarModulo } from "@/lib/acesso/servidor";
import { duracaoEntreDatas, rescheduleAndPersist } from "@/lib/reschedule";
import { reconcileTaskOutlook } from "@/lib/taskOutlookSync";
import { Prisma } from "@prisma/client";
import { dataDoItem, diaDoItem, fimRealDoItem, lerDetalhesDoPlano, type DetalhesDoPlano } from "@/lib/contractGoals/planDetails";

const gravarDetalhes = (details: DetalhesDoPlano | null | undefined) => details === undefined ? {} : { planDetails: details === null ? Prisma.DbNull : JSON.parse(JSON.stringify(details)) as Prisma.InputJsonValue };
const datasDaTarefa = (details: DetalhesDoPlano | null | undefined) => ({
  ...(details?.plannedStart !== undefined ? { startDate: dataDoItem(details.plannedStart) } : {}),
  ...(details?.actualCompletion !== undefined ? { actualEndedAt: dataDoItem(details.actualCompletion) } : {}),
});

async function acesso(id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const usuario = session.user as any;
  const meta = await prisma.contractGoal.findUnique({ where: { id }, include: incluirMetaContrato });
  if (!meta) return { error: NextResponse.json({ error: "Meta não encontrada" }, { status: 404 }) };
  const contexto = await contextoMetas(usuario);
  if (!(await contexto.podeVerMeta(meta))) return { error: NextResponse.json({ error: "Sem acesso a esta meta" }, { status: 403 }) };
  return { usuario, meta, contexto };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const [goal] = await apresentarMetas([ctx.meta!], ctx.usuario);
  return NextResponse.json(goal);
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const { usuario, meta, contexto } = ctx;
  const body = await req.json().catch(() => null);
  const gerencia = contexto!.podeGerirMeta(meta!);
  const negado = () => NextResponse.json({ error: "Sem permissão para alterar esta meta ou atividade" }, { status: 403 });
  const invalido = (error = "Revise os campos informados") => NextResponse.json({ error }, { status: 422 });
  const plano = meta!.actionPlan;
  const gerePlano = async () => !!plano && await podeEditarModulo(usuario, "projetos") && await canViewProject(usuario.id, usuario.role, plano.id) && await canManageTeam(usuario.id, usuario.role, plano.teamId);
  if (body?.operation === "updateAction") {
    const parsed = alterarAcao.safeParse(body); if (!parsed.success) return invalido();
    const legacy = await prisma.contractGoalAction.findFirst({ where: { goalId: params.id, OR: [{ id: parsed.data.actionId }, { task: { id: parsed.data.actionId } }] }, include: { task: true } });
    if (legacy?.migratedAt && !legacy.task) return NextResponse.json({ error: "Esta ação já foi transferida para Projetos e sua atividade foi removida." }, { status: 410 });
    const task = legacy?.task ?? (plano ? await prisma.task.findFirst({ where: { id: parsed.data.actionId, projectId: plano.id } }) : null);
    const onlyStatus = Object.keys(body).every((key) => ["operation", "actionId", "status"].includes(key));
    if (parsed.data.ownerId && !(await pessoasValidas([parsed.data.ownerId])).length) return invalido("Responsável inválido.");
    const { operation, actionId, dueDate, planDetails, ...data } = parsed.data;
    if (task || legacy && plano) {
      if (!plano || !(await canViewProject(usuario.id, usuario.role, plano.id)) || !(await podeEditarModulo(usuario, "tarefas"))) return negado();
      if (task ? !(await canModifyTaskScoped(usuario.id, usuario.role, task.assigneeId === usuario.id, task.locked, plano.teamId, plano.id)) : !(await gerePlano())) return negado();
      if (!gerencia && !(await gerePlano()) && !onlyStatus) return negado();
      if (planDetails !== undefined && (!gerencia || !(await gerePlano()))) return negado();
      if (planDetails?.actualCompletion && task?.actualStartedAt && planDetails.actualCompletion < diaDoItem(task.actualStartedAt)!) return invalido("A data realizada não pode anteceder o início real registrado no projeto.");
      const status = statusTarefaDaAcao(data.status);
      if (!status) return invalido("Atividades de projeto não usam a situação Cancelada. Gerencie a atividade na aba Projetos.");
      const taskData = {
        ...(data.title !== undefined ? { title: data.title } : {}), ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.ownerId !== undefined ? { assigneeId: data.ownerId } : {}), ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
        ...datasDaTarefa(planDetails),
        status: status as "A_FAZER" | "FAZENDO" | "BLOQUEADO" | "FEITO",
      };
      if (task) {
        const updated = await prisma.$transaction(async (tx) => {
          await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-plan:" + params.id);
          const currentTask = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
          // O formulário trabalha com dias: salvar o mesmo dia conserva o horário canônico de Projetos.
          const startDate = taskData.startDate === undefined || diaDoItem(taskData.startDate) === diaDoItem(currentTask.startDate) ? currentTask.startDate : taskData.startDate;
          const nextDueDate = taskData.dueDate === undefined || planDetails !== undefined && diaDoItem(taskData.dueDate) === diaDoItem(currentTask.dueDate) ? currentTask.dueDate : taskData.dueDate;
          const mudouCronograma = startDate?.getTime() !== currentTask.startDate?.getTime() || nextDueDate?.getTime() !== currentTask.dueDate?.getTime();
          if (planDetails !== undefined) {
            if (currentTask.sourceGoalActionId) {
              const bridge = await tx.contractGoalAction.findUniqueOrThrow({ where: { id: currentTask.sourceGoalActionId } });
              if (bridge.goalId !== params.id) throw new Error("A atividade pertence ao plano de outra meta.");
              await tx.contractGoalAction.update({ where: { id: bridge.id }, data: gravarDetalhes(planDetails) });
            } else {
              const bridge = await tx.contractGoalAction.create({ data: { goalId: params.id, title: currentTask.title, description: currentTask.description, ownerId: currentTask.assigneeId, dueDate: currentTask.dueDate, status: data.status, migratedAt: new Date(), ...gravarDetalhes(planDetails) } });
              await tx.task.update({ where: { id: currentTask.id }, data: { sourceGoalActionId: bridge.id } });
            }
          }
          let result = await tx.task.update({ where: { id: task.id }, data: { ...taskData,
            ...(taskData.startDate !== undefined ? { startDate } : {}), ...(taskData.dueDate !== undefined ? { dueDate: nextDueDate } : {}),
            ...(mudouCronograma && currentTask.durationDays !== null ? { durationDays: duracaoEntreDatas(startDate, nextDueDate) } : {}),
            ...(planDetails?.actualCompletion !== undefined ? { actualEndedAt: fimRealDoItem(planDetails.actualCompletion, currentTask.actualStartedAt) } : {}),
            ...(currentTask.status !== status && status === "FAZENDO" && !currentTask.actualStartedAt ? { actualStartedAt: new Date() } : {}),
            ...(currentTask.status !== status && status === "FEITO" ? { actualEndedAt: planDetails?.actualCompletion ? fimRealDoItem(planDetails.actualCompletion, currentTask.actualStartedAt) : new Date(), ...(!currentTask.actualStartedAt ? { actualStartedAt: dataDoItem(planDetails?.plannedStart || planDetails?.actualCompletion) ?? new Date() } : {}) } : {}),
            ...(currentTask.status === "FEITO" && status !== "FEITO" ? { actualEndedAt: null } : {}),
          } });
          if (mudouCronograma && result.projectId) {
            await rescheduleAndPersist(tx, result.projectId);
            result = await tx.task.findUniqueOrThrow({ where: { id: task.id } });
          }
          return result;
        });
        if (task.title !== updated.title || task.assigneeId !== updated.assigneeId || task.status !== updated.status || task.dueDate?.getTime() !== updated.dueDate?.getTime()) {
          await reconcileTaskOutlook({ assigneeId: task.assigneeId, outlookEventId: task.outlookEventId }, updated);
        }
      } else if (legacy) {
        const updated = await prisma.$transaction(async (tx) => {
          const result = await tx.task.upsert({ where: { sourceGoalActionId: legacy.id }, update: taskData, create: { sourceGoalActionId: legacy.id, projectId: plano.id, title: data.title ?? legacy.title, description: data.description !== undefined ? data.description : legacy.description, assigneeId: data.ownerId !== undefined ? data.ownerId : legacy.ownerId, dueDate: dueDate !== undefined ? dueDate ? new Date(dueDate) : null : legacy.dueDate, status: taskData.status } });
          await tx.contractGoalAction.update({ where: { id: legacy.id }, data: { migratedAt: new Date(), ...gravarDetalhes(planDetails) } });
          await rescheduleAndPersist(tx, plano.id);
          return tx.task.findUniqueOrThrow({ where: { id: result.id } });
        });
        await reconcileTaskOutlook({ assigneeId: null, outlookEventId: null }, updated);
      }
    } else {
      if (!legacy) return NextResponse.json({ error: "Ação não encontrada nesta meta" }, { status: 404 });
      if (!gerencia && !(contexto!.escrita && legacy.ownerId === usuario.id && onlyStatus)) return negado();
      const changed = await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-plan:" + params.id);
        const current = await tx.contractGoalAction.findUniqueOrThrow({ where: { id: legacy.id }, include: { task: { select: { id: true } } } });
        if (current.task || current.migratedAt) return false;
        const previousDetails = lerDetalhesDoPlano(current.planDetails);
        const details = data.status !== "CONCLUIDA" && (planDetails?.actualCompletion || previousDetails?.actualCompletion) ? { ...(planDetails === undefined ? previousDetails : planDetails), actualCompletion: null } : planDetails;
        await tx.contractGoalAction.update({ where: { id: legacy.id }, data: { ...data, ...gravarDetalhes(details), ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}) } });
        return true;
      });
      if (!changed) return NextResponse.json({ error: "O plano foi convertido em projeto durante a edição. Recarregue para alterar a atividade compartilhada." }, { status: 409 });
    }
  } else if (body?.operation === "action") {
    const parsed = acaoMeta.safeParse(body); if (!parsed.success) return invalido();
    if (!plano && !temPlanoDeAcao(meta!)) return invalido("Crie o plano de ação desta meta antes de adicionar atividades. A conversão em projeto é opcional.");
    if (plano ? !(await gerePlano()) || !(await podeEditarModulo(usuario, "tarefas")) : !gerencia) return negado();
    if (parsed.data.ownerId && !(await pessoasValidas([parsed.data.ownerId])).length) return invalido("Responsável inválido.");
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-plan:" + params.id);
      const current = await tx.contractGoal.findUniqueOrThrow({ where: { id: params.id }, include: { contrato: { select: { codccu: true } }, actionPlan: true, actions: true } });
      const { operation, dueDate, planDetails, ...data } = parsed.data;
      if (!current.actionPlan) {
        if (!temPlanoDeAcao(current)) return { error: invalido("Crie o plano de ação antes de adicionar suas atividades.") };
        if (!contexto!.podeGerirMeta(current)) return { error: negado() };
        await tx.contractGoalAction.create({ data: { ...data, ...gravarDetalhes(planDetails), goalId: current.id, dueDate: dueDate ? new Date(dueDate) : null } });
        return { task: null };
      }
      if (!(await podeEditarModulo(usuario, "projetos")) || !(await podeEditarModulo(usuario, "tarefas")) || !(await canViewProject(usuario.id, usuario.role, current.actionPlan.id)) || !(await canManageTeam(usuario.id, usuario.role, current.actionPlan.teamId))) return { error: negado() };
      if (planDetails !== undefined && !contexto!.podeGerirMeta(current)) return { error: negado() };
      const status = statusTarefaDaAcao(data.status); if (!status) return { error: invalido("Atividades de projeto não usam a situação Cancelada.") };
      const bridge = planDetails !== undefined ? await tx.contractGoalAction.create({ data: { ...data, ...gravarDetalhes(planDetails), goalId: current.id, migratedAt: new Date(), dueDate: dueDate ? new Date(dueDate) : null } }) : null;
      const task = await tx.task.create({ data: { projectId: current.actionPlan.id, sourceGoalActionId: bridge?.id, title: data.title, description: data.description, assigneeId: data.ownerId, dueDate: dueDate ? new Date(dueDate) : null, status: status as "A_FAZER" | "FAZENDO" | "BLOQUEADO" | "FEITO", ...datasDaTarefa(planDetails), ...(["FAZENDO", "FEITO"].includes(status) ? { actualStartedAt: dataDoItem(planDetails?.plannedStart || planDetails?.actualCompletion) ?? new Date() } : {}), ...(status === "FEITO" ? { actualEndedAt: planDetails?.actualCompletion ? dataDoItem(planDetails.actualCompletion) : new Date() } : {}) } });
      return { task };
    });
    if (result.error) return result.error;
    if (result.task) await reconcileTaskOutlook({ assigneeId: null, outlookEventId: null }, result.task);
  } else {
    if (!gerencia) return negado();
    if (body?.operation === "measurement") {
      if (meta!.kind === "PLANO") return invalido("Planos livres legados acompanham ações, sem medições numéricas.");
      if (meta!.source !== "MANUAL") return invalido("Esta meta usa uma fonte automática; o histórico manual não altera essa fonte.");
      const parsed = medicaoMeta.safeParse(body); if (!parsed.success) return invalido();
      const { operation, measuredAt, ...data } = parsed.data;
      const period = data.period ?? (meta!.evaluationMode === "PERIODICO" ? measuredAt.slice(0, 7) : null);
      if (meta!.evaluationMode === "PERIODICO" && (!period || !meta!.periodStart || !meta!.periodEnd || period < meta!.periodStart || period > meta!.periodEnd)) return invalido("A competência deve estar dentro do acompanhamento da meta.");
      await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-config:" + params.id);
        const atual = await tx.contractGoal.findUniqueOrThrow({ where: { id: params.id } });
        if (atual.source !== "MANUAL" || atual.kind === "PLANO") throw new Error("A configuração da meta mudou. Recarregue antes de registrar a medição.");
        if (atual.evaluationMode === "PERIODICO" && (!period || !atual.periodStart || !atual.periodEnd || period < atual.periodStart || period > atual.periodEnd)) throw new Error("O período da meta mudou. Recarregue antes de registrar a medição.");
        await tx.contractGoalMeasurement.create({ data: { ...data, period, measuredAt: new Date(measuredAt), goalId: params.id, createdById: usuario.id } });
      });
    } else if (body?.operation === "goal") {
      const parsed = dadosMeta.safeParse(body); if (!parsed.success) return invalido();
      if (meta!.kind !== "PLANO" && parsed.data.kind === "PLANO") return invalido("O plano de ação executa uma meta; ele não substitui seu indicador.");
      const erro = erroConfiguracao(parsed.data); if (erro) return invalido(erro);
      const erroFonte = await erroFontePermitida(parsed.data, meta!.contrato?.codccu ?? null, usuario);
      if (erroFonte) return NextResponse.json({ error: erroFonte }, { status: 403 });
      if (parsed.data.ownerId && !(await pessoasValidas([parsed.data.ownerId])).length) return invalido("Responsável inválido.");
      const { dueDate, ...data } = parsed.data;
      const estruturais = ["kind", "unit", "baselineValue", "targetValue", "direction", "source", "sourceAccount", "sourceCcu", "metricName", "periodStart", "periodEnd", "evaluationMode", "frequency", "baselinePeriodStart", "baselinePeriodEnd", "targetMode", "targetChange", "tolerance"] as const;
      const mudouConfiguracao = estruturais.some((campo) => (data[campo] ?? null) !== (meta![campo] ?? null));
      if (mudouConfiguracao && meta!.measurements.length) return invalido("Esta meta já possui medições. Para mudar a regra, fonte ou períodos, crie outra meta e preserve o histórico desta.");
      try { await prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "goal-config:" + params.id);
        const before = await tx.contractGoal.findUniqueOrThrow({ where: { id: params.id } });
        // Reconfere dentro da transação para não reinterpretar uma medição gravada em paralelo.
        const mudouNaTransacao = estruturais.some((campo) => (data[campo] ?? null) !== (before[campo] ?? null));
        if (mudouNaTransacao && await tx.contractGoalMeasurement.count({ where: { goalId: params.id } })) throw new Error("A meta recebeu uma medição durante a edição. Recarregue antes de tentar novamente.");
        const parentGoalId = data.parentGoalId === undefined ? before.parentGoalId : data.parentGoalId;
        const configuration = { ...data, parentGoalId, contributionWeight: parentGoalId === null ? null : data.contributionWeight === undefined ? before.contributionWeight : data.contributionWeight };
        await validarVinculoSetor(tx, { ...configuration, id: params.id }, usuario);
        const after = await tx.contractGoal.update({ where: { id: params.id }, data: { ...configuration, dueDate: dueDate ? new Date(dueDate) : null } });
        await tx.auditLog.create({ data: { userId: usuario.id, action: "META_ALTERADA", entityType: "ContractGoal", entityId: params.id, metadata: JSON.stringify({ before, after }) } });
      }); } catch (error) {
        if (error instanceof ErroComposicaoSetor) return NextResponse.json({ error: error.message }, { status: 422 });
        throw error;
      }
    } else return invalido();
  }
  return NextResponse.json({ ok: true });
}

