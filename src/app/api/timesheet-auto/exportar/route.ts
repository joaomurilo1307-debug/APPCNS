import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { SEM_PROJETO } from "@/lib/timesheetAuto/calculo";
import { nomesDosCentros, periodoDaRequisicao, pessoasVisiveis, podeVerTimesheetDe, relatorioDaPessoa } from "@/lib/timesheetAuto/servidor";

// Planilha (CSV para o Excel) do timesheet automatico. Sem salario: os valores em reais ficam no modulo Custo de pessoal.
//   padrao        uma linha por pessoa x centro de custo x projeto, com horas e % das horas alocadas;
//   detalhe=dia   uma linha por pessoa x dia x tarefa (a conta aberta, para auditar).
// `userId` = uma pessoa; sem ele, todas as que o usuario pode ver. Periodo: `competencia` ou `de` + `ate`.
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
  const periodo = periodoDaRequisicao(sp);
  if ("erro" in periodo) return NextResponse.json({ error: periodo.erro }, { status: 422 });
  const rotuloPeriodo = periodo.competencia ?? `${periodo.de} a ${periodo.ate}`;
  const detalhado = sp.get("detalhe") === "dia";
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
  const dados: { p: (typeof pessoas)[number]; rel: NonNullable<Awaited<ReturnType<typeof relatorioDaPessoa>>> }[] = [];
  const codigos: string[] = [];
  for (const p of pessoas) {
    const rel = await relatorioDaPessoa(p.id, periodo.de, periodo.ate);
    if (!rel) continue;
    dados.push({ p, rel });
    for (const c of rel.resultado.centros) if (c.codccu) codigos.push(c.codccu);
  }
  const nomes = await nomesDosCentros(codigos);
  const rotulo = (c: { chave: string; codccu: string | null }) => (c.codccu ? c.codccu : c.chave === SEM_PROJETO ? "Sem projeto" : "Sem centro de custo");

  const linhas: (string | number)[][] = [];
  if (detalhado) {
    linhas.push(["Período", "Pessoa", "Cargo", "Dia", "Centro de custo", "Projeto", "Tarefa", "Horas"]);
    for (const { p, rel } of dados) {
      for (const c of rel.resultado.matriz) {
        const m = rel.resultado.metas[c.t];
        const cc = !m?.projetoId ? "Sem projeto" : m.codccu ?? "Sem centro de custo";
        linhas.push([rotuloPeriodo, p.name, p.cargo ?? "", c.d, cc, m?.projetoNome ?? "", m?.titulo ?? c.t, c.h]);
      }
    }
  } else {
    linhas.push(["Período", "Pessoa", "Cargo", "Centro de custo", "Contrato", "Projeto", "Horas", "% das horas alocadas", "Meses fechados"]);
    for (const { p, rel } of dados) {
      const fechados = rel.mesesFechados.join(", ");
      const r = rel.resultado;
      for (const c of r.centros) {
        for (const pr of c.projetos) {
          const perc = r.horasAlocadas > 0 ? Math.round((pr.horas / r.horasAlocadas) * 10000) / 100 : 0;
          linhas.push([rotuloPeriodo, p.name, p.cargo ?? "", rotulo(c), c.codccu ? nomes[c.codccu] ?? "" : "", pr.nome, pr.horas, perc, fechados]);
        }
      }
      if (r.horasSemApontamento > 0) linhas.push([rotuloPeriodo, p.name, p.cargo ?? "", "Sem apontamento", "", "Jornada sem tarefa em andamento", r.horasSemApontamento, "", fechados]);
    }
  }
  const csv = "﻿" + linhas.map((l) => l.map(celula).join(";")).join("\r\n");
  const arquivo = `timesheet-automatico${detalhado ? "-dia" : ""}-${periodo.competencia ?? `${periodo.de}_${periodo.ate}`}.csv`;
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${arquivo}"`, "Cache-Control": "private, no-store" } });
}
