import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { grupoDoCentro, nomeDoCentro, NUCLEOS_ADM } from "@/lib/custoPessoal/escopo";
import { IDS_COMPONENTES, type Componentes } from "@/lib/custoPessoal/componentes";
import type { LinhaCentroMes } from "@/lib/custoPessoal/agregar";

// Custo de pessoal CLT por centro de custo (todos os que tem folha; os 15 nucleos ADM aparecem sempre) e mes: so' totais por componente, os nomes ficam na rota
// de pessoas. Traz tambem os meses FECHADOS (a memoria: mes fechado nao muda). Modulo restrito "custo_pessoal".
export async function GET() {
  const session = await getServerSession(authOptions);
  const negado = await negarSemModulo(session?.user as any, "custo_pessoal");
  if (negado) return negado;

  const soma = Object.fromEntries(IDS_COMPONENTES.map((id) => [id, true])) as Record<keyof Componentes, true>;
  const [grupos, ultima, nomes, fechamentos] = await Promise.all([
    prisma.custoPessoalMes.groupBy({ by: ["codccu", "competencia"], _sum: soma, _count: { matricula: true } }),
    prisma.custoPessoalMes.aggregate({ _max: { atualizadoEm: true } }),
    prisma.custoPessoalMes.findMany({ distinct: ["codccu"], select: { codccu: true, nomeCentro: true } }),
    prisma.custoPessoalFechamento.findMany({ orderBy: { mes: "asc" }, select: { mes: true, fechadoEm: true, linhas: true, total: true } }),
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
  const nomeDoSenior = new Map(nomes.map((n) => [n.codccu, n.nomeCentro]));
  const codigos = new Set([...NUCLEOS_ADM.map((n) => n.codccu), ...grupos.map((g) => g.codccu)]);
  const centros = [...codigos].map((codccu) => ({ codccu, nome: nomeDoCentro(codccu, nomeDoSenior.get(codccu)), grupo: grupoDoCentro(codccu) }));
  return NextResponse.json({
    centros,
    linhas,
    fechamentos: fechamentos.map((f) => ({ mes: f.mes, fechadoEm: f.fechadoEm.toISOString(), linhas: f.linhas, total: f.total })),
    atualizadoEm: ultima._max.atualizadoEm?.toISOString() ?? null,
  });
}
