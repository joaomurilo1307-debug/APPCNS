import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { pessoasValidas } from "@/lib/pessoas";
import { apresentarMetas, contextoMetas, incluirMetaContrato } from "@/lib/contractGoals/server";
import { dadosMeta, erroConfiguracao, medicaoMeta, acaoMeta, alterarAcao } from "@/lib/contractGoals/validacao";

async function acesso(id: string) {
  const session = await getServerSession(authOptions);
  if (!session) return { error: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const usuario = session.user as any;
  const meta = await prisma.contractGoal.findUnique({ where: { id }, include: incluirMetaContrato });
  if (!meta) return { error: NextResponse.json({ error: "Meta não encontrada" }, { status: 404 }) };
  const contexto = await contextoMetas(usuario);
  if (!contexto.podeVer(meta.contrato.codccu)) return { error: NextResponse.json({ error: "Sem acesso às metas deste contrato" }, { status: 403 }) };
  return { usuario, meta, contexto };
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const [goal] = await apresentarMetas([ctx.meta!], ctx.usuario);
  const measurements = await prisma.contractGoalMeasurement.findMany({ where: { goalId: params.id }, orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }], include: { createdBy: { select: { id: true, name: true } } } });
  return NextResponse.json({ ...goal, measurements });
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const ctx = await acesso(params.id); if (ctx.error) return ctx.error;
  const { usuario, meta, contexto } = ctx;
  const body = await req.json().catch(() => null);
  const gerencia = contexto!.podeGerir(meta!.contrato.codccu, meta!.ownerId);
  const negado = () => NextResponse.json({ error: "Sem permissão para alterar esta meta ou ação" }, { status: 403 });
  const invalido = () => NextResponse.json({ error: "Revise os campos informados" }, { status: 422 });
  if (body?.operation === "updateAction") {
    const parsed = alterarAcao.safeParse(body); if (!parsed.success) return invalido();
    const action = await prisma.contractGoalAction.findFirst({ where: { id: parsed.data.actionId, goalId: params.id } });
    if (!action) return NextResponse.json({ error: "Ação não encontrada nesta meta" }, { status: 404 });
    const onlyStatus = Object.keys(body).every((key) => ["operation", "actionId", "status"].includes(key));
    if (!gerencia && !(contexto!.escrita && action.ownerId === usuario.id && onlyStatus)) return negado();
    if (parsed.data.ownerId && !(await pessoasValidas([parsed.data.ownerId])).length) return invalido();
    const { operation, actionId, dueDate, ...data } = parsed.data;
    await prisma.contractGoalAction.update({ where: { id: actionId }, data: { ...data, ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}) } });
  } else {
    if (!gerencia) return negado();
    if (body?.operation === "measurement") {
      if (meta!.kind === "PLANO") return NextResponse.json({ error: "Planos livres acompanham ações, sem medições numéricas." }, { status: 422 });
      if (meta!.source !== "MANUAL") return NextResponse.json({ error: "Esta meta usa uma fonte automática; o histórico manual não altera essa fonte." }, { status: 422 });
      const parsed = medicaoMeta.safeParse(body); if (!parsed.success) return invalido();
      const { operation, measuredAt, ...data } = parsed.data;
      await prisma.contractGoalMeasurement.create({ data: { ...data, measuredAt: new Date(measuredAt), goalId: params.id, createdById: usuario.id } });
    } else if (body?.operation === "action") {
      const parsed = acaoMeta.safeParse(body); if (!parsed.success) return invalido();
      if (parsed.data.ownerId && !(await pessoasValidas([parsed.data.ownerId])).length) return invalido();
      const { operation, dueDate, ...data } = parsed.data;
      await prisma.contractGoalAction.create({ data: { ...data, dueDate: dueDate ? new Date(dueDate) : null, goalId: params.id } });
    } else if (body?.operation === "goal") {
      const parsed = dadosMeta.safeParse(body); if (!parsed.success) return invalido();
      const erro = erroConfiguracao(parsed.data); if (erro) return NextResponse.json({ error: erro }, { status: 422 });
      if (parsed.data.ownerId && !(await pessoasValidas([parsed.data.ownerId])).length) return invalido();
      const { dueDate, ...data } = parsed.data;
      await prisma.contractGoal.update({ where: { id: params.id }, data: { ...data, dueDate: dueDate ? new Date(dueDate) : null } });
    } else return invalido();
  }
  return NextResponse.json({ ok: true });
}
