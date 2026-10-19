import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ROTA TEMPORARIA (19/10/2026), SOMENTE LEITURA, protegida por x-sync-key. Mostra POR QUE uma pessoa ve cada projeto
// (dono, equipe, diretor/coordenador do projeto, nucleo, tarefa atribuida, aprovador, convite). Sera removida apos o uso.
export async function GET(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const users = await prisma.user.findMany({ where: { name: { contains: q, mode: "insensitive" } }, select: { id: true, name: true, email: true, role: true, nivelHierarquico: true }, take: 5 });
  const saida: any[] = [];
  for (const u of users) {
    const [equipes, projetos] = await Promise.all([
      prisma.userTeam.findMany({ where: { userId: u.id }, select: { role: true, team: { select: { name: true, _count: { select: { members: true } } } } } }),
      prisma.project.findMany({
        where: { OR: [{ ownerId: u.id }, { team: { members: { some: { userId: u.id } } } }, { diretores: { some: { id: u.id } } }, { coordenadores: { some: { id: u.id } } }, { nucleos: { some: { gerentes: { some: { id: u.id } } } } }, { tasks: { some: { assigneeId: u.id } } }, { approverId: u.id }, { acessos: { some: { userId: u.id } } }] },
        select: { name: true, ownerId: true, approverId: true, team: { select: { name: true, members: { where: { userId: u.id }, select: { role: true } } } }, diretores: { where: { id: u.id }, select: { id: true } }, coordenadores: { where: { id: u.id }, select: { id: true } }, acessos: { where: { userId: u.id }, select: { id: true } }, _count: { select: { tasks: { where: { assigneeId: u.id } } } } },
      }),
    ]);
    saida.push({
      ...u,
      equipes: equipes.map((e) => ({ equipe: e.team.name, papel: e.role, membros: e.team._count.members })),
      projetos: projetos.map((p) => ({ projeto: p.name, equipe: p.team.name, motivos: [p.ownerId === u.id && "criou", p.team.members.length && `membro da equipe (${p.team.members[0].role})`, p.diretores.length && "diretor do projeto", p.coordenadores.length && "coordenador do projeto", p.approverId === u.id && "aprovador", p._count.tasks && `${p._count.tasks} tarefa(s) atribuída(s)`, p.acessos.length && "convite"].filter(Boolean) })),
    });
  }
  return NextResponse.json({ q, usuarios: saida });
}
