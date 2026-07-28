import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleTeamFilter, getUserTeamIds } from "@/lib/permissions";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = (session!.user as any).id;
  const role = (session!.user as any).role;
  const teamFilter = await visibleTeamFilter(userId, role);
  const teamIds = await getUserTeamIds(userId);

  const [projectCount, taskCounts, myTaskCount] = await Promise.all([
    prisma.project.count({ where: teamFilter }),
    prisma.task.groupBy({
      by: ["status"],
      _count: true,
      where:
        role === "ADMIN" || role === "DIRETOR"
          ? {}
          : { OR: [{ project: { teamId: { in: teamIds } } }, { projectId: null, assigneeId: userId }] },
    }),
    prisma.task.count({ where: { assigneeId: userId, status: { not: "FEITO" } } }),
  ]);

  const statusMap = Object.fromEntries(taskCounts.map((t) => [t.status, t._count]));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Olá, {session!.user?.name}</h1>
      <p className="mb-8 text-gray-500">Visão geral das suas rotinas e projetos.</p>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Projetos" value={projectCount} />
        <Card label="A fazer" value={statusMap["A_FAZER"] ?? 0} />
        <Card label="Fazendo" value={statusMap["FAZENDO"] ?? 0} />
        <Card label="Minhas tarefas pendentes" value={myTaskCount} highlight />
      </div>
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div
      className={`rounded-xl border p-5 shadow-sm ${
        highlight ? "border-brand bg-brand/5" : "border-gray-200 bg-white"
      }`}
    >
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}
