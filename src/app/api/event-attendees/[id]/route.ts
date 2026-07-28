import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

const decisionSchema = z.object({ status: z.enum(["APROVADO", "REJEITADO"]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;

  const attendee = await prisma.calendarEventAttendee.findUnique({ where: { id: params.id } });
  if (!attendee) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });
  if (attendee.userId !== userId) {
    return NextResponse.json({ error: "Este convite não é seu" }, { status: 403 });
  }

  const body = await req.json();
  const parsed = decisionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const updated = await prisma.calendarEventAttendee.update({
    where: { id: params.id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json(updated);
}
