import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { pushUpdateEvent, pushDeleteEvent } from "@/lib/microsoftGraph";
import { sendMeetingInvite, sendMeetingCancellation, sendGuestInvite } from "@/lib/mailer";
import { generateJitsiRoomUrl } from "@/lib/jitsi";
import crypto from "crypto";
import { z } from "zod";

const ATTENDEE_SELECT = {
  id: true,
  status: true,
  userId: true,
  guestEmail: true,
  guestName: true,
  user: { select: { id: true, name: true, avatarColor: true } },
} as const;

async function canEditEvent(userId: string, role: string, event: { creatorId: string; projectId: string | null }) {
  if (role === "ADMIN") return true;
  if (event.creatorId === userId) return true;
  if (!event.projectId) return false;
  const project = await prisma.project.findUnique({ where: { id: event.projectId }, select: { teamId: true } });
  if (!project) return false;
  return canManageTeam(userId, role, project.teamId);
}

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const event = await prisma.calendarEvent.findUnique({
    where: { id: params.id },
    include: {
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatarColor: true } },
      attendees: { select: ATTENDEE_SELECT },
    },
  });
  if (!event) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  return NextResponse.json(event);
}

const updateEventSchema = z.object({
  title: z.string().min(2).max(200).optional(),
  description: z.string().nullable().optional(),
  type: z.enum(["REUNIAO", "COMPROMISSO", "ENTREGA", "PRAZO", "OUTRO"]).optional(),
  meetingType: z.enum(["ALINHAMENTO", "KICKOFF", "UM_A_UM", "DIRETORIA", "CLIENTE", "TECNICA", "TREINAMENTO", "OUTRA"]).nullable().optional(),
  onlineMeetingProvider: z.enum(["NENHUM", "TEAMS", "GOOGLE_MEET", "JITSI"]).optional(),
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  allDay: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  attendeeIds: z.array(z.string()).optional(),
  guests: z.array(z.object({ email: z.string().email(), name: z.string().min(1).max(150) })).max(20).optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const event = await prisma.calendarEvent.findUnique({ where: { id: params.id } });
  if (!event) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canEditEvent(userId, role, event);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const body = await req.json();
  const parsed = updateEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { attendeeIds, guests, ...rest } = parsed.data;
  const data: any = { ...rest };
  if (parsed.data.startAt !== undefined) data.startAt = new Date(parsed.data.startAt);
  if (parsed.data.endAt !== undefined) data.endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;
  if (parsed.data.onlineMeetingProvider === "JITSI" && (event.onlineMeetingProvider !== "JITSI" || !event.onlineMeetingUrl)) {
    data.onlineMeetingUrl = generateJitsiRoomUrl(parsed.data.title ?? event.title);
  }

  const attendeeWrites: any = {};
  const deleteConditions: any[] = [];
  const createEntries: any[] = [];

  if (attendeeIds !== undefined) {
    // So mexe em quem entrou/saiu da lista — preserva o status (Aceito/Recusado) de quem ja estava e ja respondeu.
    const existing = await prisma.calendarEventAttendee.findMany({
      where: { eventId: params.id, userId: { not: null } },
      select: { userId: true },
    });
    const existingIds = existing.map((a) => a.userId!);
    const toRemove = existingIds.filter((id) => !attendeeIds.includes(id));
    const toAdd = attendeeIds.filter((id) => !existingIds.includes(id));
    if (toRemove.length) deleteConditions.push({ userId: { in: toRemove } });
    createEntries.push(...toAdd.map((uid) => ({ userId: uid })));
  }

  let newGuestEntries: { email: string; name: string; token: string }[] = [];
  if (guests !== undefined) {
    // Convidados de fora sao reconciliados pelo e-mail (nao tem userId) — preserva status de quem ja respondeu.
    const existingGuests = await prisma.calendarEventAttendee.findMany({
      where: { eventId: params.id, guestEmail: { not: null } },
      select: { guestEmail: true },
    });
    const existingEmails = existingGuests.map((a) => a.guestEmail!);
    const wantedEmails = guests.map((g) => g.email);
    const toRemoveEmails = existingEmails.filter((e) => !wantedEmails.includes(e));
    const toAddGuests = guests.filter((g) => !existingEmails.includes(g.email));
    if (toRemoveEmails.length) deleteConditions.push({ guestEmail: { in: toRemoveEmails } });
    newGuestEntries = toAddGuests.map((g) => ({ email: g.email, name: g.name, token: crypto.randomBytes(24).toString("hex") }));
    createEntries.push(...newGuestEntries.map((g) => ({ guestEmail: g.email, guestName: g.name, inviteToken: g.token })));
  }

  if (deleteConditions.length) attendeeWrites.deleteMany = deleteConditions.length === 1 ? deleteConditions[0] : { OR: deleteConditions };
  if (createEntries.length) attendeeWrites.create = createEntries;
  if (Object.keys(attendeeWrites).length) data.attendees = attendeeWrites;

  const nextSequence = event.icsSequence + 1;
  const updated = await prisma.calendarEvent.update({
    where: { id: params.id },
    data: { ...data, icsSequence: nextSequence },
    include: {
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatarColor: true, email: true } },
      attendees: { select: ATTENDEE_SELECT },
    },
  });

  const internalAttendeeIds = updated.attendees.filter((a) => a.userId).map((a) => a.userId!);
  if (internalAttendeeIds.length) {
    const attendeeUsers = await prisma.user.findMany({
      where: { id: { in: internalAttendeeIds } },
      select: { name: true, email: true },
    });
    await sendMeetingInvite({
      eventId: updated.id,
      sequence: nextSequence,
      title: updated.title,
      description: updated.description,
      startAt: updated.startAt,
      endAt: updated.endAt,
      allDay: updated.allDay,
      organizerEmail: updated.creator.email,
      organizerName: updated.creator.name,
      attendees: attendeeUsers.map((u) => ({ email: u.email, name: u.name })),
    });
  }

  if (newGuestEntries.length) {
    const appUrl = process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : "";
    for (const g of newGuestEntries) {
      await sendGuestInvite({
        eventId: updated.id,
        sequence: nextSequence,
        title: updated.title,
        description: updated.description,
        startAt: updated.startAt,
        endAt: updated.endAt,
        allDay: updated.allDay,
        organizerEmail: updated.creator.email,
        organizerName: updated.creator.name,
        guestEmail: g.email,
        guestName: g.name,
        inviteLink: `${appUrl}/convite/${g.token}`,
      });
    }
  }

  if (updated.outlookEventId) {
    const attendeeEmails = internalAttendeeIds.length
      ? (
          await prisma.user.findMany({
            where: { id: { in: internalAttendeeIds } },
            select: { email: true },
          })
        ).map((u) => u.email)
      : undefined;

    const wantsTeams = updated.onlineMeetingProvider === "TEAMS" && !updated.onlineMeetingUrl;
    const result = await pushUpdateEvent(
      updated.creatorId,
      updated.outlookEventId,
      {
        title: updated.title,
        description: updated.description,
        startAt: updated.startAt,
        endAt: updated.endAt,
        allDay: updated.allDay,
        attendeeEmails,
      },
      undefined,
      wantsTeams
    );
    if (wantsTeams && result?.onlineMeetingUrl) {
      await prisma.calendarEvent.update({ where: { id: updated.id }, data: { onlineMeetingUrl: result.onlineMeetingUrl } });
      updated.onlineMeetingUrl = result.onlineMeetingUrl;
    }
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const event = await prisma.calendarEvent.findUnique({
    where: { id: params.id },
    include: {
      creator: { select: { name: true, email: true } },
      attendees: {
        select: { userId: true, guestEmail: true, guestName: true, user: { select: { name: true, email: true } } },
      },
    },
  });
  if (!event) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canEditEvent(userId, role, event);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  const cancelRecipients = [
    ...event.attendees.filter((a) => a.user).map((a) => ({ email: a.user!.email, name: a.user!.name })),
    ...event.attendees.filter((a) => a.guestEmail).map((a) => ({ email: a.guestEmail!, name: a.guestName ?? a.guestEmail! })),
  ];
  if (cancelRecipients.length) {
    await sendMeetingCancellation({
      eventId: event.id,
      sequence: event.icsSequence + 1,
      title: event.title,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      organizerEmail: event.creator.email,
      organizerName: event.creator.name,
      attendees: cancelRecipients,
    });
  }

  if (event.outlookEventId) {
    await pushDeleteEvent(event.creatorId, event.outlookEventId);
  }

  await prisma.calendarEvent.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
