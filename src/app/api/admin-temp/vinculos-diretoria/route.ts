import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// ROTA TEMPORARIA (19/10/2026) -- a ser removida logo depois do uso.
// Pedido do Joao: Carolina e Andre Peres ficam so' na Diretoria (nucleo), sem equipes, sem projetos, sem tarefas;
// ficam com UM projeto exemplo que mostra como usar a aba Projetos.
// GET  = so' relatorio do que existe hoje (nao altera nada).
// POST {"confirmar": true} = aplica, guardando antes o estado de cada pessoa na tabela bkp_vinculos_20261019 (para desfazer).
// Protegida pela chave de sincronizacao (x-sync-key), igual as rotas de automacao.

const NOMES = ["CAROLINA SILVA PERES DE CARVALHO", "ANDRE SILVA PERES"];
const ADMIN_EMAIL = "joao.oliveira@consominas.com.br";

function autorizado(req: Request) {
  const chave = req.headers.get("x-sync-key");
  return !!chave && chave === process.env.SENIOR_SYNC_KEY;
}

async function achar(nome: string) {
  const primeiro = nome.split(" ")[0];
  const candidatos = await prisma.user.findMany({ where: { name: { contains: primeiro, mode: "insensitive" } }, select: { id: true, name: true, email: true } });
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toUpperCase();
  return candidatos.filter((c) => norm(c.name) === norm(nome));
}

async function situacao(userId: string) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, name: true, email: true, role: true, nivelHierarquico: true, nucleoId: true, nucleo: { select: { name: true } },
      teams: { select: { teamId: true, role: true, team: { select: { name: true } } } },
      ownedProjects: { select: { id: true, name: true } },
    },
  });
  const [diretorEm, coordenadorEm, clienteEm, gerenteDe, tarefas, aprovador] = await Promise.all([
    prisma.project.findMany({ where: { diretores: { some: { id: userId } } }, select: { id: true, name: true } }),
    prisma.project.findMany({ where: { coordenadores: { some: { id: userId } } }, select: { id: true, name: true } }),
    prisma.projectClient.findMany({ where: { userId }, select: { id: true, projectId: true } }),
    prisma.nucleo.findMany({ where: { gerentes: { some: { id: userId } } }, select: { id: true, name: true } }),
    prisma.task.findMany({ where: { assigneeId: userId }, select: { id: true, title: true, projectId: true } }),
    prisma.project.findMany({ where: { approverId: userId }, select: { id: true, name: true } }),
  ]);
  return { ...u, diretorEm, coordenadorEm, clienteEm, gerenteDe, tarefas, aprovador };
}

export async function GET(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const q = new URL(req.url).searchParams.get("q");
  if (q) {
    const lista = await prisma.user.findMany({
      where: { OR: q.split(",").map((t) => ({ name: { contains: t.trim(), mode: "insensitive" as const } })) },
      select: { id: true, name: true, email: true, role: true, nivelHierarquico: true, nucleo: { select: { name: true } }, teams: { select: { team: { select: { name: true } } } } },
      take: 60,
    });
    return NextResponse.json({ q, total: lista.length, usuarios: lista.map((u) => ({ ...u, nucleo: u.nucleo?.name ?? null, teams: u.teams.map((t) => t.team.name) })) });
  }
  const achados = await Promise.all(NOMES.map(async (n) => ({ nome: n, usuarios: await achar(n) })));
  const pessoas = [];
  for (const a of achados) for (const u of a.usuarios) pessoas.push(await situacao(u.id));
  const nucleos = await prisma.nucleo.findMany({ select: { id: true, name: true, _count: { select: { membros: true } } } });
  const admins = await prisma.user.findMany({ where: { role: "ADMIN" }, select: { id: true, name: true, email: true } });
  return NextResponse.json({ achados: achados.map((a) => ({ nome: a.nome, encontrados: a.usuarios.length })), pessoas, nucleos, admins });
}

