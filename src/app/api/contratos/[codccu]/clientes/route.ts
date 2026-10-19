import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { escopoDeCustos, podeVerCcu } from "@/lib/custos/acesso";
import { z } from "zod";

// Contratantes (usuarios CLIENTE) que acompanham o contrato e podem registrar demandas para ele. So' ADMIN liga/desliga.
export async function GET(_req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (!podeVerCcu(await escopoDeCustos(prisma, u), params.codccu)) return NextResponse.json({ error: "Sem permissão para este contrato" }, { status: 403 });
  const contrato = await prisma.contrato.findUnique({ where: { codccu: params.codccu }, select: { id: true } });
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  const l = await prisma.contratoUsuario.findMany({ where: { contratoId: contrato.id }, select: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ clientes: l.map((x) => x.user), podeEditar: u.role === "ADMIN" });
}

export async function POST(req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") return NextResponse.json({ error: "Somente administrador liga o contratante ao contrato" }, { status: 403 });
  const parsed = z.object({ email: z.string().trim().toLowerCase().email() }).safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe um e-mail válido" }, { status: 422 });
  const [contrato, user] = await Promise.all([
    prisma.contrato.findUnique({ where: { codccu: params.codccu }, select: { id: true } }),
    prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, name: true, email: true, role: true, active: true } }),
  ]);
  if (!contrato) return NextResponse.json({ error: "Contrato não encontrado" }, { status: 404 });
  if (!user || !user.active) return NextResponse.json({ error: "Não há usuário ativo com este e-mail. Cadastre-o em Usuários, com papel Cliente." }, { status: 404 });
  if (user.role !== "CLIENTE") return NextResponse.json({ error: "Este usuário não tem o papel Cliente. O contratante precisa ser um usuário do tipo Cliente." }, { status: 422 });
  await prisma.contratoUsuario.upsert({ where: { contratoId_userId: { contratoId: contrato.id, userId: user.id } }, update: {}, create: { contratoId: contrato.id, userId: user.id } });
  return NextResponse.json({ cliente: { id: user.id, name: user.name, email: user.email } }, { status: 201 });
}

export async function DELETE(req: Request, { params }: { params: { codccu: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") return NextResponse.json({ error: "Somente administrador" }, { status: 403 });
  const userId = new URL(req.url).searchParams.get("userId");
  const contrato = await prisma.contrato.findUnique({ where: { codccu: params.codccu }, select: { id: true } });
  if (!contrato || !userId) return NextResponse.json({ error: "Contrato ou usuário inválido" }, { status: 422 });
  await prisma.contratoUsuario.deleteMany({ where: { contratoId: contrato.id, userId } });
  return NextResponse.json({ ok: true });
}
