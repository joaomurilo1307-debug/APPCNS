import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Só administradores acessam esta lista" }, { status: 403 });
  }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      active: true,
      avatarColor: true,
      avatarUrl: true,
      createdAt: true,
      cargo: true,
      setor: true,
      diretoria: true,
      dataInicio: true,
      gestorImediatoId: true,
      gestorImediato: { select: { id: true, name: true } },
      teams: { include: { team: { select: { id: true, name: true } } } },
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json(users);
}

const createUserSchema = z.object({
  name: z.string().min(2).max(150),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "DIRETOR", "GESTOR_PROJETO", "APROVADOR", "COLABORADOR", "CLIENTE", "VISUALIZADOR"]),
  avatarColor: z.string().optional(),
  cargo: z.string().optional(),
  setor: z.string().optional(),
  diretoria: z.string().optional(),
  dataInicio: z.string().datetime().nullable().optional(),
  gestorImediatoId: z.string().nullable().optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  if ((session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Só administradores podem cadastrar usuários" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createUserSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email.toLowerCase() } });
  if (existing) return NextResponse.json({ error: "Já existe um usuário com este e-mail" }, { status: 409 });

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);

  const user = await prisma.user.create({
    data: {
      name: parsed.data.name,
      email: parsed.data.email.toLowerCase(),
      passwordHash,
      role: parsed.data.role,
      avatarColor: parsed.data.avatarColor,
      cargo: parsed.data.cargo,
      setor: parsed.data.setor,
      diretoria: parsed.data.diretoria,
      dataInicio: parsed.data.dataInicio ? new Date(parsed.data.dataInicio) : null,
      gestorImediatoId: parsed.data.gestorImediatoId,
    },
    select: { id: true, name: true, email: true, role: true, active: true, avatarColor: true },
  });

  return NextResponse.json(user, { status: 201 });
}
