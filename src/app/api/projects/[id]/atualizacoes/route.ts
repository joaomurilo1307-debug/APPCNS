import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSeSoConsulta } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { canViewProject } from "@/lib/permissions";
import { z } from "zod";

// Atualizacoes de status do projeto (aba "Atualizacoes"): quem acompanha o projeto le; quem nao e' contratante nem visualizador escreve.
const AUTOR = { id: true, name: true, avatarColor: true } as const;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role === "CLIENTE") return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  if (!(await canViewProject(u.id, u.role, params.id))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const atualizacoes = await prisma.atualizacaoProjeto.findMany({ where: { projectId: params.id }, orderBy: { createdAt: "desc" }, take: 100, include: { autor: { select: AUTOR } } });
  return NextResponse.json(atualizacoes);
}

const criarSchema = z.object({ saude: z.enum(["NO_PRAZO", "ATENCAO", "ATRASADO"]), texto: z.string().trim().min(3, "Escreva pelo menos 3 letras").max(4000) });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role === "CLIENTE" || u.role === "VISUALIZADOR") return NextResponse.json({ error: "Seu perfil não pode publicar atualizações" }, { status: 403 });
  { const soConsulta = await negarSeSoConsulta(u, "projetos"); if (soConsulta) return soConsulta; }
  if (!(await canViewProject(u.id, u.role, params.id))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  const projeto = await prisma.project.findUnique({ where: { id: params.id }, select: { id: true, name: true, ownerId: true, approverId: true } });
  if (!projeto) return NextResponse.json({ error: "Projeto não encontrado" }, { status: 404 });
  const parsed = criarSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Dados inválidos" }, { status: 422 });

  const a = await prisma.atualizacaoProjeto.create({ data: { projectId: projeto.id, autorId: u.id, saude: parsed.data.saude, texto: parsed.data.texto }, include: { autor: { select: AUTOR } } });
  // avisa o responsavel e o aprovador do projeto (se nao forem quem escreveu)
  const avisar = Array.from(new Set([projeto.ownerId, projeto.approverId].filter((x): x is string => !!x && x !== u.id)));
  if (avisar.length) {
    await prisma.notification.createMany({
      data: avisar.map((userId) => ({ userId, type: "OUTRO" as const, title: `Atualização do projeto ${projeto.name}`, body: `${u.name ?? "Alguém"}: ${parsed.data.texto.slice(0, 140)}`, link: `/projetos/${projeto.id}` })),
    }).catch(() => {});
  }
  return NextResponse.json(a, { status: 201 });
}
