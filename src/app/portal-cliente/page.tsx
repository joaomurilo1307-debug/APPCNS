import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const statusLabel: Record<string, string> = {
  PLANEJADO: "Planejado",
  EM_ANDAMENTO: "Em andamento",
  PAUSADO: "Pausado",
  CONCLUIDO: "Concluído",
};

export default async function PortalClientePage() {
  const session = await getServerSession(authOptions);
  const userId = (session!.user as any).id;

  const projects = await prisma.project.findMany({
    where: { clients: { some: { userId } } },
    include: {
      tasks: { select: { status: true } },
    },
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-semibold">Seus projetos</h1>
      <p className="mb-6 text-sm text-gray-500">Acompanhamento — visão somente leitura.</p>

      <div className="grid gap-4">
        {projects.map((p) => {
          const total = p.tasks.length;
          const done = p.tasks.filter((t) => t.status === "FEITO").length;
          const pct = total ? Math.round((done / total) * 100) : 0;
          return (
            <div key={p.id} className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">{p.name}</h2>
                <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                  {statusLabel[p.status]}
                </span>
              </div>
              {p.description && <p className="mb-3 text-sm text-gray-500">{p.description}</p>}
              <div className="h-2 w-full rounded-full bg-gray-100">
                <div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-2 text-xs text-gray-400">{pct}% concluído ({done}/{total} tarefas)</p>
            </div>
          );
        })}
        {projects.length === 0 && (
          <p className="text-sm text-gray-400">Nenhum projeto vinculado a você ainda.</p>
        )}
      </div>
    </div>
  );
}
