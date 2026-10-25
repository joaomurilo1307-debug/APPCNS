import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { z } from "zod";
import { logAudit } from "@/lib/auditLog";
import { limparCacheDeAcompanhamento } from "@/lib/custos/acesso";

export async function GET(_req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  const escopo = await escopoDeCustos(prisma, user);
  if (!podeVerCcu(escopo, params.codccu)) return NextResponse.json({ error: "Sem permissão para este contrato" }, { status: 403 });
  const contrato = await prisma.contrato.findUnique({ where: { codccu: params.codccu } });
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  return NextResponse.json({ contrato, podeEditar: user.role === "ADMIN" });
}

const data = z.string().nullable().optional();
const patchSchema = z.object({
  nome: z.string().min(2).max(160).optional(),
  tipo: z.enum(["CONTRATO", "ADMINISTRATIVO"]).optional(),
  status: z.enum(["ATIVO", "ENCERRADO"]).optional(),
  acompanharResultados: z.boolean().optional(),
  cliente: z.string().max(160).nullable().optional(),
  numero: z.string().max(80).nullable().optional(),
  objeto: z.string().max(2000).nullable().optional(),
  vigenciaInicio: data,
  vigenciaFim: data,
  valor: z.number().min(0).nullable().optional(),
  observacoes: z.string().max(4000).nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") return NextResponse.json({ error: "Somente administrador edita a ficha do contrato" }, { status: 403 });
  const parsed = patchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const d = parsed.data;
  const anterior = await prisma.contrato.findUnique({ where: { codccu: params.codccu } });
  if (!anterior) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const dt = (v: string | null | undefined) => (v === undefined ? undefined : v ? new Date(`${v.slice(0, 10)}T00:00:00.000Z`) : null);
  const contrato = await prisma.contrato.update({
    where: { codccu: params.codccu },
    data: { ...d, vigenciaInicio: dt(d.vigenciaInicio), vigenciaFim: dt(d.vigenciaFim) },
  });
  if (d.acompanharResultados !== undefined && anterior.acompanharResultados !== d.acompanharResultados) {
    limparCacheDeAcompanhamento();
    await logAudit({ userId: (session.user as any).id, action: "contratos.acompanhamento", entityType: "Contrato", entityId: contrato.id,
      metadata: { codccu: contrato.codccu, antes: anterior.acompanharResultados, depois: contrato.acompanharResultados } });
  }
  if (d.status !== undefined && anterior.status !== d.status) {
    await logAudit({ userId: (session.user as any).id, action: "contratos.situacao", entityType: "Contrato", entityId: contrato.id,
      metadata: { codccu: contrato.codccu, antes: anterior.status, depois: contrato.status } });
  }
  return NextResponse.json({ contrato });
}
