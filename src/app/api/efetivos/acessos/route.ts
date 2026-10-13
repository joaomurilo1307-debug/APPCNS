import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigir, registrar } from "@/lib/efetivos/servidor";

export const dynamic = "force-dynamic";

// Quem pode ver (DASHBOARD) e quem pode montar/movimentar equipes (EDITOR). So ADMIN gerencia.
export async function GET() {
  const a = await exigir("admin");
  if ("erro" in a) return a.erro;
  const [usuarios, acessos] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { not: "CLIENTE" } },
      select: { id: true, name: true, email: true, role: true, cargo: true },
      orderBy: { name: "asc" },
    }),
    prisma.efetivoAcesso.findMany(),
  ]);
  const nivel = new Map(acessos.map((x) => [x.userId, x.nivel]));
  return NextResponse.json({ usuarios: usuarios.map((u) => ({ ...u, nivel: u.role === "ADMIN" ? "ADMIN" : nivel.get(u.id) ?? null })) });
}

const schema = z.object({ userId: z.string().min(1), nivel: z.enum(["EDITOR", "DASHBOARD"]).nullable() });

export async function PUT(req: Request) {
  const a = await exigir("admin");
  if ("erro" in a) return a.erro;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });
  const { userId, nivel } = parsed.data;
  const usuario = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, role: true, active: true } });
  if (!usuario || !usuario.active) return NextResponse.json({ error: "Usuário não encontrado" }, { status: 404 });
  if (usuario.role === "ADMIN") return NextResponse.json({ error: "Administrador já tem acesso total" }, { status: 409 });
  if (usuario.role === "CLIENTE") return NextResponse.json({ error: "Cliente não acessa o sistema interno" }, { status: 409 });

  if (nivel === null) {
    await prisma.efetivoAcesso.deleteMany({ where: { userId } });
  } else {
    await prisma.efetivoAcesso.upsert({
      where: { userId },
      create: { userId, nivel, concedidoPor: a.nome },
      update: { nivel, concedidoPor: a.nome, concedidoEm: new Date() },
    });
  }
  await registrar(a.userId, "ACESSO", "ACESSO", userId, `Acesso de ${usuario.name} ao controle de efetivos: ${nivel ?? "removido"} (por ${a.nome})`);
  return NextResponse.json({ ok: true });
}
