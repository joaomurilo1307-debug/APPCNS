import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const team = await prisma.team.findUnique({
    where: { id: params.id },
    include: {
      members: {
        include: {
          user: { select: { id: true, name: true, email: true, avatarColor: true, avatarUrl: true, cargo: true } },
        },
      },
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          nucleos: { select: { id: true, name: true } },
        },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!team) return NextResponse.json({ error: "Não encontrada" }, { status: 404 });

  // Núcleos da equipe = união dos núcleos dos projetos que ela toca — não existe relação
  // direta Team→Nucleo no schema, só via Project.
  const nucleosMap = new Map<string, { id: string; name: string }>();
  for (const p of team.projects) {
    for (const n of p.nucleos) nucleosMap.set(n.id, n);
  }

  return NextResponse.json({
    id: team.id,
    name: team.name,
    description: team.description,
    members: team.members,
    projects: team.projects,
    nucleos: Array.from(nucleosMap.values()),
  });
}
