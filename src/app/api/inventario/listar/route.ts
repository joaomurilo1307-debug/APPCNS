import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Lista as respostas do inventario de equipamentos e licencas, mais recente primeiro. So' leitura; quem preenche e' o formulario publico
// (pagina no n8n), quem le e exporta e' quem estiver logado no sistema.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const respostas = await prisma.inventarioSubmissao.findMany({ orderBy: { criadoEm: "desc" } });
  return NextResponse.json({ respostas });
}
