export const CALL_MESSAGE_PREFIX = "📹 Chamada iniciada";

export function buildCallMessage(url: string) {
  return `${CALL_MESSAGE_PREFIX} — entre pelo link: ${url}`;
}

export function extractCallUrl(body: string): string | null {
  if (!body.startsWith(CALL_MESSAGE_PREFIX)) return null;
  const match = body.match(/https?:\/\/\S+/);
  return match ? match[0] : null;
}
