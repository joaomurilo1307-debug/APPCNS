import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nucleoIdsQueGere } from "@/lib/permissions";
import { z } from "zod";

// Cria uma EQUIPE a partir de um nucleo: as pessoas do nucleo entram como membros; coordenadores, gerentes e quem cria entram como gestores.
// Quem gere o nucleo (ou o admin) faz; a equipe serve para criar projetos e para o Chat.
const schema = z.object({ nome: z.string().trim().min(2).max(100).optional() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  if (u.role !== "ADMIN" && !(await nucleoIdsQueGere(u.id)).includes(params.id)) {
    return NextResponse.json({ error: "Só o admin, o coordenador ou o gerente do núcleo cria a equipe dele" }, { status: 403 });
  }
  const n = await prisma.nucleo.findUnique({
    where: { id: params.id },
    select: { name: true, membros: { select: { id: true } }, gerentes: { select: { id: true } }, coordenadores: { select: { id: true } } },
  });
  if (!n) return NextResponse.json({ error: "Núcleo não encontrado" }, { status: 404 });

  const nome = parsed.data.nome ?? `Equipe ${n.name}`;
  if (await prisma.team.findUnique({ where: { name: nome }, select: { id: true } })) return NextResponse.json({ error: `Já existe uma equipe chamada “${nome}”. Escolha outro nome.` }, { status: 409 });
  const gestores = new Set([u.id, ...n.gerentes.map((g) => g.id), ...n.coordenadores.map((c) => c.id)]);
  const todos = new Set([...gestores, ...n.membros.map((m) => m.id)]);
  const ativos = new Set((await prisma.user.findMany({ where: { id: { in: Array.from(todos) }, active: true, anonymizedAt: null, role: { not: "CLIENTE" } }, select: { id: true } })).map((x) => x.id));
  const equipe = await prisma.team.create({
    data: {
      name: nome, description: `Equipe criada a partir do núcleo ${n.name}`,
      members: { create: Array.from(todos).filter((id) => ativos.has(id) || id === u.id).map((userId) => ({ userId, role: gestores.has(userId) ? ("GESTOR" as const) : ("MEMBRO" as const) })) },
    },
    select: { id: true, name: true, _count: { select: { members: true } } },
  });
  return NextResponse.json({ id: equipe.id, name: equipe.name, pessoas: equipe._count.members }, { status: 201 });
}
