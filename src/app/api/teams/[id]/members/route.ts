import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { z } from "zod";

const addMemberSchema = z.object({
  userId: z.string(),
  role: z.enum(["GESTOR", "MEMBRO"]).default("MEMBRO"),
});

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const systemRole = (session.user as any).systemRole;
  const allowed = await canManageTeam(userId, systemRole, params.id);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = addMemberSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const membership = await prisma.userTeam.upsert({
    where: { userId_teamId: { userId: parsed.data.userId, teamId: params.id } },
    update: { role: parsed.data.role },
    create: { userId: parsed.data.userId, teamId: params.id, role: parsed.data.role },
  });

  return NextResponse.json(membership, { status: 201 });
}