export async function POST(req: Request) {
  if (!autorizado(req)) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  if (body?.confirmar !== true) return NextResponse.json({ error: "Envie {\"confirmar\": true}" }, { status: 400 });

  const ids: string[] = [];
  for (const n of NOMES) {
    const a = await achar(n);
    if (a.length !== 1) return NextResponse.json({ error: `Esperava exatamente 1 usuário para "${n}", achei ${a.length}. Nada foi alterado.` }, { status: 409 });
    ids.push(a[0].id);
  }
  const admin = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL }, select: { id: true, role: true } });
  if (!admin || admin.role !== "ADMIN") return NextResponse.json({ error: "Admin dono dos projetos não encontrado. Nada foi alterado." }, { status: 409 });
  const diretoria = await prisma.nucleo.findFirst({ where: { name: { contains: "Diretoria", mode: "insensitive" } }, select: { id: true, name: true } });

  // 1) backup do estado atual
  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS bkp_vinculos_20261019 (id serial primary key, userid text, estado jsonb, criado timestamptz default now())`);
  const estados: any[] = [];
  for (const id of ids) {
    const s = await situacao(id);
    estados.push(s);
    await prisma.$executeRawUnsafe(`INSERT INTO bkp_vinculos_20261019 (userid, estado) VALUES ($1, $2::jsonb)`, id, JSON.stringify(s));
  }

  // 2) desvincular
  const feito: Record<string, any> = {};
  for (const s of estados) {
    const id = s.id as string;
    const r = { equipes: 0, projetosDiretor: 0, projetosCoordenador: 0, clientes: 0, gerenciaNucleos: 0, tarefas: 0, projetosPassadosAoAdmin: 0 };
    r.equipes = (await prisma.userTeam.deleteMany({ where: { userId: id } })).count;
    for (const p of s.diretorEm) { await prisma.project.update({ where: { id: p.id }, data: { diretores: { disconnect: { id } } } }); r.projetosDiretor++; }
    for (const p of s.coordenadorEm) { await prisma.project.update({ where: { id: p.id }, data: { coordenadores: { disconnect: { id } } } }); r.projetosCoordenador++; }
    r.clientes = (await prisma.projectClient.deleteMany({ where: { userId: id } })).count;
    for (const n of s.gerenteDe) { await prisma.nucleo.update({ where: { id: n.id }, data: { gerentes: { disconnect: { id } } } }); r.gerenciaNucleos++; }
    r.tarefas = (await prisma.task.updateMany({ where: { assigneeId: id }, data: { assigneeId: null } })).count;
    r.projetosPassadosAoAdmin = (await prisma.project.updateMany({ where: { ownerId: id }, data: { ownerId: admin.id } })).count;
    await prisma.project.updateMany({ where: { approverId: id }, data: { approverId: null } });
    await prisma.user.update({ where: { id }, data: { nucleoId: diretoria?.id ?? null } });
    feito[s.name] = r;
  }

  // 3) um projeto exemplo (equipe propria so' para o exemplo)
  const nomeEquipe = "Exemplo de uso — Projetos";
  const equipe = (await prisma.team.findUnique({ where: { name: nomeEquipe } })) ?? (await prisma.team.create({ data: { name: nomeEquipe, description: "Equipe criada só para o projeto de exemplo." } }));
  for (const id of ids) await prisma.userTeam.upsert({ where: { userId_teamId: { userId: id, teamId: equipe.id } }, update: {}, create: { userId: id, teamId: equipe.id, role: "MEMBRO" } });
  let projeto = await prisma.project.findFirst({ where: { teamId: equipe.id, name: "Projeto exemplo: como usar a aba Projetos" } });
  if (!projeto) {
    projeto = await prisma.project.create({
      data: {
        name: "Projeto exemplo: como usar a aba Projetos", teamId: equipe.id, ownerId: admin.id, status: "EM_ANDAMENTO",
        description: "Projeto de exemplo. Cada pessoa vê apenas os projetos que criou ou em que foi convidada. Abra as tarefas abaixo para ver como acompanhar o trabalho.",
      },
    });
    const tarefas: { title: string; status: "A_FAZER" | "FAZENDO" | "FEITO"; description: string }[] = [
      { title: "1. Veja o quadro do projeto", status: "FEITO", description: "As tarefas ficam em colunas por situação (A fazer, Fazendo, Bloqueado, Feito). Arraste um cartão para mudar a situação." },
      { title: "2. Abra uma tarefa", status: "FAZENDO", description: "Clique no cartão para ver descrição, responsável, prazo e comentários." },
      { title: "3. Acompanhe o prazo", status: "A_FAZER", description: "Tarefas com prazo vencido aparecem destacadas e entram no indicador de atrasos do projeto." },
      { title: "4. Quem vê o quê", status: "A_FAZER", description: "Você só vê projetos que criou ou em que foi convidado pela equipe do projeto." },
    ];
    let ordem = 0;
    for (const t of tarefas) await prisma.task.create({ data: { title: t.title, description: t.description, status: t.status, projectId: projeto.id, order: ordem++ } });
  }
  return NextResponse.json({ ok: true, diretoria: diretoria?.name ?? "(nenhum núcleo com 'Diretoria' no nome: núcleo ficou vazio)", feito, exemplo: { equipe: equipe.name, projeto: projeto.name } });
}
