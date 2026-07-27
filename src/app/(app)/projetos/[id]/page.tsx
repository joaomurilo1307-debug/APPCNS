import { prisma } from "@/lib/prisma";
import KanbanBoard from "@/components/KanbanBoard";
import { notFound } from "next/navigation";

export default async function ProjectDetailPage({ params }: { params: { id: string } }) {
  const project = await prisma.project.findUnique({
    where: { id: params.id },
    include: { team: true, owner: { select: { name: true } } },
  });
  if (!project) notFound();

  return (
    <div>
      <h1 className="text-2xl font-semibold">{project.name}</h1>
      <p className="mb-6 text-sm text-gray-500">
        {project.team.name} · Responsável: {project.owner.name}
      </p>
      <KanbanBoard projectId={project.id} />
    </div>
  );
}
