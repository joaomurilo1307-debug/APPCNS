import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendNotificationEmail } from "@/lib/mailer";
import { z } from "zod";

const decisionSchema = z.object({ status: z.enum(["APROVADO", "REJEITADO"]) });

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const userName = (session.user as any).name ?? "Alguém";

  const attendee = await prisma.calendarEventAttendee.findUnique({
    where: { id: params.id },
    include: { event: { include: { creator: { select: { name: true, email: true } } } } },
  });
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

  const creator = attendee.event.creator;
  if (creator) {
    const decisionLabel = parsed.data.status === "APROVADO" ? "aceitou" : "recusou";
    sendNotificationEmail({
      to: [{ email: creator.email, name: creator.name }],
      subject: `${userName} ${decisionLabel} o convite: ${attendee.event.title}`,
      text: `Olá ${creator.name},\n\n${userName} ${decisionLabel} o convite para "${attendee.event.title}" no consominas-gestao.`,
    }).catch(() => {});
  }

  return NextResponse.json(updated);
}
