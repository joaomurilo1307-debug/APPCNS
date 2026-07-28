import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { canManageTeam } from "@/lib/permissions";
import { pushUpdateEvent, pushDeleteEvent } from "@/lib/microsoftGraph";
import { z } from "zod";

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
      attendees: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
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
  startAt: z.string().datetime().optional(),
  endAt: z.string().datetime().nullable().optional(),
  allDay: z.boolean().optional(),
  projectId: z.string().nullable().optional(),
  attendeeIds: z.array(z.string()).optional(),
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

  const { attendeeIds, ...rest } = parsed.data;
  const data: any = { ...rest };
  if (parsed.data.startAt !== undefined) data.startAt = new Date(parsed.data.startAt);
  if (parsed.data.endAt !== undefined) data.endAt = parsed.data.endAt ? new Date(parsed.data.endAt) : null;

  if (attendeeIds !== undefined) {
    data.attendees = {
      deleteMany: {},
      create: attendeeIds.map((uid) => ({ userId: uid })),
    };
  }

  const updated = await prisma.calendarEvent.update({
    where: { id: params.id },
    data,
    include: {
      project: { select: { id: true, name: true } },
      creator: { select: { id: true, name: true, avatarColor: true } },
      attendees: { include: { user: { select: { id: true, name: true, avatarColor: true } } } },
    },
  });

  if (updated.outlookEventId) {
    await pushUpdateEvent(updated.creatorId, updated.outlookEventId, {
      title: updated.title,
      description: updated.description,
      startAt: updated.startAt,
      endAt: updated.endAt,
      allDay: updated.allDay,
    });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const event = await prisma.calendarEvent.findUnique({ where: { id: params.id } });
  if (!event) return NextResponse.json({ error: "Não encontrado" }, { status: 404 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const allowed = await canEditEvent(userId, role, event);
  if (!allowed) return NextResponse.json({ error: "Sem permissão" }, { status: 403 });

  if (event.outlookEventId) {
    await pushDeleteEvent(event.creatorId, event.outlookEventId);
  }

  await prisma.calendarEvent.delete({ where: { id: params.id } });
  return NextResponse.json({ ok: true });
}
