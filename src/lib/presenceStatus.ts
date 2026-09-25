export const MANUAL_STATUSES = ["DISPONIVEL", "OCUPADO", "AUSENTE", "NAO_PERTURBE"] as const;
export type ManualStatus = (typeof MANUAL_STATUSES)[number];

export const statusLabel: Record<ManualStatus, string> = {
  DISPONIVEL: "Disponível",
  OCUPADO: "Ocupado",
  AUSENTE: "Ausente",
  NAO_PERTURBE: "Não perturbe",
};

export const statusColor: Record<ManualStatus, string> = {
  DISPONIVEL: "bg-green-500",
  OCUPADO: "bg-red-500",
  AUSENTE: "bg-yellow-400",
  NAO_PERTURBE: "bg-purple-500",
};

export function resolveStatus(online: boolean, statusManual?: string | null): { key: ManualStatus | "OFFLINE"; label: string; color: string } {
  if (statusManual && (MANUAL_STATUSES as readonly string[]).includes(statusManual)) {
    const key = statusManual as ManualStatus;
    return { key, label: statusLabel[key], color: statusColor[key] };
  }
  if (online) return { key: "DISPONIVEL", label: "Disponível", color: statusColor.DISPONIVEL };
  return { key: "OFFLINE", label: "Offline", color: "bg-gray-300" };
}
