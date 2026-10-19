import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

// Escolher em quais projetos cada pessoa entra (convite individual). So' ADMIN.
async function soAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  if ((session.user as any).role !== "ADMIN") return { erro: NextResponse.json({ error: "Somente administrador" }, { status: 403 }) };
  return { session };
}

export async function GET(req: Request) {
  const a = await soAdmin();
  if (a.erro) return a.erro;
  const userId = new URL(req.url).searchParams.get("userId");

  if (!userId) {
    const usuarios = await prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true, cargo: true, _count: { select: { acessosProjeto: true } } },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ usuarios });
  }

  const [projetos, convites, equipes] = await Promise.all([
    prisma.project.findMany({
      select: { id: true, name: true, status: true, ownerId: true, team: { select: { id: true, name: true } }, owner: { select: { name: true } } },
      orderBy: [{ team: { name: "asc" } }, { name: "asc" }],
    }),
    prisma.acessoProjeto.findMany({ where: { userId }, select: { projectId: true } }),
    prisma.userTeam.findMany({ where: { userId }, select: { teamId: true } }),
  ]);
  const convidado = new Set(convites.map((c) => c.projectId));
  const times = new Set(equipes.map((e) => e.teamId));
  return NextResponse.json({
    projetos: projetos.map((p) => ({
      id: p.id, name: p.name, status: p.status, equipe: p.team.name, responsavel: p.owner.name,
      convidado: convidado.has(p.id), viaEquipe: times.has(p.team.id), dono: p.ownerId === userId,
    })),
  });
}

const putSchema = z.object({ userId: z.string(), projectIds: z.array(z.string()) });

export async function PUT(req: Request) {
  const a = await soAdmin();
  if (a.erro) return a.erro;
  const parsed = putSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { userId, projectIds } = parsed.data;
  const validos = await prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true } });
  const ids = validos.map((p) => p.id);
  await prisma.$transaction([
    prisma.acessoProjeto.deleteMany({ where: { userId, projectId: { notIn: ids } } }),
    prisma.acessoProjeto.createMany({ data: ids.map((projectId) => ({ userId, projectId, concedidoPor: (a.session!.user as any).id })), skipDuplicates: true }),
  ]);
  return NextResponse.json({ ok: true, total: ids.length });
}
