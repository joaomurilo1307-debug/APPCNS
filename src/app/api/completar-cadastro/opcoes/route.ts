import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Opcoes pro formulario de primeiro acesso: areas/nucleos. Sessao-gated.
// 25/10/2026: projetos sao particulares -- a lista de projetos/contratos para a pessoa "marcar em quais atua" saiu daqui
// (listava o nome de projetos de todos e a pessoa entrava sozinha na equipe). Quem entra num projeto e' quem e' chamado na aba Equipe.
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const nucleos = await prisma.nucleo.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return NextResponse.json({
    projetos: [],
    nucleos,
  });
}
