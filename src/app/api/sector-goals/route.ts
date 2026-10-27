import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { filtroMetasSetor, resumirMetasSetor } from "@/lib/contractGoals/sectorGoals";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const usuario = session.user as any;
  const negado = await negarSemModulo(usuario, "metas"); if (negado) return negado;
  const goals = await prisma.goal.findMany({ where: filtroMetasSetor(usuario), select: { id: true, title: true, unit: true, targetValue: true, assignedTeam: { select: { id: true, name: true } } }, orderBy: { title: "asc" } });
  const summaries = await resumirMetasSetor(goals.map((goal) => goal.id), usuario);
  return NextResponse.json({ goals: goals.map((goal) => ({ ...goal, ...summaries.get(goal.id) })) });
}
