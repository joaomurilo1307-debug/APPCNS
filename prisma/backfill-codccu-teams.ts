// Preenche Team.codccu extraindo o codigo do proprio nome da equipe, que
// desde o seed-senior-teams.ts / seed-contratos-projetos.ts sempre segue o
// padrao "${nome} [${codccu}]". One-off, idempotente (so atualiza quem
// ainda esta null), roda via RUN_BACKFILL_CODCCU=true.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function log(action: string, metadata: Record<string, unknown>) {
  try {
    await prisma.auditLog.create({ data: { action, entityType: "BackfillCodccuTeams", metadata: JSON.stringify(metadata) } });
  } catch {
    // nunca deixa o log quebrar o backfill
  }
}

async function main() {
  await log("backfill.codccu.iniciado", {});

  const times = await prisma.team.findMany({ where: { codccu: null } });
  let atualizados = 0;
  const semPadrao: string[] = [];

  for (const time of times) {
    const m = time.name.match(/\[([^\]]+)\]\s*$/);
    if (!m) {
      semPadrao.push(time.name);
      continue;
    }
    const codccu = m[1].trim();
    // se dois times já parseassem pro mesmo codigo (nao deveria acontecer),
    // o @unique do banco rejeita o segundo -- pega o erro e loga em vez de
    // derrubar o backfill inteiro
    try {
      await prisma.team.update({ where: { id: time.id }, data: { codccu } });
      atualizados++;
    } catch (e) {
      await log("backfill.codccu.conflito", { time: time.name, codccu, erro: String((e as Error)?.message || e) });
    }
  }

  const resumo = { totalTimes: times.length, atualizados, semPadrao };
  console.log(`Backfill codccu concluido: ${JSON.stringify(resumo)}`);
  await log("backfill.codccu.concluido", resumo);
}

main()
  .catch(async (e) => {
    console.error(e);
    await log("backfill.codccu.erro_fatal", { mensagem: String(e?.message || e), stack: String(e?.stack || "") });
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
