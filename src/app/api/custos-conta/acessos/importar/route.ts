import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/auditLog";
import { lerListaDeAcessos } from "@/lib/custos/acesso";

// Importacao em lote dos acessos: uma linha por pessoa -- "email;190, 230, 102235" ou "email;todos". So' ADMIN.
// `aplicar: false` (padrao) so' CONFERE e devolve o relatorio (nada e' gravado); `aplicar: true` grava.
// modo "somar" acrescenta aos CCUs que a pessoa ja' tem; "substituir" troca o conjunto inteiro pelo da lista.
// "todos" liga User.verTodosCustos (a pessoa passa a ver todos os centros de custo).

const bodySchema = z.object({ texto: z.string().min(1).max(200_000), modo: z.enum(["somar", "substituir"]).default("somar"), aplicar: z.boolean().default(false) });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const admin = session.user as any;
  if (admin.role !== "ADMIN") return NextResponse.json({ error: "Só administradores gerenciam os acessos" }, { status: 403 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const { texto, modo, aplicar } = parsed.data;

  const { linhas, erros } = lerListaDeAcessos(texto);
  const centros = await prisma.custoContaFinanceira.findMany({ distinct: ["codccu"], select: { codccu: true, contrato: true } });
  const centrosValidos = new Set(centros.map((c) => c.codccu));
  const usuarios = await prisma.user.findMany({ where: { email: { in: linhas.map((l) => l.email) } }, select: { id: true, email: true, name: true, role: true, acessosCentroCusto: { select: { codccu: true } } } });
  const porEmail = new Map(usuarios.map((u) => [u.email.toLowerCase(), u]));

  const relatorio: { email: string; nome: string | null; situacao: "ok" | "usuario-nao-encontrado"; todos: boolean; ccusNovos: string[]; ccusRemovidos: string[]; ccusDesconhecidos: string[]; avisoPapel?: string }[] = [];
  const operacoes: (() => Promise<unknown>)[] = [];

  for (const l of linhas) {
    const u = porEmail.get(l.email);
    if (!u) {
      relatorio.push({ email: l.email, nome: null, situacao: "usuario-nao-encontrado", todos: l.todos, ccusNovos: [], ccusRemovidos: [], ccusDesconhecidos: l.ccus });
      continue;
    }
    const desconhecidos = l.ccus.filter((c) => !centrosValidos.has(c));
    const validos = l.ccus.filter((c) => centrosValidos.has(c));
    const atuais = new Set(u.acessosCentroCusto.map((a) => a.codccu));
    const novos = l.todos ? [] : validos.filter((c) => !atuais.has(c));
    const removidos = l.todos || modo === "somar" ? [] : Array.from(atuais).filter((c) => !validos.includes(c));
    relatorio.push({
      email: l.email,
      nome: u.name,
      situacao: "ok",
      todos: l.todos,
      ccusNovos: novos,
      ccusRemovidos: removidos,
      ccusDesconhecidos: desconhecidos,
      avisoPapel: ["ADMIN", "DIRETOR"].includes(u.role) && !l.todos ? "já vê todos os centros de custo pelo papel" : undefined,
    });
    if (aplicar) {
      if (l.todos) operacoes.push(() => prisma.user.update({ where: { id: u.id }, data: { verTodosCustos: true } }));
      if (removidos.length) operacoes.push(() => prisma.acessoCentroCusto.deleteMany({ where: { userId: u.id, codccu: { in: removidos } } }));
      if (novos.length) operacoes.push(() => prisma.acessoCentroCusto.createMany({ data: novos.map((codccu) => ({ userId: u.id, codccu, concedidoPor: admin.name ?? admin.email ?? "admin" })), skipDuplicates: true }));
    }
  }

  if (aplicar && operacoes.length) {
    for (const op of operacoes) await op(); // idempotentes: repetir a importacao nao duplica nada
    await logAudit({ userId: admin.id, action: "custos.acessos.importar", entityType: "User", metadata: { pessoas: relatorio.filter((r) => r.situacao === "ok").length, modo } });
  }

  return NextResponse.json({
    aplicado: aplicar,
    erros,
    resumo: {
      linhas: linhas.length,
      pessoasEncontradas: relatorio.filter((r) => r.situacao === "ok").length,
      pessoasNaoEncontradas: relatorio.filter((r) => r.situacao !== "ok").length,
      acessosNovos: relatorio.reduce((s, r) => s + r.ccusNovos.length, 0),
      acessosRemovidos: relatorio.reduce((s, r) => s + r.ccusRemovidos.length, 0),
      centrosDesconhecidos: relatorio.reduce((s, r) => s + r.ccusDesconhecidos.length, 0),
    },
    relatorio,
  });
}
