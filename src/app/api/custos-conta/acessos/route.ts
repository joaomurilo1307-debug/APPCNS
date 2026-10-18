import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";

// Gestao de QUEM ve QUAL centro de custo (CCU) na tela Custo por Centro de Custo. So' ADMIN.
// GET: pessoas (com os CCUs liberados e os que vem das equipes) e os centros de custo (com quantas pessoas acompanham cada um).
// PUT: troca o conjunto de CCUs liberados de UMA pessoa. A importacao em lote esta em ./importar.

async function exigirAdmin() {
  const session = await getServerSession(authOptions);
  if (!session) return { erro: NextResponse.json({ error: "Não autenticado" }, { status: 401 }) };
  const user = session.user as any;
  if (user.role !== "ADMIN") return { erro: NextResponse.json({ error: "Só administradores gerenciam os acessos" }, { status: 403 }) };
  return { user };
}

export async function GET() {
  const { erro } = await exigirAdmin();
  if (erro) return erro;

  const [usuarios, centrosBrutos] = await Promise.all([
    prisma.user.findMany({
      where: { anonymizedAt: null },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        active: true,
        verTodosCustos: true,
        cargo: true,
        acessosCentroCusto: { select: { codccu: true } },
        teams: { select: { team: { select: { codccu: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.custoContaFinanceira.groupBy({ by: ["codccu", "contrato"], _sum: { valor: true } }),
  ]);

  const nomes = new Map<string, { nome: string; total: number }>();
  for (const c of centrosBrutos) {
    const atual = nomes.get(c.codccu);
    nomes.set(c.codccu, { nome: atual?.nome ?? c.contrato, total: (atual?.total ?? 0) + (c._sum.valor ?? 0) });
  }

  const pessoas = usuarios.map((u) => {
    const liberados = u.acessosCentroCusto.map((a) => a.codccu);
    const viaEquipe = u.teams.map((t) => t.team.codccu).filter((c): c is string => !!c);
    const verTudo = u.role === "ADMIN" || u.role === "DIRETOR" || u.verTodosCustos;
    return { id: u.id, nome: u.name, email: u.email, papel: u.role, ativo: u.active, cargo: u.cargo, verTodosCustos: u.verTodosCustos, verTudoPeloPapel: u.role === "ADMIN" || u.role === "DIRETOR", verTudo, liberados, viaEquipe };
  });

  const centros = Array.from(nomes.entries())
    .map(([codccu, v]) => {
      const quem = pessoas.filter((p) => p.ativo && !p.verTudo && (p.liberados.includes(codccu) || p.viaEquipe.includes(codccu)));
      return { codccu, nome: v.nome.replace(new RegExp(`^${codccu}\\s*-\\s*`), "").trim() || v.nome, total: Math.round(v.total * 100) / 100, pessoas: quem.length };
    })
    .sort((a, b) => b.total - a.total);

  return NextResponse.json({ pessoas, centros, quemVeTudo: pessoas.filter((p) => p.ativo && p.verTudo).length });
}

const putSchema = z.object({ userId: z.string().min(1), ccus: z.array(z.string().regex(/^\d+$/)).max(500) });

export async function PUT(req: Request) {
  const { erro, user } = await exigirAdmin();
  if (erro) return erro;
  const parsed = putSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });
  const { userId, ccus } = parsed.data;

  const alvo = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
  if (!alvo) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });

  const unicos = Array.from(new Set(ccus));
  const antes = await prisma.acessoCentroCusto.findMany({ where: { userId }, select: { codccu: true } });
  const antesSet = new Set(antes.map((a) => a.codccu));
  const remover = antes.filter((a) => !unicos.includes(a.codccu)).map((a) => a.codccu);
  const adicionar = unicos.filter((c) => !antesSet.has(c));

  await prisma.$transaction([
    prisma.acessoCentroCusto.deleteMany({ where: { userId, codccu: { in: remover } } }),
    prisma.acessoCentroCusto.createMany({ data: adicionar.map((codccu) => ({ userId, codccu, concedidoPor: user.name ?? user.email ?? "admin" })), skipDuplicates: true }),
  ]);
  await logAudit({ userId: user.id, action: "custos.acessos", entityType: "User", entityId: userId, metadata: { alvo: alvo.name, adicionados: adicionar, removidos: remover } });

  return NextResponse.json({ ok: true, adicionados: adicionar.length, removidos: remover.length, total: unicos.length });
}
