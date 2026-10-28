import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { CCUS_ADM, NUCLEOS_ADM } from "@/lib/custoPessoal/escopo";
import { IDS_COMPONENTES, type Componentes } from "@/lib/custoPessoal/componentes";
import type { LinhaCentroMes } from "@/lib/custoPessoal/agregar";

// Custo de pessoal CLT por centro de custo ADM e mes (so' totais por componente; os nomes ficam na rota de pessoas). Modulo restrito "custo_pessoal".
export async function GET() {
  const session = await getServerSession(authOptions);
  const negado = await negarSemModulo(session?.user as any, "custo_pessoal");
  if (negado) return negado;

  const where = { codccu: { in: [...CCUS_ADM] } };
  const soma = Object.fromEntries(IDS_COMPONENTES.map((id) => [id, true])) as Record<keyof Componentes, true>;
  const [grupos, ultima] = await Promise.all([
    prisma.custoPessoalMes.groupBy({ by: ["codccu", "competencia"], where, _sum: soma, _count: { matricula: true } }),
    prisma.custoPessoalMes.aggregate({ where, _max: { atualizadoEm: true } }),
  ]);
  const centavos = (v: number | null) => Math.round((v ?? 0) * 100) / 100;
  const linhas: LinhaCentroMes[] = grupos
    .map((g) => ({
      codccu: g.codccu,
      mes: g.competencia.toISOString().slice(0, 7),
      pessoas: g._count.matricula,
      ...(Object.fromEntries(IDS_COMPONENTES.map((id) => [id, centavos(g._sum[id])])) as Componentes),
    }))
    .sort((a, b) => a.mes.localeCompare(b.mes) || a.codccu.localeCompare(b.codccu));
  return NextResponse.json({ nucleos: NUCLEOS_ADM, linhas, atualizadoEm: ultima._max.atualizadoEm?.toISOString() ?? null });
}
