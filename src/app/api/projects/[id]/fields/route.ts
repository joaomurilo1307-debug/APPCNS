import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const fields = await prisma.customField.findMany({
    where: { projectId: params.id },
    orderBy: { order: "asc" },
  });

  return NextResponse.json(fields);
}

const createFieldSchema = z.object({
  name: z.string().min(1).max(60),
  type: z.enum(["TEXTO", "NUMERO", "MOEDA", "DATA", "LISTA", "CHECKBOX", "PESSOA"]),
  options: z.array(z.string()).optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const project = await prisma.project.findUnique({ where: { id: params.id } });
  if (!project) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canManageTeam(userId, role, project.teamId);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = createFieldSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const maxOrder = await prisma.customField.aggregate({
    where: { projectId: params.id },
    _max: { order: true },
  });

  const field = await prisma.customField.create({
    data: {
      projectId: params.id,
      name: parsed.data.name,
      type: parsed.data.type,
      options: parsed.data.options?.length ? JSON.stringify(parsed.data.options) : null,
      order: (maxOrder._max.order ?? -1) + 1,
    },
  });

  return NextResponse.json(field, { status: 201 });
}
