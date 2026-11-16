import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { negarSemModulo } from "@/lib/acesso/servidor";
import { prisma } from "@/lib/prisma";
import { z } from "zod";
import { DIA_VALIDO, mesesDoPeriodo } from "@/lib/timesheetAuto/servidor";

// Dias sem expediente da pessoa (ferias, atestado, folga): saem da divisao das horas do timesheet automatico.
const schema = z.object({ de: z.string().regex(DIA_VALIDO), ate: z.string().regex(DIA_VALIDO), motivo: z.string().trim().max(120).optional() });

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;
  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });
  const { de, ate, motivo } = parsed.data;
  if (ate < de) return NextResponse.json({ error: "A data final não pode ser antes da inicial" }, { status: 422 });
  if (!(await prisma.timesheetAuto.findUnique({ where: { userId: u.id } }))) return NextResponse.json({ error: "Ative o timesheet primeiro" }, { status: 409 });
  // mes fechado nao muda: a ausencia nao pode cair em um mes ja fechado
  if (await prisma.timesheetAutoFechamento.count({ where: { userId: u.id, competencia: { in: mesesDoPeriodo(de, ate) } } })) {
    return NextResponse.json({ error: "Há mês fechado nesse período: peça ao administrador para reabrir" }, { status: 409 });
  }
  const a = await prisma.timesheetAutoAusencia.create({ data: { userId: u.id, de: new Date(`${de}T00:00:00.000Z`), ate: new Date(`${ate}T00:00:00.000Z`), motivo: motivo || null } });
  return NextResponse.json({ ok: true, id: a.id });
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const u = session.user as any;
  const negado = await negarSemModulo(u, "timesheet_auto");
  if (negado) return negado;
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Informe a ausência" }, { status: 422 });
  const a = await prisma.timesheetAutoAusencia.findUnique({ where: { id } });
  if (!a || a.userId !== u.id) return NextResponse.json({ error: "Ausência não encontrada" }, { status: 404 });
  if (await prisma.timesheetAutoFechamento.count({ where: { userId: u.id, competencia: { in: mesesDoPeriodo(a.de.toISOString().slice(0, 10), a.ate.toISOString().slice(0, 10)) } } })) {
    return NextResponse.json({ error: "Há mês fechado nesse período: peça ao administrador para reabrir" }, { status: 409 });
  }
  await prisma.timesheetAutoAusencia.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
