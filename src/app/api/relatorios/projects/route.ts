import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleProjectWhere } from "@/lib/permissions";
import { computePercentComplete } from "@/lib/progress";

function hoursSpent(actualStartedAt: Date | null, actualEndedAt: Date | null): number {
  if (!actualStartedAt) return 0;
  const end = actualEndedAt ?? new Date();
  return Math.max(0, (end.getTime() - actualStartedAt.getTime()) / 3_600_000);
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const userId = (session.user as any).id;
  const role = (session.user as any).role;
  const where = role === "CLIENTE" ? { clients: { some: { userId } } } : await visibleProjectWhere(userId, role);

  const projects = await prisma.project.findMany({
    where,
    include: {
      team: { select: { id: true, name: true } },
      nucleos: { select: { id: true, name: true } },
      diretores: { select: { id: true, name: true } },
      coordenadores: { select: { id: true, name: true } },
      resourceRates: true,
      tasks: {
        select: { id: true, status: true, dueDate: true, assigneeId: true, actualStartedAt: true, actualEndedAt: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const now = new Date();
  const result = projects.map((p) => {
    const rateByUser = new Map(p.resourceRates.map((r) => [r.userId, r.hourlyRate]));
    const taskCounts = { A_FAZER: 0, FAZENDO: 0, BLOQUEADO: 0, FEITO: 0 } as Record<string, number>;
    let overdueCount = 0;
    let totalHours = 0;
    let totalCost = 0;
    for (const t of p.tasks) {
      taskCounts[t.status] = (taskCounts[t.status] ?? 0) + 1;
      if (t.dueDate && t.status !== "FEITO" && new Date(t.dueDate) < now) overdueCount++;
      const h = hoursSpent(t.actualStartedAt, t.actualEndedAt);
      totalHours += h;
      if (t.assigneeId) totalCost += h * (rateByUser.get(t.assigneeId) ?? 0);
    }
    return {
      id: p.id,
      name: p.name,
      status: p.status,
      team: p.team,
      nucleos: p.nucleos,
      diretores: p.diretores,
      coordenadores: p.coordenadores,
      percentComplete: computePercentComplete(p.tasks),
      taskCount: p.tasks.length,
      taskCounts,
      overdueCount,
      totalHours,
      totalCost,
      startDate: p.startDate,
      endDate: p.endDate,
    };
  });

  return NextResponse.json(result);
}
