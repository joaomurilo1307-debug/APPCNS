// Limpeza a pedido do Joao (10/09/2026): apaga TODOS os projetos e TODAS
// as tarefas -- ele vai reconfigurar essas partes do zero. Nao mexe em
// equipes, nucleos, usuarios nem no resto. Backup do que existia:
// scratchpad/backup_projetos_2026-09-10_wipe.json (eram 30 projetos
// PLANEJADO/tasks=0 + 28 tarefas orfas de demo). Roda via RUN_WIPE_PROJ=true.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "WipeProjetosTarefas", metadata: JSON.stringify(metadata) } });
  } catch {
    /* nunca derruba */
  }
}

async function main() {
  const projAntes = await prisma.project.count();
  const tarAntes = await prisma.task.count();
  await log("wipe.iniciado", { projetos: projAntes, tarefas: tarAntes });

  // dependencias de cronograma primeiro (relacao entre tarefas)
  const dep = await prisma.taskDependency.deleteMany({});
  // tarefas (leva junto comentarios/anexos/subtarefas via cascade)
  const tar = await prisma.task.deleteMany({});
  // projetos (leva board/metas/marcos/riscos/decisoes/custom fields via cascade)
  const proj = await prisma.project.deleteMany({});

  const resumo = { dependenciasApagadas: dep.count, tarefasApagadas: tar.count, projetosApagados: proj.count };
  console.log("Wipe projetos/tarefas:", JSON.stringify(resumo));
  await log("wipe.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("wipe.erro_fatal", { mensagem: String(e?.message || e) });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
