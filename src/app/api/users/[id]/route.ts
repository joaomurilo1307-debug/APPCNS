import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const updateUserSchema = z.object({
  role: z.enum(["ADMIN", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "CLIENTE", "VISUALIZADOR"]).optional(),
  active: z.boolean().optional(),
  name: z.string().min(2).max(150).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Só administradores podem alterar usuários" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = updateUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updated = await prisma.user.update({
    where: { id: params.id },
    data: parsed.data,
    select: { id: true, name: true, email: true, role: true, active: true },
  });

  return NextResponse.json(updated);
}
