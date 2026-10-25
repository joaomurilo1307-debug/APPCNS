import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { pessoasValidas } from "@/lib/pessoas";
import { diferencaDeMembros, papelFinal } from "@/lib/nucleosEdicao";
import { z } from "zod";

const ids = z.array(z.string()).max(1000);
const updateSchema = z.object({
  name: z.string().trim().min(2).max(100).optional(),
  description: z.string().nullable().optional(),
  tipo: z.enum(["SETOR", "CONTRATO"]).optional(),
  diretorIds: ids.optional(),
  gerenteIds: ids.optional(),
  coordenadorIds: ids.optional(),
  // colaboradores (quem pertence ao nucleo): define o nucleo da pessoa (User.nucleoId)
  membroIds: ids.optional(),
});

const PESSOA = { id: true, name: true, avatarColor: true, avatarUrl: true } as const;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const role = u.role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Só administradores editam núcleos" }, { status: 403 });
  }

  const nucleo = await prisma.nucleo.findUnique({
    where: { id: params.id },
    select: {
      id: true, name: true,
      membros: { select: { id: true, nucleoId: true } },
      gerentes: { select: { id: true } }, coordenadores: { select: { id: true } }, diretores: { select: { id: true } },
    },
  });
  if (!nucleo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { gerenteIds, coordenadorIds, diretorIds, membroIds, ...rest } = parsed.data;

  // so' entra quem e' pessoa valida (ativa, nao contratante); quem ja estava no papel nao some sozinho
  const pedidos = Array.from(new Set([...(gerenteIds ?? []), ...(coordenadorIds ?? []), ...(diretorIds ?? []), ...(membroIds ?? [])]));
  const validos = pedidos.length ? await pessoasValidas(pedidos) : [];
  const final = (desejados: string[] | undefined, atuais: { id: string }[]) => (desejados === undefined ? undefined : papelFinal(desejados, atuais.map((a) => a.id), validos));
  const gerentes = final(gerenteIds, nucleo.gerentes);
  const coordenadores = final(coordenadorIds, nucleo.coordenadores);
  const diretores = final(diretorIds, nucleo.diretores);
  const membrosFinal = membroIds === undefined ? undefined : papelFinal(membroIds, nucleo.membros.map((m) => m.id), validos);
  const mudanca = membrosFinal === undefined ? null : diferencaDeMembros(nucleo.membros.map((m) => m.id), membrosFinal);

  try {
    await prisma.$transaction(async (tx) => {
      await tx.nucleo.update({
        where: { id: params.id },
        data: {
          ...rest,
          ...(gerentes ? { gerentes: { set: gerentes.map((id) => ({ id })) } } : {}),
          ...(coordenadores ? { coordenadores: { set: coordenadores.map((id) => ({ id })) } } : {}),
          ...(diretores ? { diretores: { set: diretores.map((id) => ({ id })) } } : {}),
        },
      });
      if (mudanca) {
        if (mudanca.saem.length) await tx.user.updateMany({ where: { id: { in: mudanca.saem }, nucleoId: params.id }, data: { nucleoId: null } });
        if (mudanca.entram.length) await tx.user.updateMany({ where: { id: { in: mudanca.entram } }, data: { nucleoId: params.id } });
      }
    });
  } catch (e: any) {
    if (e?.code === "P2002") return NextResponse.json({ error: "Já existe um núcleo com esse nome" }, { status: 409 });
    throw e;
  }

  await logAudit({
    userId: u.id, action: "nucleo.editar", entityType: "Nucleo", entityId: params.id,
    metadata: {
      nucleo: nucleo.name, campos: Object.keys(rest),
      diretores: diretores?.length, gerentes: gerentes?.length, coordenadores: coordenadores?.length,
      colaboradoresEntraram: mudanca?.entram, colaboradoresSairam: mudanca?.saem,
    },
  });

  const atualizado = await prisma.nucleo.findUnique({
    where: { id: params.id },
    include: {
      membros: { select: { ...PESSOA, cargo: true, nivelHierarquico: true } },
      diretores: { select: PESSOA },
      gerentes: { select: PESSOA },
      coordenadores: { select: PESSOA },
    },
  });
  return NextResponse.json(atualizado);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "ADMIN") {
    return NextResponse.json({ error: "Só administradores excluem núcleos" }, { status: 403 });
  }

  const nucleo = await prisma.nucleo.findUnique({ where: { id: params.id }, include: { membros: { select: { id: true } } } });
  if (!nucleo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (nucleo.membros.length > 0) {
    return NextResponse.json({ error: "Só dá pra excluir um núcleo sem pessoas nele" }, { status: 422 });
  }

  await prisma.nucleo.delete({ where: { id: params.id } });
  await logAudit({ userId: (session.user as any).id, action: "nucleo.excluir", entityType: "Nucleo", entityId: params.id, metadata: { nucleo: nucleo.name } });
  return NextResponse.json({ ok: true });
}
