import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Opcoes pro formulario de primeiro acesso: contratos (projetos) pra pessoa
// marcar em quais esta, e areas/nucleos. Sessao-gated -- so quem esta
// logado ve, e o conteudo nao e sensivel (nomes de contrato e area).
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  // contratos = projetos cuja equipe tem codccu (equipe de contrato do Senior)
  const projetos = await prisma.project.findMany({
    where: { team: { codccu: { not: null } } },
    select: { id: true, name: true, teamId: true, team: { select: { codccu: true } } },
    orderBy: { name: "asc" },
  });

  const nucleos = await prisma.nucleo.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } });

  return NextResponse.json({
    projetos: projetos.map((p) => ({ id: p.id, name: p.name, teamId: p.teamId, codccu: p.team?.codccu ?? null })),
    nucleos,
  });
}
