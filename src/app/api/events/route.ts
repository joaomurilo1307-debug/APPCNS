import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamIds, isReadOnlyRole } from "@/lib/permissions";
import { pushCreateEvent } from "@/lib/microsoftGraph";
import { sendMeetingInvite, sendGuestInvite } from "@/lib/mailer";
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

async function visibilityFilterFor(userId: string, role: string) {
  if (role === "ADMIN" || role === "DIRETOR") return {};

  if (role === "CLIENTE") {
    return {
      OR: [
        { project: { clients: { some: { userId } } } },
        { attendees: { some: { userId } } },
      ],
    };
  }

  const teamIds = await getUserTeamIds(userId);
  return {
    OR: [
      { project: { teamId: { in: teamIds } } },
      { creatorId: userId },
      { attendees: { some: { userId } } },
      { projectId: null, creatorId: userId },
    ],
  };
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const projectId = searchParams.get("projectId") ?? undefined;

  const visibility = await visibilityFilterFor(userId, role);

  const events = await prisma.calendarEvent.findMany({
    where: {
      AND: [
        visibility,
        projectId ? { projectId } : {},
        from ? { startAt: { gte: new Date(from) } } : {},
        to ? { startAt: { lte: new Date(to) } } : {},
      ],
    },
    include: {
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatarColor: true } },
      attendees: { select: ATTENDEE_SELECT },
    },
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json(events);
}

const createEventSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  type: z.enum(["REUNIAO", "COMPROMISSO", "ENTREGA", "PRAZO", "OUTRO"]).optional(),
  meetingType: z.enum(["ALINHAMENTO", "KICKOFF", "UM_A_UM", "DIRETORIA", "CLIENTE", "TECNICA", "TREINAMENTO", "OUTRA"]).nullable().optional(),
  onlineMeetingProvider: z.enum(["NENHUM", "TEAMS", "GOOGLE_MEET", "JITSI"]).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  allDay: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  attendeeIds: z.array(z.string()).optional(),
  guests: z.array(z.object({ email: z.string().email(), name: z.string().min(1).max(150) })).max(20).optional(),
});

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const role = (session.user as any).role;
  if (isReadOnlyRole(role)) {
    return NextResponse.json({ error: "Seu perfil não pode criar eventos" }, { status: 403 });
  }

  const userId = (session.user as any).id;
  const body = await req.json();
  const parsed = createEventSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 422 });

  const { attendeeIds, guests, ...rest } = parsed.data;

  const event = await prisma.calendarEvent.create({
    data: {
      ...rest,
      startAt: new Date(parsed.data.startAt),
      endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
      creatorId: userId,
      onlineMeetingUrl: parsed.data.onlineMeetingProvider === "JITSI" ? generateJitsiRoomUrl(parsed.data.title) : undefined,
      attendees: {
        create: [
          ...(attendeeIds ?? []).map((uid) => ({ userId: uid })),
          ...(guests ?? []).map((g) => ({
            guestEmail: g.email,
            guestName: g.name,
            inviteToken: crypto.randomBytes(24).toString("hex"),
          })),
        ],
      },
    },
    include: {
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatarColor: true } },
      attendees: { select: ATTENDEE_SELECT },
    },
  });

  const internalAttendeeIds = event.attendees.filter((a) => a.userId).map((a) => a.userId!);
  const attendeeUsers = internalAttendeeIds.length
    ? await prisma.user.findMany({
        where: { id: { in: internalAttendeeIds } },
        select: { name: true, email: true },
      })
    : [];
  const attendeeEmails = attendeeUsers.length ? attendeeUsers.map((u) => u.email) : undefined;

  const organizer = await prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true } });
  if (organizer && attendeeUsers.length) {
    await sendMeetingInvite({
      eventId: event.id,
      sequence: event.icsSequence,
      title: event.title,
      description: event.description,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      organizerEmail: organizer.email,
      organizerName: organizer.name,
      attendees: attendeeUsers.map((u) => ({ email: u.email, name: u.name })),
    });
  }

  const appUrl = process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}` : "";
  const guestAttendees = event.attendees.filter((a) => a.guestEmail);
  if (organizer && guestAttendees.length) {
    for (const g of guestAttendees) {
      const row = await prisma.calendarEventAttendee.findUnique({ where: { id: g.id }, select: { inviteToken: true } });
      if (!row?.inviteToken) continue;
      await sendGuestInvite({
        eventId: event.id,
        sequence: event.icsSequence,
        title: event.title,
        description: event.description,
        startAt: event.startAt,
        endAt: event.endAt,
        allDay: event.allDay,
        organizerEmail: organizer.email,
        organizerName: organizer.name,
        guestEmail: g.guestEmail!,
        guestName: g.guestName ?? g.guestEmail!,
        inviteLink: `${appUrl}/convite/${row.inviteToken}`,
      });
    }
  }

  const created = await pushCreateEvent(
    userId,
    {
      title: event.title,
      description: event.description,
      startAt: event.startAt,
      endAt: event.endAt,
      allDay: event.allDay,
      attendeeEmails,
    },
    undefined,
    event.onlineMeetingProvider === "TEAMS"
  );
  if (created) {
    await prisma.calendarEvent.update({
      where: { id: event.id },
      data: { outlookEventId: created.outlookEventId, onlineMeetingUrl: created.onlineMeetingUrl },
    });
    event.outlookEventId = created.outlookEventId;
    event.onlineMeetingUrl = created.onlineMeetingUrl;
  }

  return NextResponse.json(event, { status: 201 });
}
