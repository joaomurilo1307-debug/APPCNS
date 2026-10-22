import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { modulosDoUsuario } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";

// Modulos que a pessoa logada enxerga (menu e tela inicial). A regra esta em src/lib/acesso/catalogo.ts.
export async function GET() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  if (!user?.id) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const [modulos, perfil] = await Promise.all([
    modulosDoUsuario(user),
    prisma.user.findUnique({ where: { id: user.id }, select: { escopoProjetos: true } }),
  ]);
  return NextResponse.json({ modulos, escopoProjetos: perfil?.escopoProjetos ?? "PROPRIOS" });
}
