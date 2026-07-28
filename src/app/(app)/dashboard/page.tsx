import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { visibleTeamFilter, getUserTeamIds } from "@/lib/permissions";
import { eventTypeLabel, priorityColor } from "@/lib/calendarColors";
import OnlinePeopleWidget from "@/components/OnlinePeopleWidget";
import Avatar from "@/components/Avatar";
import Link from "next/link";

const MOTIVATIONAL_MESSAGES = [
  "Um passo de cada vez constrói o resultado do mês.",
  "Clareza no que importa hoje evita retrabalho amanhã.",
  "Processo bom é processo simples de seguir.",
  "O que não é medido não melhora — comece pelo básico.",
  "Prioridade não é fazer tudo, é fazer o que importa primeiro.",
  "Organização de hoje é velocidade de amanhã.",
  "Um problema bem entendido já está meio resolvido.",
  "Consistência vence intensidade no longo prazo.",
];

function greeting() {
  const h = new Date().getUTCHours() - 3;
  const hour = ((h % 24) + 24) % 24;
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

async function eventVisibility(userId: string, role: string, teamIds: string[]) {
  if (role === "ADMIN" || role === "DIRETOR") return {};
  if (role === "CLIENTE") {
    return { OR: [{ project: { clients: { some: { userId } } } }, { attendees: { some: { userId } } }] };
  }
  return {
    OR: [
      { project: { teamId: { in: teamIds } } },
      { creatorId: userId },
      { attendees: { some: { userId } } },
      { projectId: null, creatorId: userId },
    ],
  };
}

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  const userId = (session!.user as any).id;
  const role = (session!.user as any).role;
  const name = session!.user?.name ?? "";
  const teamFilter = await visibleTeamFilter(userId, role);
  const teamIds = await getUserTeamIds(userId);

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0));
  const todayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999));
  const dayOfYear = Math.floor((now.getTime() - new Date(Date.UTC(now.getUTCFullYear(), 0, 0)).getTime()) / 86400000);
  const motivational = MOTIVATIONAL_MESSAGES[dayOfYear % MOTIVATIONAL_MESSAGES.length];

  const evVisibility = await eventVisibility(userId, role, teamIds);

  const [projectCount, taskCounts, myTaskCount, todayEvents, myOpenTasks, myTeams] = await Promise.all([
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
    prisma.calendarEvent.findMany({
      where: { AND: [evVisibility, { startAt: { gte: todayStart, lte: todayEnd } }] },
      include: {
        creator: { select: { id: true, name: true, avatarColor: true } },
        attendees: { where: { userId }, select: { status: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.task.findMany({
      where: {
        assigneeId: userId,
        status: { not: "FEITO" },
        dueDate: { lte: todayEnd },
      },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { dueDate: "asc" },
      take: 12,
    }),
    prisma.team.findMany({
      where: { id: { in: teamIds } },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, avatarColor: true, cargo: true, role: true } } },
        },
      },
    }),
  ]);

  const agenda = todayEvents.filter((e) => {
    const mine = e.attendees[0];
    return !mine || mine.status !== "REJEITADO";
  });

  const statusMap = Object.fromEntries(taskCounts.map((t) => [t.status, t._count]));

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">
        {greeting()}, {name}
      </h1>
      <p className="mb-1 text-gray-500">
        {now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: "UTC" })}
      </p>
      <p className="mb-8 text-sm italic text-brand-dark/70">{motivational}</p>

      <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card label="Projetos" value={projectCount} />
        <Card label="A fazer" value={statusMap["A_FAZER"] ?? 0} />
        <Card label="Fazendo" value={statusMap["FAZENDO"] ?? 0} />
        <Card label="Minhas tarefas pendentes" value={myTaskCount} highlight />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Section title="📅 Agenda de hoje">
            {agenda.length === 0 && <p className="text-sm text-gray-400">Nada marcado para hoje.</p>}
            <div className="flex flex-col gap-2">
              {agenda.map((e) => (
                <div key={e.id} className="flex items-start gap-3 rounded-lg border border-gray-100 p-2.5 text-sm">
                  <span className="w-12 shrink-0 font-mono text-xs text-gray-400">
                    {e.allDay ? "Dia todo" : new Date(e.startAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "UTC" })}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{e.title}</p>
                    <p className="truncate text-xs text-gray-400">
                      {eventTypeLabel[e.type] ?? e.type} · {e.creator.name}
                      {e.project && ` · ${e.project.name}`}
                    </p>
                  </div>
                  {e.onlineMeetingUrl && (
                    <a
                      href={e.onlineMeetingUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 rounded-md bg-brand/10 px-2 py-1 text-xs font-medium text-brand-dark hover:bg-brand/20"
                    >
                      Entrar
                    </a>
                  )}
                </div>
              ))}
            </div>
          </Section>

          <Section title="✅ Suas atividades de hoje">
            {myOpenTasks.length === 0 && <p className="text-sm text-gray-400">Nenhuma pendência para hoje. 🎉</p>}
            <div className="flex flex-col gap-2">
              {myOpenTasks.map((t) => {
                const overdue = t.dueDate && new Date(t.dueDate) < todayStart;
                return (
                  <Link
                    key={t.id}
                    href={t.projectId ? `/projetos/${t.projectId}` : "/tarefas"}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 p-2.5 text-sm hover:bg-gray-50"
                  >
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: priorityColor[t.priority] ?? "#9ca3af" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{t.title}</p>
                      <p className="truncate text-xs text-gray-400">{t.project?.name ?? "Sem projeto"}</p>
                    </div>
                    {overdue && (
                      <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                        Atrasada
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </Section>
        </div>

        <div className="flex flex-col gap-6">
          <Section title="🟢 Pessoas online agora">
            <OnlinePeopleWidget currentUserId={userId} />
          </Section>

          <Section title="👥 Minha equipe">
            {myTeams.length === 0 && <p className="text-sm text-gray-400">Você ainda não está em nenhuma equipe.</p>}
            <div className="flex flex-col gap-4">
              {myTeams.map((team) => (
                <div key={team.id}>
                  <p className="mb-2 text-xs font-semibold text-gray-500"># {team.name}</p>
                  <div className="flex flex-col gap-2">
                    {team.members.map((m) => (
                      <div key={m.user.id} className="flex items-center gap-2 text-sm">
                        <Avatar name={m.user.name} color={m.user.avatarColor} size={24} />
                        <span className="flex-1 truncate">{m.user.name}</span>
                        <span className="shrink-0 text-xs text-gray-400">{m.user.cargo || m.role}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {children}
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
