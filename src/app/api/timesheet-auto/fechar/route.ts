import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { primeiroDia, ultimoDia } from "@/lib/timesheetAuto/calculo";
import { COMPETENCIA_VALIDA, competenciaAtual, relatorioDaPessoa } from "@/lib/timesheetAuto/servidor";
import { logAudit } from "@/lib/auditLog";

// Fecha o mes: grava a fotografia do relatorio (inclusive a matriz dia x tarefa). Depois disso, mexer nas tarefas nao muda mais o que foi fechado (a
// distribuicao do salario nao "anda"). A pessoa fecha o proprio mes (so' de mes ja encerrado); o Administrador fecha e REABRE o de qualquer um.
const schema = z.object({ competencia: z.string().regex(COMPETENCIA_VALIDA), userId: z.string().optional() });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { competencia } = parsed.data;
  const alvoId = parsed.data.userId ?? u.id;
  if (alvoId !== u.id && u.role !== "ADMIN") return NextResponse.json({ error: "Só o administrador fecha o mês de outra pessoa" }, { status: 403 });
  if (competencia > competenciaAtual()) return NextResponse.json({ error: "Esse mês ainda não começou" }, { status: 422 });
  if (competencia === competenciaAtual() && u.role !== "ADMIN") return NextResponse.json({ error: "O mês corrente só fecha depois que terminar" }, { status: 422 });
  if (await prisma.timesheetAutoFechamento.findUnique({ where: { userId_competencia: { userId: alvoId, competencia } } })) {
    return NextResponse.json({ error: "Este mês já está fechado" }, { status: 409 });
  }
  const rel = await relatorioDaPessoa(alvoId, primeiroDia(competencia), ultimoDia(competencia), { semCongelar: [competencia] });
  if (!rel) return NextResponse.json({ error: "A pessoa não ativou o timesheet" }, { status: 409 });
  await prisma.timesheetAutoFechamento.create({ data: { userId: alvoId, competencia, resultado: rel.resultado as any, fechadoPorId: u.id } });
  await logAudit({ userId: u.id, action: "timesheet.fechar", entityType: "TimesheetAuto", entityId: alvoId, metadata: { competencia, horasAlocadas: rel.resultado.horasAlocadas } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  if (u.role !== "ADMIN") return NextResponse.json({ error: "Só o administrador reabre um mês fechado" }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  const competencia = sp.get("competencia") ?? "";
  const alvoId = sp.get("userId") ?? u.id;
  if (!COMPETENCIA_VALIDA.test(competencia)) return NextResponse.json({ error: "Competência inválida" }, { status: 422 });
  const r = await prisma.timesheetAutoFechamento.deleteMany({ where: { userId: alvoId, competencia } });
  if (r.count === 0) return NextResponse.json({ error: "Este mês não estava fechado" }, { status: 404 });
  await logAudit({ userId: u.id, action: "timesheet.reabrir", entityType: "TimesheetAuto", entityId: alvoId, metadata: { competencia } });
  return NextResponse.json({ ok: true });
}
