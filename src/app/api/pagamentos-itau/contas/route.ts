import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const ROLES_LEITURA = ["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR"];
const ROLES_ESCRITA = ["ADMIN", "DIRETOR"];

const contaSchema = z.object({
  apelido: z.string().min(1),
  cnpj: z.string().regex(/^\d{14}$/, "CNPJ deve ter 14 digitos"),
  agencia: z.string().min(1),
  conta: z.string().min(1),
  dac: z.string().min(1).max(1),
});

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_LEITURA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const contas = await prisma.contaBancaria.findMany({ where: { ativo: true }, orderBy: { criadoEm: "asc" } });
  return NextResponse.json({ contas });
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (!ROLES_ESCRITA.includes(role)) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json().catch(() => null);
  const parsed = contaSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos", detalhes: parsed.error.flatten() }, { status: 422 });

  const conta = await prisma.contaBancaria.create({ data: parsed.data });
  return NextResponse.json({ conta }, { status: 201 });
}
