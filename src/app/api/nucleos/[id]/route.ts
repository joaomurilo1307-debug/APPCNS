import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  description: z.string().nullable().optional(),
  gerenteIds: z.array(z.string()).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "DIRETOR") {
    return NextResponse.json({ error: "Só administradores ou diretores podem editar núcleos" }, { status: 403 });
  }

  const nucleo = await prisma.nucleo.findUnique({ where: { id: params.id } });
  if (!nucleo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const body = await req.json();
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { gerenteIds, ...rest } = parsed.data;

  const updated = await prisma.nucleo.update({
    where: { id: params.id },
    data: {
      ...rest,
      ...(gerenteIds !== undefined ? { gerentes: { set: gerenteIds.map((id) => ({ id })) } } : {}),
    },
    include: {
      membros: { select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true, nivelHierarquico: true } },
      gerentes: { select: { id: true, name: true, avatarColor: true, avatarUrl: true } },
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "DIRETOR") {
    return NextResponse.json({ error: "Só administradores ou diretores podem excluir núcleos" }, { status: 403 });
  }

  const nucleo = await prisma.nucleo.findUnique({ where: { id: params.id }, include: { membros: { select: { id: true } } } });
  if (!nucleo) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (nucleo.membros.length > 0) {
    return NextResponse.json({ error: "Só dá pra excluir um núcleo sem pessoas nele" }, { status: 422 });
  }

  await prisma.nucleo.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
