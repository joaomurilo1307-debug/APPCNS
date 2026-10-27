import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { pessoasValidas } from "@/lib/pessoas";
import { apresentarMetas, contextoMetas, erroFontePermitida, incluirMetaContrato } from "@/lib/contractGoals/server";
import { novaMeta, erroConfiguracao } from "@/lib/contractGoals/validacao";
import { canViewProject } from "@/lib/permissions";
import { ErroComposicaoSetor, validarVinculoSetor } from "@/lib/contractGoals/sectorGoals";

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  const negado = await negarSemModulo(usuario, "metas"); if (negado) return negado;
  const contexto = await contextoMetas(usuario);
  const params = new URL(req.url).searchParams;
  const codccu = params.get("codccu");
  const projectId = params.get("projectId");
  if (projectId && !(await canViewProject(usuario.id, usuario.role, projectId))) return NextResponse.json({ error: "Sem acesso ao projeto" }, { status: 403 });
  const projeto = projectId ? await prisma.project.findUnique({ where: { id: projectId }, select: { codccu: true } }) : null;
  if (codccu && !contexto.podeVer(codccu)) return NextResponse.json({ error: "Sem acesso às metas deste centro de custo" }, { status: 403 });
  const contratos = (await prisma.contrato.findMany({ where: codccu ? { codccu } : { acompanharResultados: true }, select: { id: true, codccu: true, nome: true }, orderBy: { nome: "asc" } })).filter((c) => contexto.podeVer(c.codccu));
  const metas = await prisma.contractGoal.findMany({
    where: { AND: [contexto.filtroVisivel, ...(codccu ? [{ OR: [{ contrato: { codccu } }, { sourceCcu: codccu }] }] : []), ...(projeto?.codccu ? [{ OR: [{ contratoId: null }, { contrato: { codccu: projeto.codccu } }] }] : [])] },
    include: incluirMetaContrato, orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ goals: await apresentarMetas(metas, usuario), contratos: contratos.map((c) => ({ ...c, canCreate: contexto.podeGerir(c.codccu) })), canCreate: contexto.podeCriar });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  const parsed = novaMeta.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Revise os campos da meta", detalhes: parsed.error.flatten() }, { status: 422 });
  const contexto = await contextoMetas(usuario);
  const { codccu, ...meta } = parsed.data;
  if (!contexto.podeCriar || codccu && !contexto.podeVer(codccu)) return NextResponse.json({ error: "Sem permissão para criar esta meta" }, { status: 403 });
  if (meta.kind === "PLANO") return NextResponse.json({ error: "Crie uma meta de melhoria e associe seu plano de ação a ela." }, { status: 422 });
  const erro = erroConfiguracao(meta); if (erro) return NextResponse.json({ error: erro }, { status: 422 });
  const erroFonte = await erroFontePermitida(meta, codccu ?? null, usuario);
  if (erroFonte) return NextResponse.json({ error: erroFonte }, { status: 403 });
  const contrato = codccu ? await prisma.contrato.findUnique({ where: { codccu }, select: { id: true, acompanharResultados: true } }) : null;
  if (codccu && !contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  if (contrato && !contrato.acompanharResultados) return NextResponse.json({ error: "Este contrato está fora do acompanhamento para novas iniciativas." }, { status: 422 });
  if (meta.ownerId && !(await pessoasValidas([meta.ownerId])).length) return NextResponse.json({ error: "Responsável inválido" }, { status: 422 });
  try {
    const goal = await prisma.$transaction(async (tx) => {
      await validarVinculoSetor(tx, meta, usuario);
      const criada = await tx.contractGoal.create({ data: { ...meta, ownerId: meta.ownerId ?? usuario.id, creatorId: usuario.id, contratoId: contrato?.id ?? null, dueDate: meta.dueDate ? new Date(meta.dueDate) : null } });
      await tx.auditLog.create({ data: { userId: usuario.id, action: "META_CRIADA", entityType: "ContractGoal", entityId: criada.id, metadata: JSON.stringify({ before: null, after: criada }) } });
      return criada;
    });
    return NextResponse.json({ id: goal.id }, { status: 201 });
  } catch (error) {
    if (error instanceof ErroComposicaoSetor) return NextResponse.json({ error: error.message }, { status: 422 });
    throw error;
  }
}

