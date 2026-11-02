import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { COMPETENCIA_VALIDA, competenciaAtual, nomesDosCentros, pessoasVisiveis, podeVerTimesheetDe, relatorioDaPessoa } from "@/lib/timesheetAuto/servidor";

// Planilha (CSV para o Excel) do timesheet automatico: uma linha por pessoa x centro de custo x projeto, com horas e % das horas alocadas. Sem salario:
// os valores em reais ficam no modulo Custo de pessoal. `userId` = uma pessoa; sem ele, todas as que o usuario pode ver.
const celula = (v: string | number) => {
  const s = typeof v === "number" ? String(v).replace(".", ",") : v;
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;
  const sp = new URL(req.url).searchParams;
  const competencia = sp.get("competencia") ?? competenciaAtual();
  if (!COMPETENCIA_VALIDA.test(competencia)) return NextResponse.json({ error: "Competência inválida" }, { status: 422 });
  const so = sp.get("userId");
  let ids: string[];
  if (so) {
    if (!(await podeVerTimesheetDe(u, so))) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });
    ids = [so];
  } else {
    ids = await pessoasVisiveis(u);
    if (!ids.includes(u.id) && (await prisma.timesheetAuto.count({ where: { userId: u.id, ativo: true } }))) ids.push(u.id);
  }
  const pessoas = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, cargo: true }, orderBy: { name: "asc" } });
  const linhas: (string | number)[][] = [["Competência", "Pessoa", "Cargo", "Centro de custo", "Contrato", "Projeto", "Horas", "% das horas alocadas", "Situação do mês"]];
  const codigos: string[] = [];
  const dados: { p: (typeof pessoas)[number]; rel: NonNullable<Awaited<ReturnType<typeof relatorioDaPessoa>>> }[] = [];
  for (const p of pessoas) {
    const rel = await relatorioDaPessoa(p.id, competencia);
    if (!rel) continue;
    dados.push({ p, rel });
    for (const c of rel.resultado.centros) if (c.codccu) codigos.push(c.codccu);
  }
  const nomes = await nomesDosCentros(codigos);
  const rotulo = (c: { chave: string; codccu: string | null }) => (c.codccu ? c.codccu : c.chave === "__sem_projeto__" ? "Sem projeto" : "Sem centro de custo");
  for (const { p, rel } of dados) {
    const situacao = rel.fechado ? "Fechado" : "Em aberto";
    for (const c of rel.resultado.centros) {
      for (const pr of c.projetos) {
        const perc = c.horas > 0 ? Math.round((pr.horas / rel.resultado.horasAlocadas) * 10000) / 100 : 0;
        linhas.push([competencia, p.name, p.cargo ?? "", rotulo(c), c.codccu ? nomes[c.codccu] ?? "" : "", pr.nome, pr.horas, perc, situacao]);
      }
    }
    if (rel.resultado.horasSemTarefa > 0) linhas.push([competencia, p.name, p.cargo ?? "", "Sem tarefa", "", "Dias úteis sem tarefa em andamento", rel.resultado.horasSemTarefa, "", situacao]);
  }
  const csv = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  return new NextResponse(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="timesheet-automatico-${competencia}.csv"`, "Cache-Control": "private, no-store" },
  });
}
