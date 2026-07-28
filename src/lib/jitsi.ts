export function generateJitsiRoomUrl(seed: string) {
  const slug = seed.replace(/[^a-zA-Z0-9]/g, "").slice(0, 24);
  const random = Math.random().toString(36).slice(2, 10);
  return `https://meet.jit.si/Consominas-${slug || "Reuniao"}-${random}`;
}
