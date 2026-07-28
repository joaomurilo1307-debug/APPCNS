import { AVATAR_PALETTE } from "@/components/Avatar";

export function hashColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

export const priorityColor: Record<string, string> = {
  BAIXA: "#9ca3af",
  MEDIA: "#3b82f6",
  ALTA: "#f97316",
  URGENTE: "#dc2626",
};

export const eventTypeColor: Record<string, string> = {
  REUNIAO: "#2563eb",
  COMPROMISSO: "#7e22ce",
  ENTREGA: "#15803d",
  PRAZO: "#dc2626",
  OUTRO: "#6b7280",
};

export const eventTypeLabel: Record<string, string> = {
  REUNIAO: "Reunião",
  COMPROMISSO: "Compromisso",
  ENTREGA: "Entrega",
  PRAZO: "Prazo",
  OUTRO: "Outro",
};

export type ColorBy = "prioridade" | "responsavel" | "projeto";

export type CalItem = {
  id: string;
  kind: "task" | "event";
  title: string;
  start: Date;
  end: Date | null;
  allDay: boolean;
  projectId: string | null;
  projectName: string | null;
  priority?: string;
  type?: string;
  personName: string | null;
  personColor: string | null;
  locked?: boolean;
};

export function colorFor(item: CalItem, colorBy: ColorBy) {
  if (colorBy === "projeto") {
    return item.projectId ? hashColor(item.projectId) : "#9ca3af";
  }
  if (colorBy === "responsavel") {
    return item.personColor || hashColor(item.personName || "sem-responsavel");
  }
  if (item.kind === "task") return priorityColor[item.priority ?? "MEDIA"] ?? "#9ca3af";
  return eventTypeColor[item.type ?? "OUTRO"];
}
