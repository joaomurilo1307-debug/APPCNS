import { prisma } from "@/lib/prisma";

const TENANT_ID = process.env.AZURE_TENANT_ID!;
const CLIENT_ID = process.env.AZURE_CLIENT_ID!;
const CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET!;

const SCOPES = "offline_access Calendars.ReadWrite User.Read";

export function outlookRedirectUri() {
  return `https://${process.env.APP_DOMAIN}/api/integrations/outlook/callback`;
}

export function getAuthorizeUrl(state: string) {
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: outlookRedirectUri(),
    response_mode: "query",
    scope: SCOPES,
    state,
    // Forca a tela de selecao de conta da Microsoft em vez de reaproveitar
    // silenciosamente a sessao ja logada no navegador (ex: conta admin usada antes).
    prompt: "select_account",
  });
  return `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(`https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      ...body,
    }),
  });
  if (!res.ok) throw new Error(`Microsoft token error: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  }>;
}

export async function exchangeCodeForToken(code: string) {
  return tokenRequest({
    grant_type: "authorization_code",
    code,
    redirect_uri: outlookRedirectUri(),
    scope: SCOPES,
  });
}

async function refreshToken(refresh_token: string) {
  return tokenRequest({
    grant_type: "refresh_token",
    refresh_token,
    scope: SCOPES,
  });
}

export async function getValidAccessToken(userId: string): Promise<string | null> {
  const account = await prisma.outlookAccount.findUnique({ where: { userId } });
  if (!account) return null;

  if (account.expiresAt.getTime() > Date.now() + 60_000) {
    return account.accessToken;
  }

  const refreshed = await refreshToken(account.refreshToken);
  const expiresAt = new Date(Date.now() + refreshed.expires_in * 1000);
  await prisma.outlookAccount.update({
    where: { userId },
    data: {
      accessToken: refreshed.access_token,
      refreshToken: refreshed.refresh_token ?? account.refreshToken,
      expiresAt,
    },
  });
  return refreshed.access_token;
}

async function graphFetch(userId: string, path: string, init?: RequestInit) {
  const token = await getValidAccessToken(userId);
  if (!token) throw new Error("Usuário não conectou o Outlook");
  const res = await fetch(`https://graph.microsoft.com/v1.0${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  return res;
}

function toGraphEvent(
  e: {
    title: string;
    description?: string | null;
    startAt: Date;
    endAt: Date | null;
    allDay: boolean;
    attendeeEmails?: string[];
  },
  reminderMinutesBeforeStart?: number,
  withTeamsMeeting?: boolean
) {
  const end = e.endAt ?? new Date(e.startAt.getTime() + 30 * 60 * 1000);
  return {
    subject: e.title,
    body: { contentType: "Text", content: e.description ?? "" },
    start: { dateTime: e.startAt.toISOString(), timeZone: "America/Sao_Paulo" },
    end: { dateTime: end.toISOString(), timeZone: "America/Sao_Paulo" },
    isAllDay: e.allDay,
    ...(reminderMinutesBeforeStart !== undefined
      ? { isReminderOn: true, reminderMinutesBeforeStart }
      : {}),
    ...(withTeamsMeeting ? { isOnlineMeeting: true, onlineMeetingProvider: "teamsForBusiness" } : {}),
    ...(e.attendeeEmails?.length
      ? {
          attendees: e.attendeeEmails.map((email) => ({
            emailAddress: { address: email },
            type: "required",
          })),
        }
      : {}),
  };
}

