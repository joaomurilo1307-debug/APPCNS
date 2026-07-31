import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { z } from "zod";

export async function GET(_req: Request, { params }: { params: { token: string } }) {
  const attendee = await prisma.calendarEventAttendee.findUnique({
    where: { inviteToken: params.token },
    select: {
      status: true,
      guestName: true,
      guestEmail: true,
      event: {
        select: {
          title: true,
          description: true,
          startAt: true,
          endAt: true,
          allDay: true,
          onlineMeetingUrl: true,
          creator: { select: { name: true } },
          project: { select: { name: true } },
        },
      },
    },
  });
  if (!attendee) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });

  return NextResponse.json({
    guestName: attendee.guestName,
    guestEmail: attendee.guestEmail,
    status: attendee.status,
    event: attendee.event,
  });
}

const respondSchema = z.object({ status: z.enum(["APROVADO", "REJEITADO"]) });

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = respondSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Dados inválidos" }, { status: 422 });

  const attendee = await prisma.calendarEventAttendee.findUnique({ where: { inviteToken: params.token } });
  if (!attendee) return NextResponse.json({ error: "Convite não encontrado" }, { status: 404 });

  await prisma.calendarEventAttendee.update({
    where: { id: attendee.id },
    data: { status: parsed.data.status },
  });

  return NextResponse.json({ ok: true });
}
