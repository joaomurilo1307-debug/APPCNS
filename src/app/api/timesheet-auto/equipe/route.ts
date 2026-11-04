import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { nomesDosCentros, periodoDaRequisicao, pessoasVisiveis, relatorioDaPessoa } from "@/lib/timesheetAuto/servidor";

// Visao da equipe: quem lidera (Coordenador, Gestor, Diretor) ve o timesheet das pessoas dele que ativaram; Administrador e Acesso Master veem todas.
// Devolve uma linha por pessoa (horas e % por centro de custo) e o total por centro de custo (horas de todas as pessoas), que e' o que alimenta a
// distribuicao do salario por contrato no fim do mes. Aceita qualquer periodo (`competencia`, ou `de` + `ate`).
export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;
  const periodo = periodoDaRequisicao(new URL(req.url).searchParams);
  if ("erro" in periodo) return NextResponse.json({ error: periodo.erro }, { status: 422 });

  const ids = await pessoasVisiveis(u);
  const pessoas = await prisma.user.findMany({ where: { id: { in: ids }, active: true }, select: { id: true, name: true, cargo: true, setor: true }, orderBy: { name: "asc" } });
  const linhas: any[] = [];
  const porCentro = new Map<string, { codccu: string | null; chave: string; horas: number; pessoas: number; identificado: boolean }>();
  for (const p of pessoas) {
    const rel = await relatorioDaPessoa(p.id, periodo.de, periodo.ate);
    if (!rel) continue;
    const r = rel.resultado;
    linhas.push({
      pessoa: p,
      mesesFechados: rel.mesesFechados,
      diasTrabalhados: r.diasTrabalhados,
      diasAusencia: r.diasAusencia,
      diasFeriado: r.diasFeriado,
      horasDisponiveis: r.horasDisponiveis,
      horasAlocadas: r.horasAlocadas,
      horasSemApontamento: r.horasSemApontamento,
      avisos: r.avisos.length,
      centros: r.centros.map((c) => ({ chave: c.chave, codccu: c.codccu, horas: c.horas, percentual: c.percentual, identificado: c.identificado })),
    });
    for (const c of r.centros) {
      const x = porCentro.get(c.chave) ?? { codccu: c.codccu, chave: c.chave, horas: 0, pessoas: 0, identificado: c.identificado };
      x.horas = Math.round((x.horas + c.horas) * 100) / 100;
      x.pessoas += 1;
      porCentro.set(c.chave, x);
    }
  }
  const nomes = await nomesDosCentros([...porCentro.values()].map((c) => c.codccu ?? ""));
  const centros = [...porCentro.values()].sort((a, b) => b.horas - a.horas);
  return NextResponse.json({ periodo, nomesCentros: nomes, pessoas: linhas, centros, total: Math.round(centros.reduce((s, c) => s + c.horas, 0) * 100) / 100 });
}
