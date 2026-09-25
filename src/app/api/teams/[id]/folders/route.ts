import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTeamMember } from "@/lib/permissions";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!(await isTeamMember(userId, role, params.id))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const folders = await prisma.folder.findMany({
    where: { teamId: params.id },
    orderBy: { name: "asc" },
  });
  return NextResponse.json(folders);
}

const createSchema = z.object({
  name: z.string().min(1).max(120),
  parentId: z.string().nullable().optional(),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const userId = (session.user as any).id;
  const role = (session.user as any).role;

  if (!(await isTeamMember(userId, role, params.id))) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  if (parsed.data.parentId) {
    const parent = await prisma.folder.findUnique({ where: { id: parsed.data.parentId } });
    if (!parent || parent.teamId !== params.id) {
      return NextResponse.json({ error: "Pasta pai inválida" }, { status: 422 });
    }
  }

  const folder = await prisma.folder.create({
    data: {
      name: parsed.data.name.trim(),
      teamId: params.id,
      parentId: parsed.data.parentId ?? null,
      createdBy: userId,
    },
  });
  return NextResponse.json(folder, { status: 201 });
}
