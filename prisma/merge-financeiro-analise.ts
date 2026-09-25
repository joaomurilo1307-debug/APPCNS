// Funde "Análise e Estratégia" dentro de "Financeiro" -- Joao confirmou que
// sao a mesma area. Faz na EQUIPE e no NUCLEO. One-off, idempotente,
// roda via RUN_MERGE_FIN=true.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "MergeFinanceiroAnalise", metadata: JSON.stringify(metadata) } });
  } catch {
    /* nunca derruba o merge */
  }
}

async function fundirEquipe() {
  const alvo = await prisma.team.findFirst({ where: { name: { startsWith: "ADM Financeiro" } } });
  const origem = await prisma.team.findFirst({ where: { name: "Análise e Estratégia" } });
  if (!alvo) return { equipe: "alvo 'ADM Financeiro' nao encontrado -- nada feito" };
  if (!origem) return { equipe: "origem 'Análise e Estratégia' nao existe -- provavelmente ja fundida" };

  // membros
  const membrosOrigem = await prisma.userTeam.findMany({ where: { teamId: origem.id } });
  let membrosMovidos = 0;
  for (const m of membrosOrigem) {
    await prisma.userTeam.upsert({
      where: { userId_teamId: { userId: m.userId, teamId: alvo.id } },
      update: {},
      create: { userId: m.userId, teamId: alvo.id, role: m.role },
    });
    membrosMovidos++;
  }
  await prisma.userTeam.deleteMany({ where: { teamId: origem.id } });

  // projetos (Project.team tem onDelete: Cascade -- tem que mover ANTES do delete)
  const proj = await prisma.project.updateMany({ where: { teamId: origem.id }, data: { teamId: alvo.id } });

  // metas apontadas pra equipe origem (relacao opcional, SetNull -- so realoca)
  await prisma.goal.updateMany({ where: { assignedTeamId: origem.id }, data: { assignedTeamId: alvo.id } });

  await prisma.team.update({
    where: { id: alvo.id },
    data: { name: alvo.name.replace("ADM Financeiro", "ADM Financeiro / Análise e Estratégia") },
  });

  try {
    await prisma.team.delete({ where: { id: origem.id } });
  } catch (e) {
    return { equipe: `membros ${membrosMovidos}, projetos ${proj.count} movidos; delete falhou: ${String((e as Error).message).slice(0, 140)}` };
  }
  return { equipe: `fundida -- ${membrosMovidos} membros, ${proj.count} projetos movidos` };
}

async function fundirNucleo() {
  const alvo = await prisma.nucleo.findFirst({ where: { name: "Financeiro" } });
  const origem = await prisma.nucleo.findFirst({ where: { name: "Análise e Estratégia" } });
  if (!alvo) return { nucleo: "alvo 'Financeiro' nao encontrado -- nada feito" };
  if (!origem) return { nucleo: "origem 'Análise e Estratégia' nao existe -- provavelmente ja fundida" };

  const membros = await prisma.user.updateMany({ where: { nucleoId: origem.id }, data: { nucleoId: alvo.id } });

  // relacoes m2m (gerentes, projetos) -- reconecta o que apontava pra origem
  const comGerente = await prisma.nucleo.findUnique({ where: { id: origem.id }, include: { gerentes: true, projetos: true } });
  if (comGerente) {
    for (const g of comGerente.gerentes) {
      await prisma.nucleo.update({ where: { id: alvo.id }, data: { gerentes: { connect: { id: g.id } } } });
    }
    for (const p of comGerente.projetos) {
      await prisma.nucleo.update({ where: { id: alvo.id }, data: { projetos: { connect: { id: p.id } } } });
    }
    await prisma.nucleo.update({
      where: { id: origem.id },
      data: {
        gerentes: { set: [] },
        projetos: { set: [] },
      },
    });
  }

  await prisma.nucleo.update({ where: { id: alvo.id }, data: { name: "Financeiro / Análise e Estratégia" } });

  try {
    await prisma.nucleo.delete({ where: { id: origem.id } });
  } catch (e) {
    return { nucleo: `${membros.count} membros movidos; delete falhou: ${String((e as Error).message).slice(0, 140)}` };
  }
  return { nucleo: `fundido -- ${membros.count} membros movidos` };
}

async function main() {
  await log("merge.fin.iniciado", {});
  const eq = await fundirEquipe();
  const nu = await fundirNucleo();
  const resumo = { ...eq, ...nu };
  console.log("Merge Financeiro/Análise:", JSON.stringify(resumo));
  await log("merge.fin.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("merge.fin.erro_fatal", { mensagem: String(e?.message || e) });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
