import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { pessoasValidas } from "@/lib/pessoas";
import { apresentarMetas, contextoMetas, incluirMetaContrato } from "@/lib/contractGoals/server";
import { novaMeta, erroConfiguracao } from "@/lib/contractGoals/validacao";
import { canViewProject } from "@/lib/permissions";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  const negado = await negarSemModulo(usuario, "metas"); if (negado) return negado;
  const contexto = await contextoMetas(usuario);
  const params = new URL(req.url).searchParams;
  let codccu = params.get("codccu");
  const projectId = params.get("projectId");
  if (projectId) {
    if (!(await canViewProject(usuario.id, usuario.role, projectId))) return NextResponse.json({ error: "Sem acesso ao projeto" }, { status: 403 });
    const projeto = await prisma.project.findUnique({ where: { id: projectId }, select: { codccu: true } });
    if (!projeto?.codccu) return NextResponse.json({ goals: [], contratos: [] });
    codccu = projeto.codccu;
  }
  if (codccu && !contexto.podeVer(codccu)) return NextResponse.json({ error: "Sem acesso às metas deste contrato" }, { status: 403 });
  const contratos = (await prisma.contrato.findMany({ where: codccu ? { codccu } : { acompanharResultados: true }, select: { id: true, codccu: true, nome: true }, orderBy: { nome: "asc" } })).filter((c) => contexto.podeVer(c.codccu));
  const metas = await prisma.contractGoal.findMany({ where: { contratoId: { in: contratos.map((c) => c.id) } }, include: incluirMetaContrato, orderBy: { createdAt: "desc" } });
  return NextResponse.json({ goals: await apresentarMetas(metas, usuario), contratos: contratos.map((c) => ({ ...c, canCreate: contexto.podeGerir(c.codccu) })) });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  const parsed = novaMeta.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os campos da meta", detalhes: parsed.error.flatten() }, { status: 422 });
  const contexto = await contextoMetas(usuario);
  const { codccu, ...meta } = parsed.data;
  if (!contexto.podeGerir(codccu)) return NextResponse.json({ error: "Sem permissão para criar metas neste contrato" }, { status: 403 });
  const erro = erroConfiguracao(meta); if (erro) return NextResponse.json({ error: erro }, { status: 422 });
  const contrato = await prisma.contrato.findUnique({ where: { codccu }, select: { id: true } });
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  if (meta.ownerId && !(await pessoasValidas([meta.ownerId])).length) return NextResponse.json({ error: "Responsável inválido" }, { status: 422 });
  const goal = await prisma.contractGoal.create({ data: { ...meta, contratoId: contrato.id, dueDate: meta.dueDate ? new Date(meta.dueDate) : null } });
  return NextResponse.json({ id: goal.id }, { status: 201 });
}
