import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Ledger imutavel de qual centro de custo cada colaborador CLT tinha em
// cada mes (ver HistoricoCcuColaborador no schema). Dado pessoal/RH --
// so ADMIN/DIRETOR consultam, diferente do custo-por-CC (que qualquer
// membro da equipe ve).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const user = session.user as any;
  if (!["ADMIN", "DIRETOR"].includes(user.role)) {
    return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const matricula = searchParams.get("matricula")?.trim();
  const nome = searchParams.get("nome")?.trim();

  const registros = await prisma.historicoCcuColaborador.findMany({
    where: {
      ...(matricula ? { matricula } : {}),
      ...(nome ? { colaborador: { contains: nome, mode: "insensitive" } } : {}),
    },
    include: { team: { select: { name: true } } },
    orderBy: [{ colaborador: "asc" }, { competencia: "asc" }],
  });

  const totalPessoas = new Set(registros.map((r) => r.matricula)).size;
  const ultimaCompetencia = registros.reduce<string | null>((acc, r) => {
    const iso = r.competencia.toISOString();
    return !acc || iso > acc ? iso : acc;
  }, null);

  return NextResponse.json({
    registros: registros.map((r) => ({
      matricula: r.matricula,
      colaborador: r.colaborador,
      codccu: r.codccu,
      equipe: r.team?.name ?? null,
      competencia: r.competencia.toISOString(),
      atualizadoEm: r.atualizadoEm.toISOString(),
    })),
    totalRegistros: registros.length,
    totalPessoas,
    ultimaCompetencia,
  });
}
