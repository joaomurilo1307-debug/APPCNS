import { prisma } from "@/lib/prisma";

export async function logAudit(entry: {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
}) {
  try {
    await prisma.auditLog.create({
      data: {
        userId: entry.userId ?? null,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      },
    });
  } catch {
    // auditoria nunca deve derrubar a operação principal
  }
}
