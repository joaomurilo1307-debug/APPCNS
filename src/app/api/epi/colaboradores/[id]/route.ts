import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const patchSchema = z.object({
  nomeCompleto: z.string().min(1).optional(),
  funcao: z.string().min(1).optional(),
  situacao: z.string().optional(),
  contratoId: z.string().optional(),
  tamanhoBota: z.number().int().nullable().optional(),
  tamanhoCamisa: z.string().nullable().optional(),
  tamanhoCalca: z.number().int().nullable().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const colaborador = await prisma.epiColaborador.update({ where: { id: params.id }, data: parsed.data });
  return NextResponse.json(colaborador);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!["ADMIN", "DIRETOR", "GESTOR_PROJETO"].includes(role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  await prisma.epiColaborador.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
