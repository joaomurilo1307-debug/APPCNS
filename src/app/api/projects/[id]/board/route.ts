import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const board = await prisma.projectBoard.findUnique({ where: { projectId: params.id } });
  return NextResponse.json({ content: board?.content ?? "[]" });
}

const saveSchema = z.object({
  content: z.string().max(2_000_000),
});

export async function PUT(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = (session.user as any).role;
  if (role === "CLIENTE" || role === "VISUALIZADOR") {
    return NextResponse.json({ error: "Seu perfil é só leitura" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const board = await prisma.projectBoard.upsert({
    where: { projectId: params.id },
    update: { content: parsed.data.content },
    create: { projectId: params.id, content: parsed.data.content },
  });

  return NextResponse.json(board);
}
