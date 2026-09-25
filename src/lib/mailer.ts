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

function formatEventWhen(startAt: Date, allDay: boolean) {
  return allDay
    ? startAt.toLocaleDateString("pt-BR", { timeZone: "UTC" })
    : startAt.toLocaleString("pt-BR", { timeZone: "UTC" });
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
  const when = formatEventWhen(opts.startAt, opts.allDay);
  const appUrl = process.env.APP_DOMAIN ? `https://${process.env.APP_DOMAIN}/aprovacoes` : null;

  let subject: string;
  let text: string;
  if (opts.method === "CANCEL") {
    subject = `Cancelado: ${opts.title}`;
    text = `A reunião "${opts.title}" (${when}) foi cancelada por ${opts.organizerName}.`;
  } else {
    subject = `Reunião pendente de aprovação: ${opts.title}`;
    text = [
      `${opts.organizerName} convidou você para a reunião "${opts.title}", em ${when}.`,
      opts.description ? `\n${opts.description}` : "",
      `\nEssa reunião está aguardando sua confirmação.`,
      appUrl ? `Acesse ${appUrl} (aba Aprovações) para aceitar ou recusar, ou responda diretamente pelo convite em anexo.` : "",
    ].filter(Boolean).join("\n");
  }

  try {
    await getTransporter().sendMail({
      from: `"${opts.organizerName}" <${opts.organizerEmail}>`,
      to: opts.attendees.map((a) => `"${a.name}" <${a.email}>`).join(", "),
      subject,
      text,
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

export async function sendNotificationEmail(opts: {
  to: { email: string; name: string }[];
  subject: string;
  text: string;
}) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;
  if (opts.to.length === 0) return;

  try {
    await getTransporter().sendMail({
      from: `"Consominas Gestão" <${process.env.SMTP_USER}>`,
      to: opts.to.map((a) => `"${a.name}" <${a.email}>`).join(", "),
      subject: opts.subject,
      text: opts.text,
    });
  } catch (err) {
    console.error("Falha ao enviar e-mail de notificação:", err);
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

export async function sendGuestInvite(opts: {
  eventId: string;
  sequence: number;
  title: string;
  description?: string | null;
  startAt: Date;
  endAt: Date | null;
  allDay: boolean;
  organizerEmail: string;
  organizerName: string;
  guestEmail: string;
  guestName: string;
  inviteLink: string;
}) {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const ics = buildIcs({
    uid: `${opts.eventId}-guest-${opts.guestEmail}@gestao.consominas`,
    sequence: opts.sequence,
    method: "REQUEST",
    title: opts.title,
    description: opts.description,
    startAt: opts.startAt,
    endAt: opts.endAt,
    allDay: opts.allDay,
    organizerEmail: opts.organizerEmail,
    organizerName: opts.organizerName,
    attendees: [{ email: opts.guestEmail, name: opts.guestName }],
  });
  const when = formatEventWhen(opts.startAt, opts.allDay);

  try {
    await getTransporter().sendMail({
      from: `"${opts.organizerName}" <${opts.organizerEmail}>`,
      to: `"${opts.guestName}" <${opts.guestEmail}>`,
      subject: `Convite: ${opts.title}`,
      text: [
        `${opts.organizerName} convidou você para "${opts.title}", em ${when}.`,
        opts.description ? `\n${opts.description}` : "",
        `\nConfirme sua presença pelo link abaixo (não precisa de login):`,
        opts.inviteLink,
      ].filter(Boolean).join("\n"),
      icalEvent: {
        method: "REQUEST",
        filename: "convite.ics",
        content: ics,
      },
    });
  } catch (err) {
    console.error("Falha ao enviar convite pra convidado externo:", err);
  }
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