export async function pushCreateEvent(
  userId: string,
  event: { title: string; description?: string | null; startAt: Date; endAt: Date | null; allDay: boolean; attendeeEmails?: string[] },
  reminderMinutesBeforeStart?: number,
  withTeamsMeeting?: boolean
): Promise<{ outlookEventId: string; onlineMeetingUrl: string | null } | null> {
  try {
    const res = await graphFetch(userId, "/me/events", {
      method: "POST",
      body: JSON.stringify(toGraphEvent(event, reminderMinutesBeforeStart, withTeamsMeeting)),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { outlookEventId: data.id as string, onlineMeetingUrl: data.onlineMeeting?.joinUrl ?? null };
  } catch {
    return null;
  }
}

export async function pushUpdateEvent(
  userId: string,
  outlookEventId: string,
  event: { title: string; description?: string | null; startAt: Date; endAt: Date | null; allDay: boolean; attendeeEmails?: string[] },
  reminderMinutesBeforeStart?: number,
  withTeamsMeeting?: boolean
): Promise<{ onlineMeetingUrl: string | null } | null> {
  try {
    const res = await graphFetch(userId, `/me/events/${outlookEventId}`, {
      method: "PATCH",
      body: JSON.stringify(toGraphEvent(event, reminderMinutesBeforeStart, withTeamsMeeting)),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return { onlineMeetingUrl: data.onlineMeeting?.joinUrl ?? null };
  } catch {
    return null;
  }
}

export async function pushDeleteEvent(userId: string, outlookEventId: string) {
  try {
    await graphFetch(userId, `/me/events/${outlookEventId}`, { method: "DELETE" });
  } catch {
    // best-effort sync
  }
}

export async function fetchMe(userId: string) {
  const res = await graphFetch(userId, "/me?$select=mail,userPrincipalName");
  if (!res.ok) return null;
  const data = await res.json();
  return (data.mail ?? data.userPrincipalName) as string;
}

export async function pullEvents(userId: string) {
  const account = await prisma.outlookAccount.findUnique({ where: { userId } });
  if (!account) return { pulled: 0, debug: ["Usuário não tem OutlookAccount conectado"] };

  const url =
    account.deltaLink ??
    "/me/calendarView/delta?startDateTime=" +
      encodeURIComponent(new Date(Date.now() - 30 * 86400000).toISOString()) +
      "&endDateTime=" +
      encodeURIComponent(new Date(Date.now() + 180 * 86400000).toISOString());

  let nextUrl = url.startsWith("http") ? url : `https://graph.microsoft.com/v1.0${url}`;
  let pulled = 0;
  let deltaLink: string | null = null;
  const debug: string[] = [];
  let pageCount = 0;

  while (nextUrl) {
    pageCount++;
    if (pageCount > 20) {
      debug.push("Interrompido após 20 páginas (limite de segurança)");
      break;
    }
    const token = await getValidAccessToken(userId);
    if (!token) {
      debug.push("Token de acesso inválido/expirado ao chamar " + nextUrl);
      break;
    }
    const res: Response = await fetch(nextUrl, {
      headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="America/Sao_Paulo"' },
    });
    if (!res.ok) {
      const errorBody = await res.text();
      debug.push(`Graph respondeu ${res.status} para ${nextUrl}: ${errorBody.slice(0, 500)}`);
      break;
    }
    const data = await res.json();
    debug.push(`Página ${pageCount}: ${data.value?.length ?? 0} item(ns)`);

    for (const item of data.value ?? []) {
      if (item["@removed"]) {
        await prisma.calendarEvent.deleteMany({ where: { outlookEventId: item.id } });
        continue;
      }
      const startAt = new Date(item.start.dateTime + "Z");
      const endAt = item.end ? new Date(item.end.dateTime + "Z") : null;
      const existing = await prisma.calendarEvent.findUnique({ where: { outlookEventId: item.id } });
      if (existing) {
        await prisma.calendarEvent.update({
          where: { id: existing.id },
          data: { title: item.subject || "(sem título)", startAt, endAt, allDay: !!item.isAllDay },
        });
      } else {
        await prisma.calendarEvent.create({
          data: {
            title: item.subject || "(sem título)",
            type: "COMPROMISSO",
            startAt,
            endAt,
            allDay: !!item.isAllDay,
            creatorId: userId,
            outlookEventId: item.id,
          },
        });
      }
      pulled++;
    }

    if (data["@odata.nextLink"]) {
      nextUrl = data["@odata.nextLink"];
    } else {
      deltaLink = data["@odata.deltaLink"] ?? null;
      nextUrl = "";
    }
  }

  if (deltaLink) {
    await prisma.outlookAccount.update({ where: { userId }, data: { deltaLink } });
    debug.push("deltaLink salvo para a próxima sincronização");
  }

  return { pulled, debug };
}
