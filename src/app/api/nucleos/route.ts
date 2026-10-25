import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nucleoIdsQueGere, visibleProjectWhere } from "@/lib/permissions";
import { z } from "zod";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const u = session.user as any;
  const visiveis = await visibleProjectWhere(u.id, u.role);
  const [nucleos, meus] = await Promise.all([
    prisma.nucleo.findMany({
      include: {
        membros: {
          select: { id: true, name: true, avatarColor: true, avatarUrl: true, cargo: true, nivelHierarquico: true },
        },
        diretores: {
          select: { id: true, name: true, avatarColor: true, avatarUrl: true },
        },
        gerentes: {
          select: { id: true, name: true, avatarColor: true, avatarUrl: true },
        },
        coordenadores: {
          select: { id: true, name: true, avatarColor: true, avatarUrl: true },
        },
        // so' os projetos do nucleo que a pessoa ja pode ver (a lista nao vaza nome de projeto de outro nucleo)
        projetos: { where: visiveis, select: { id: true, name: true, status: true }, orderBy: { name: "asc" } },
      },
      orderBy: { name: "asc" },
    }),
    nucleoIdsQueGere(u.id),
  ]);

  // gero = a pessoa e' gerente ou coordenadora deste nucleo (ou admin): associa projetos e controla as demandas dele
  return NextResponse.json(nucleos.map((n) => ({ ...n, gero: u.role === "ADMIN" || meus.includes(n.id) })));
}

const createNucleoSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().optional(),
  tipo: z.enum(["SETOR", "CONTRATO"]).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const role = (session.user as any).role;
  if (role !== "ADMIN" && role !== "DIRETOR") {
    return NextResponse.json({ error: "Só administradores ou diretores podem criar núcleos" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = createNucleoSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const existing = await prisma.nucleo.findUnique({ where: { name: parsed.data.name } });
  if (existing) return NextResponse.json(existing, { status: 200 });

  const nucleo = await prisma.nucleo.create({ data: parsed.data });
  return NextResponse.json(nucleo, { status: 201 });
}
