import nodemailer from "nodemailer";

let transporter: nodemailer.Transporter | null = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 465),
    secure: (process.env.SMTP_SECURE ?? "true") === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
  return transporter;
}

function toIcsDate(d: Date) {
  return d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
}

function escapeIcsText(s: string) {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function buildIcs(opts: {
  uid: string;
  sequence: number;
  method: "REQUEST" | "CANCEL";
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  organizerEmail: string;
  organizerName: string;
  attendees: { email: string; name: string }[];
}) {
  const end = opts.endAt ?? new Date(opts.startAt.getTime() + 30 * 60 * 1000);
  const status = opts.method === "CANCEL" ? "CANCELLED" : "CONFIRMED";
  const lines = [
    "BEGIN:VCALENDAR",
    "PRODID:-//Consominas Gestao//PT",
    "VERSION:2.0",
    `METHOD:${opts.method}`,
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `SEQUENCE:${opts.sequence}`,
    `DTSTAMP:${toIcsDate(new Date())}`,
    opts.allDay
      ? `DTSTART;VALUE=DATE:${toIcsDate(opts.startAt).slice(0, 8)}`
      : `DTSTART:${toIcsDate(opts.startAt)}`,
    opts.allDay ? `DTEND;VALUE=DATE:${toIcsDate(end).slice(0, 8)}` : `DTEND:${toIcsDate(end)}`,
    `SUMMARY:${escapeIcsText(opts.title)}`,
    ...(opts.description ? [`DESCRIPTION:${escapeIcsText(opts.description)}`] : []),
    `ORGANIZER;CN=${escapeIcsText(opts.organizerName)}:mailto:${opts.organizerEmail}`,
    ...opts.attendees.map(
      (a) => `ATTENDEE;CN=${escapeIcsText(a.name)};ROLE=REQ-PARTICIPANT;RSVP=TRUE:mailto:${a.email}`
    ),
    `STATUS:${status}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.join("\r\n");
}

async function sendIcsMail(opts: {
  method: "REQUEST" | "CANCEL";
  uid: string;
  sequence: number;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  organizerEmail: string;
  organizerName: string;
  attendees: { email: string; name: string }[];
}) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  if (opts.attendees.length === 0) return;

  const ics = buildIcs(opts);
  const subjectPrefix = opts.method === "CANCEL" ? "Cancelado: " : "";

  try {
    await getTransporter().sendMail({
      from: `"${opts.organizerName}" <${opts.organizerEmail}>`,
      to: opts.attendees.map((a) => `"${a.name}" <${a.email}>`).join(", "),
      subject: `${subjectPrefix}${opts.title}`,
      text: opts.description || opts.title,
      icalEvent: {
        method: opts.method,
        filename: "convite.ics",
        content: ics,
      },
    });
  } catch (err) {
    console.error("Falha ao enviar convite por e-mail:", err);
  }
}

export async function sendMeetingInvite(opts: {
  eventId: string;
  sequence: number;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  organizerEmail: string;
  organizerName: string;
  attendees: { email: string; name: string }[];
}) {
  await sendIcsMail({
    method: "REQUEST",
    uid: `${opts.eventId}@gestao.consominas`,
    sequence: opts.sequence,
    title: opts.title,
    description: opts.description,
    startAt: opts.startAt,
    endAt: opts.endAt,
    allDay: opts.allDay,
    organizerEmail: opts.organizerEmail,
    organizerName: opts.organizerName,
    attendees: opts.attendees,
  });
}

export async function sendMeetingCancellation(opts: {
  eventId: string;
  sequence: number;
  title: string;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  organizerEmail: string;
  organizerName: string;
  attendees: { email: string; name: string }[];
}) {
  await sendIcsMail({
    method: "CANCEL",
    uid: `${opts.eventId}@gestao.consominas`,
    sequence: opts.sequence,
    title: opts.title,
    startAt: opts.startAt,
    endAt: opts.endAt,
    allDay: opts.allDay,
    organizerEmail: opts.organizerEmail,
    organizerName: opts.organizerName,
    attendees: opts.attendees,
  });
}
