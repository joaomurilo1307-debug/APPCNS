import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getUserTeamIds, isReadOnlyRole } from "@/lib/permissions";
import { pushCreateEvent } from "@/lib/microsoftGraph";
import { z } from "zod";

async function visibilityFilterFor(userId: string, role: string) {
  if (role === "ADMIN") return {};

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
      attendees: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
    },
    orderBy: { startAt: "asc" },
  });

  return NextResponse.json(events);
}

const createEventSchema = z.object({
  title: z.string().min(2).max(200),
  description: z.string().optional(),
  type: z.enum(["REUNIAO", "COMPROMISSO", "ENTREGA", "PRAZO", "OUTRO"]).optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime().nullable().optional(),
  allDay: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  attendeeIds: z.array(z.string()).optional(),
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

  const { attendeeIds, ...rest } = parsed.data;

  const event = await prisma.calendarEvent.create({
    data: {
      ...rest,
      startAt: new Date(parsed.data.startAt),
      endAt: parsed.data.endAt ? new Date(parsed.data.endAt) : null,
      creatorId: userId,
      attendees: attendeeIds?.length
        ? { create: attendeeIds.map((uid) => ({ userId: uid })) }
        : undefined,
    },
    include: {
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatarColor: true } },
      attendees: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
    },
  });

  const outlookEventId = await pushCreateEvent(userId, {
    title: event.title,
    description: event.description,
    startAt: event.startAt,
    endAt: event.endAt,
    allDay: event.allDay,
  });
  if (outlookEventId) {
    await prisma.calendarEvent.update({ where: { id: event.id }, data: { outlookEventId } });
    event.outlookEventId = outlookEventId;
  }

  return NextResponse.json(event, { status: 201 });
}
