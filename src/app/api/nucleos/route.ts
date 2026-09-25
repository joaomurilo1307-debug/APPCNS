import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const nucleos = await prisma.nucleo.findMany({
    include: {
      membros: {
        select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true, nivelHierarquico: true },
      },
      gerentes: {
        select: { id: true, name: true, avatarColor: true, avatarUrl: true },
      },
    },
    orderBy: { name: "asc" },
  });

  return NextResponse.json(nucleos);
}

const createNucleoSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "DIRETOR") {
    return NextResponse.json({ error: "Só administradores ou diretores podem criar núcleos" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createNucleoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const existing = await prisma.nucleo.findUnique({ where: { name: parsed.data.name } });
  if (existing) return NextResponse.json(existing, { status: 200 });

  const nucleo = await prisma.nucleo.create({ data: parsed.data });
  return NextResponse.json(nucleo, { status: 201 });
}
