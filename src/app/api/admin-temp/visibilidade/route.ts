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

// POST {"confirmar": true}: tira a Claudia Moreira da equipe "Núcleo de Inovação" e leva os 2 projetos de inovação que estavam na equipe
// "Gestores" para a equipe "Núcleo de Inovação" (pedido do Joao, 19/10/2026). Guarda o estado anterior em bkp_visibilidade_20261019.
export async function POST(req: Request) {
  const chave = req.headers.get("x-sync-key");
  if (!chave || chave !== process.env.SENIOR_SYNC_KEY) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.confirmar !== true) return NextResponse.json({ error: 'Envie {"confirmar": true}' }, { status: 400 });

  const claudia = await prisma.user.findUnique({ where: { email: "claudia.moreira@consominas.com.br" }, select: { id: true, name: true } });
  const inovacao = await prisma.team.findUnique({ where: { name: "Núcleo de Inovação" }, select: { id: true } });
  const gestores = await prisma.team.findUnique({ where: { name: "Gestores" }, select: { id: true } });
  if (!claudia || !inovacao || !gestores) return NextResponse.json({ error: "Pessoa ou equipe não encontrada. Nada foi alterado." }, { status: 409 });
  const NOMES = ["Retorno de OC pelo sistema de gestão APPCNS", "Avaliação 360 Consominas"];
  const projetos = await prisma.project.findMany({ where: { name: { in: NOMES }, teamId: gestores.id }, select: { id: true, name: true, teamId: true } });
  const vinculo = await prisma.userTeam.findUnique({ where: { userId_teamId: { userId: claudia.id, teamId: inovacao.id } } });

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS bkp_visibilidade_20261019 (id serial primary key, estado jsonb, criado timestamptz default now())`);
  await prisma.$executeRawUnsafe(`INSERT INTO bkp_visibilidade_20261019 (estado) VALUES ($1::jsonb)`, JSON.stringify({ claudiaId: claudia.id, vinculoInovacao: vinculo, projetos, equipeOrigem: gestores.id, equipeDestino: inovacao.id }));

  const removidos = await prisma.userTeam.deleteMany({ where: { userId: claudia.id, teamId: inovacao.id } });
  const movidos = await prisma.project.updateMany({ where: { id: { in: projetos.map((p) => p.id) } }, data: { teamId: inovacao.id } });
  const membros = await prisma.userTeam.findMany({ where: { teamId: inovacao.id }, select: { role: true, user: { select: { name: true } } } });
  return NextResponse.json({ ok: true, vinculosRemovidos: removidos.count, projetosMovidos: movidos.count, projetos: projetos.map((p) => p.name), membrosAgoraNoNucleoDeInovacao: membros.map((m) => `${m.user.name} (${m.role})`) });
}
