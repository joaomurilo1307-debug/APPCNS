import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManagePdiFor } from "@/lib/permissions";
import { z } from "zod";

const createItemSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().max(2000).optional(),
  dueDate: z.string().datetime().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const pdi = await prisma.pDI.findUnique({ where: { id: params.id } });
  if (!pdi) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = role === "ADMIN" || role === "DIRETOR" || pdi.gestorId === userId || (await canManagePdiFor(userId, role, pdi.userId));
  if (!allowed) {
    return NextResponse.json({ error: "Só o gestor responsável (ou coordenador/gerente do núcleo dessa pessoa) pode adicionar ações ao PDI" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const item = await prisma.pDIItem.create({
    data: {
      pdiId: params.id,
      title: parsed.data.title,
      description: parsed.data.description,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
    },
  });

  return NextResponse.json(item, { status: 201 });
}
